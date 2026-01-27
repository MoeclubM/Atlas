package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"atlas/shared/protocol"
	"atlas/web/internal/database"
	"atlas/web/internal/model"
	"atlas/web/internal/websocket"
)

// TaskHandler 任务处理器
type TaskHandler struct {
	db  *database.Database
	hub *websocket.Hub
}

// NewTaskHandler 创建任务处理器
func NewTaskHandler(db *database.Database, hub *websocket.Hub) *TaskHandler {
	return &TaskHandler{db: db, hub: hub}
}

func blockedByPolicy(target string, blocked []*net.IPNet, ipVersion string) bool {
	host := extractTargetHost(target)
	if host == "" {
		return false
	}

	if ip := net.ParseIP(stripIPv6Zone(host)); ip != nil {
		return ipInBlockedNetworks(ip, blocked)
	}

	ips, err := resolveHostIPsForVersion(host, ipVersion)
	if err != nil {
		return false
	}
	for _, ip := range ips {
		if ipInBlockedNetworks(ip, blocked) {
			return true
		}
	}
	return false
}

func resolveHostIPsForVersion(host, ipVersion string) ([]net.IP, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	switch ipVersion {
	case "ipv4":
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
		if err != nil {
			return nil, err
		}
		return ips, nil
	case "ipv6":
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip6", host)
		if err != nil {
			return nil, err
		}
		return ips, nil
	default: // auto: prefer ipv4
		ips4, err4 := net.DefaultResolver.LookupIP(ctx, "ip4", host)
		if err4 == nil && len(ips4) > 0 {
			return ips4, nil
		}
		ips6, err6 := net.DefaultResolver.LookupIP(ctx, "ip6", host)
		if err6 != nil {
			if err4 != nil {
				return nil, err4
			}
			return nil, err6
		}
		return ips6, nil
	}
}

func ipInBlockedNetworks(ip net.IP, blocked []*net.IPNet) bool {
	if ip == nil {
		return false
	}
	for _, n := range blocked {
		if n != nil && n.Contains(ip) {
			return true
		}
	}
	return false
}

func stripIPv6Zone(host string) string {
	if i := strings.IndexByte(host, '%'); i > 0 {
		return host[:i]
	}
	return host
}

func extractTargetHost(target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return ""
	}

	if strings.Contains(target, "://") {
		u, err := url.Parse(target)
		if err == nil {
			if h := u.Hostname(); h != "" {
				return h
			}
		}
	}

	if strings.Contains(target, "/") {
		u, err := url.Parse("http://" + target)
		if err == nil {
			if h := u.Hostname(); h != "" {
				return h
			}
		}
	}

	// [ipv6] or [ipv6]:port
	if strings.HasPrefix(target, "[") {
		if i := strings.Index(target, "]"); i > 1 {
			host := target[1:i]
			if host != "" {
				return host
			}
		}
	}

	if host, _, err := net.SplitHostPort(target); err == nil {
		return host
	}

	// 未带端口的 IPv6（包含多个冒号）
	if strings.Count(target, ":") >= 2 {
		return target
	}

	return target
}

// CreateTask 创建任务
// POST /api/tasks
func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req struct {
		TaskType       string                 `json:"task_type" binding:"required"`
		Mode           string                 `json:"mode" binding:"required"` // single/continuous
		Target         string                 `json:"target" binding:"required"`
		Parameters     map[string]interface{} `json:"parameters"`
		AssignedProbes []string               `json:"assigned_probes"`
		Priority       int                    `json:"priority"`
		IPVersion      string                 `json:"ip_version"` // auto/ipv4/ipv6
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ipVersion := req.IPVersion
	if ipVersion == "" && req.Parameters != nil {
		if v, ok := req.Parameters["ip_version"].(string); ok {
			ipVersion = v
		}
	}
	if ipVersion != "" {
		if req.Parameters == nil {
			req.Parameters = map[string]interface{}{}
		}
		if _, exists := req.Parameters["ip_version"]; !exists {
			req.Parameters["ip_version"] = ipVersion
		}
	}

	blocked, _ := h.db.GetConfig("blocked_networks")
	blocked = normalizeBlockedNetworks(blocked)
	if blocked != "" {
		nets, err := parseBlockedNetworks(blocked)
		if err == nil {
			if blockedByPolicy(req.Target, nets, ipVersion) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Target is blocked"})
				return
			}
		}
	}

	// http_test 仅允许 single
	if req.TaskType == "http_test" && req.Mode != "single" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "http_test only supports single mode"})
		return
	}

	// traceroute/mtr: 必须指定 probe（否则很容易出现“不可用/没结果”的体验）
	if (req.TaskType == "traceroute" || req.TaskType == "mtr") && len(req.AssignedProbes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assigned_probes required for traceroute/mtr"})
		return
	}

	// traceroute/mtr: 验证 probe online + capability
	if req.TaskType == "traceroute" || req.TaskType == "mtr" {
		for _, pid := range req.AssignedProbes {
			if pid == "" {
				continue
			}
			if !h.hub.IsProbeOnline(pid) {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("probe %s is offline", pid)})
				return
			}
			caps, err := h.db.GetProbeCapabilities(pid)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("failed to load probe capabilities: %v", err)})
				return
			}
			supported := false
			for _, cap := range caps {
				if cap == req.TaskType || cap == "all" {
					supported = true
					break
				}
			}
			if !supported {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("probe %s does not support %s", pid, req.TaskType)})
				return
			}
		}
	}

	// tcp_ping: 强制要求 host:port 或 [ipv6]:port
	if req.TaskType == "tcp_ping" {
		host, portStr, err := net.SplitHostPort(strings.TrimSpace(req.Target))
		if err != nil || host == "" || portStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tcp_ping target must be host:port or [ipv6]:port"})
			return
		}
		var port int
		if _, err := fmt.Sscanf(portStr, "%d", &port); err != nil || port < 1 || port > 65535 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tcp port"})
			return
		}
		// probe 侧不再使用 parameters.port，避免前后端不一致
		if req.Parameters != nil {
			delete(req.Parameters, "port")
		}
	}

	// continuous 仅支持 ping/tcp_ping/mtr
	if req.Mode == "continuous" {
		if req.TaskType != "icmp_ping" && req.TaskType != "tcp_ping" && req.TaskType != "mtr" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "continuous mode only supports icmp_ping, tcp_ping, and mtr"})
			return
		}
	}

	// 构建任务
	parametersJSON, _ := json.Marshal(req.Parameters)
	assignedProbesJSON, _ := json.Marshal(req.AssignedProbes)

	task := &model.Task{
		TaskID:         uuid.New().String(),
		TaskType:       req.TaskType,
		Mode:           req.Mode,
		Target:         req.Target,
		Parameters:     string(parametersJSON),
		AssignedProbes: string(assignedProbesJSON),
		Status:         "pending",
		Priority:       req.Priority,
	}

	if req.Priority == 0 {
		task.Priority = 5 // 默认优先级
	}

	// 如果是持续任务，先把 next_run_at 设为现在（调度器会根据策略更新）
	if req.Mode == "continuous" {
		nextRun := time.Now()
		task.NextRunAt = &nextRun
	}

	// (校验已提前在构建 task 前完成)

	if err := h.db.CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// ListTasks 列出任务
// GET /api/tasks
func (h *TaskHandler) ListTasks(c *gin.Context) {
	status := c.Query("status")
	limit := 100
	offset := 0

	if l := c.Query("limit"); l != "" {
		var parsedLimit int
		if _, err := fmt.Sscanf(l, "%d", &parsedLimit); err == nil {
			limit = parsedLimit
		}
	}

	if o := c.Query("offset"); o != "" {
		var parsedOffset int
		if _, err := fmt.Sscanf(o, "%d", &parsedOffset); err == nil {
			offset = parsedOffset
		}
	}

	tasks, err := h.db.ListTasks(status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list tasks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"total": len(tasks),
	})
}

// GetTask 获取任务详情
// GET /api/tasks/:id
func (h *TaskHandler) GetTask(c *gin.Context) {
	taskID := c.Param("id")

	task, err := h.db.GetTask(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	// 获取执行记录
	executions, _ := h.db.ListExecutionsByTask(taskID)

	// 获取结果
	results, _ := h.db.ListResultsByTask(taskID, 100, 0)

	c.JSON(http.StatusOK, gin.H{
		"task":       task,
		"executions": executions,
		"results":    results,
	})
}

// CancelTask 取消任务
// DELETE /api/tasks/:id
func (h *TaskHandler) CancelTask(c *gin.Context) {
	taskID := c.Param("id")

	// 获取任务信息
	_, err := h.db.GetTask(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	// 更新任务状态为取消
	if err := h.db.UpdateTaskStatus(taskID, "cancelled"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel task"})
		return
	}

	// 获取任务的执行记录
	executions, err := h.db.ListExecutionsByTask(taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Task cancelled"})
		return
	}

	// 向所有正在执行该任务的探针发送取消消息
	for _, exec := range executions {
		if exec.Status == "running" || exec.Status == "pending" {
			cancelMsg := protocol.TaskCancelMessage{
				ExecutionID: exec.ExecutionID,
				TaskID:      taskID,
				Reason:      "User requested cancellation",
			}

			if err := h.hub.SendToProbe(exec.ProbeID, protocol.MsgTypeTaskCancel, cancelMsg); err != nil {
				// 探针可能离线，记录日志但继续处理
				fmt.Printf("[TaskHandler] Failed to send cancel to probe %s: %v\n", exec.ProbeID, err)
			}

			// 更新执行记录状态
			now := time.Now()
			exec.Status = "cancelled"
			exec.CompletedAt = &now
			h.db.UpdateExecution(exec)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Task cancelled"})
}

// ListExecutions 列出执行记录
// GET /api/executions
func (h *TaskHandler) ListExecutions(c *gin.Context) {
	taskID := c.Query("task_id")
	// probeID := c.Query("probe_id") // 目前数据库层只支持按taskID查询

	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_id required"})
		return
	}

	executions, err := h.db.ListExecutionsByTask(taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list executions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"executions": executions,
		"total":      len(executions),
	})
}
