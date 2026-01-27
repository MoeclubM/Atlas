package scheduler

import (
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"atlas/shared/protocol"
	"atlas/web/internal/database"
	"atlas/web/internal/model"
	"atlas/web/internal/websocket"
)

// Scheduler 任务调度器
type Scheduler struct {
	db       *database.Database
	hub      *websocket.Hub
	interval time.Duration
	stopChan chan struct{}
}

// New 创建新的调度器
func New(db *database.Database, hub *websocket.Hub, scanInterval int) *Scheduler {
	return &Scheduler{
		db:       db,
		hub:      hub,
		interval: time.Duration(scanInterval) * time.Second,
		stopChan: make(chan struct{}),
	}
}

// Start 启动调度器
func (s *Scheduler) Start() {
	log.Println("[Scheduler] Starting scheduler...")

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.scanAndSchedule()
		case <-s.stopChan:
			log.Println("[Scheduler] Scheduler stopped")
			return
		}
	}
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	close(s.stopChan)
}

// scanAndSchedule 扫描并调度任务
func (s *Scheduler) scanAndSchedule() {
	// 1. 获取待执行的单次任务
	tasks, err := s.db.GetPendingTasks(time.Now())
	if err != nil {
		log.Printf("[Scheduler] Failed to get pending tasks: %v", err)
		return
	}

	for _, task := range tasks {
		if err := s.assignTask(task); err != nil {
			log.Printf("[Scheduler] Failed to assign task %s: %v", task.TaskID, err)
		}
	}

	// 2. 获取需要运行的持续任务
	continuousTasks, err := s.db.GetDueContinuousTasks(time.Now())
	if err != nil {
		log.Printf("[Scheduler] Failed to get continuous tasks: %v", err)
		return
	}

	for _, task := range continuousTasks {
		s.maybeTriggerContinuousICMPMTR(task)
		if err := s.assignTask(task); err != nil {
			log.Printf("[Scheduler] Failed to assign continuous task %s: %v", task.TaskID, err)
		}

		// 更新下次运行时间
		s.updateNextRun(task)
	}
}

func (s *Scheduler) maybeTriggerContinuousICMPMTR(task *model.Task) {
	if task.Mode != "continuous" || task.TaskType != "icmp_ping" {
		return
	}

	// 为 continuous icmp_ping：对每个 probe 只触发一次 mtr
	type scheduleState struct {
		RunCount            int      `json:"run_count"`
		IntervalSeconds     int      `json:"interval_seconds"`
		MTRTriggeredProbes  []string `json:"mtr_triggered_probes,omitempty"`
		MTRTriggeredTaskIDs []string `json:"mtr_triggered_task_ids,omitempty"`
	}
	state := scheduleState{}
	if task.Schedule != "" {
		_ = json.Unmarshal([]byte(task.Schedule), &state)
	}

	triggered := make(map[string]struct{}, len(state.MTRTriggeredProbes))
	for _, id := range state.MTRTriggeredProbes {
		triggered[id] = struct{}{}
	}

	probes, err := s.selectProbes(task)
	if err != nil {
		log.Printf("[Scheduler] Failed to select probes for mtr trigger (task=%s): %v", task.TaskID, err)
		return
	}
	if len(probes) == 0 {
		return
	}

	changed := false
	for _, probe := range probes {
		// 只给支持 mtr 的探针触发 mtr（且每个 probe 只触发一次）
		var caps []string
		_ = json.Unmarshal([]byte(probe.Capabilities), &caps)
		hasMTR := false
		for _, c := range caps {
			if c == "mtr" || c == "all" {
				hasMTR = true
				break
			}
		}
		if !hasMTR {
			continue
		}
		if _, ok := triggered[probe.ProbeID]; ok {
			continue
		}

		mtrTask := &model.Task{
			TaskID:         uuid.New().String(),
			TaskType:       "mtr",
			Mode:           "single",
			Target:         task.Target,
			Parameters:     "{}",
			AssignedProbes: "[\"" + probe.ProbeID + "\"]",
			Status:         "pending",
			Priority:       task.Priority,
		}
		if err := s.db.CreateTask(mtrTask); err != nil {
			log.Printf("[Scheduler] Failed to create mtr task (parent=%s, probe=%s): %v", task.TaskID, probe.ProbeID, err)
			continue
		}

		state.MTRTriggeredProbes = append(state.MTRTriggeredProbes, probe.ProbeID)
		state.MTRTriggeredTaskIDs = append(state.MTRTriggeredTaskIDs, mtrTask.TaskID)
		triggered[probe.ProbeID] = struct{}{}
		changed = true
	}

	if changed {
		stateBytes, _ := json.Marshal(state)
		task.Schedule = string(stateBytes)
		_ = s.db.UpdateTask(task)
	}
}

// assignTask 分配任务到探针
func (s *Scheduler) assignTask(task *model.Task) error {
	// 获取可用的探针
	probes, err := s.selectProbes(task)
	if err != nil {
		return err
	}

	if len(probes) == 0 {
		log.Printf("[Scheduler] No available probes for task %s", task.TaskID)
		return nil
	}

	log.Printf("[Scheduler] Assigning task %s to %d probes", task.TaskID, len(probes))

	// 为每个探针创建执行记录并发送任务
	for _, probe := range probes {
		execution := &model.TaskExecution{
			ExecutionID: uuid.New().String(),
			TaskID:      task.TaskID,
			ProbeID:     probe.ProbeID,
			Status:      "pending",
			StartedAt:   time.Now(),
		}

		// 保存执行记录
		if err := s.db.SaveExecution(execution); err != nil {
			log.Printf("[Scheduler] Failed to save execution: %v", err)
			continue
		}

		// 解析任务参数
		var parameters map[string]interface{}
		_ = json.Unmarshal([]byte(task.Parameters), &parameters)
		if parameters == nil {
			parameters = map[string]interface{}{}
		}

		// continuous ping/tcp/mtr：每次只做 1 次（调度器负责 1s 间隔和最多 N 次）
		if task.Mode == "continuous" && (task.TaskType == "icmp_ping" || task.TaskType == "tcp_ping" || task.TaskType == "mtr") {
			parameters["count"] = 1
		}

		// 构建任务分配消息
		timeoutSec := 300
		if v, err := s.db.GetConfig("task_timeout"); err == nil {
			if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && i > 0 {
				timeoutSec = i
			}
		}

		// mtr / traceroute 可单独配置超时
		if task.TaskType == "mtr" {
			if v, err := s.db.GetConfig("mtr_timeout_seconds"); err == nil {
				if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && i > 0 {
					timeoutSec = i
				}
			}
		}
		if task.TaskType == "traceroute" {
			if v, err := s.db.GetConfig("traceroute_timeout_seconds"); err == nil {
				if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && i > 0 {
					timeoutSec = i
				}
			}
		}

		assignMsg := protocol.TaskAssignMessage{
			TaskID:      task.TaskID,
			ExecutionID: execution.ExecutionID,
			TaskType:    task.TaskType,
			Target:      task.Target,
			Parameters:  parameters,
			Timeout:     timeoutSec,
		}

		// 发送任务到探针
		if err := s.hub.SendToProbe(probe.ProbeID, "task_assign", assignMsg); err != nil {
			log.Printf("[Scheduler] Failed to send task to probe %s: %v", probe.ProbeID, err)
			execution.Status = "failed"
			errMsg := err.Error()
			execution.Error = &errMsg
			s.db.UpdateExecution(execution)
			continue
		}

		// 更新执行状态为running
		execution.Status = "running"
		s.db.UpdateExecution(execution)
	}

	// 更新任务状态
	now := time.Now()
	task.Status = "running"
	if task.StartedAt == nil {
		task.StartedAt = &now
	}
	return s.db.UpdateTask(task)
}

// selectProbes 选择执行任务的探针
func (s *Scheduler) selectProbes(task *model.Task) ([]*model.Probe, error) {
	// 如果指定了探针列表
	var assignedProbeIDs []string
	if task.AssignedProbes != "" {
		json.Unmarshal([]byte(task.AssignedProbes), &assignedProbeIDs)
	}

	if len(assignedProbeIDs) > 0 {
		// 使用指定的探针
		var probes []*model.Probe
		for _, probeID := range assignedProbeIDs {
			if s.hub.IsProbeOnline(probeID) {
				probe, err := s.db.GetProbe(probeID)
				if err == nil {
					probes = append(probes, probe)
				}
			}
		}
		return probes, nil
	}

	// 自动选择在线探针
	allProbes, err := s.db.GetOnlineProbes()
	if err != nil {
		return nil, err
	}

	// 过滤支持该任务类型的探针
	var compatibleProbes []*model.Probe
	for _, probe := range allProbes {
		if s.hub.IsProbeOnline(probe.ProbeID) {
			var capabilities []string
			json.Unmarshal([]byte(probe.Capabilities), &capabilities)

			// 检查是否支持该任务类型
			for _, cap := range capabilities {
				if cap == task.TaskType || cap == "all" {
					compatibleProbes = append(compatibleProbes, probe)
					break
				}
			}
		}
	}

	// 默认选择前3个探针
	maxProbes := 3
	if len(compatibleProbes) > maxProbes {
		compatibleProbes = compatibleProbes[:maxProbes]
	}

	return compatibleProbes, nil
}

// updateNextRun 更新持续任务的下次运行时间
func (s *Scheduler) updateNextRun(task *model.Task) {
	// 持续任务：默认 1s 间隔，最多 100 次（仅 ping/tcp_ping/mtr 支持）
	if task.TaskType != "icmp_ping" && task.TaskType != "tcp_ping" && task.TaskType != "mtr" {
		return
	}

	const defaultIntervalSeconds = 1
	maxRuns := 100

	// 用 schedule JSON 记录已执行次数与间隔：{"run_count":N,"interval_seconds":1,"max_runs":100,"mtr_triggered_probes":["probe-..."],"mtr_triggered_task_ids":["task-..."]}
	type scheduleState struct {
		RunCount            int      `json:"run_count"`
		IntervalSeconds     int      `json:"interval_seconds"`
		MaxRuns             int      `json:"max_runs,omitempty"`
		MTRTriggeredProbes  []string `json:"mtr_triggered_probes,omitempty"`
		MTRTriggeredTaskIDs []string `json:"mtr_triggered_task_ids,omitempty"`
	}

	state := scheduleState{RunCount: 0, IntervalSeconds: defaultIntervalSeconds}
	if task.Schedule != "" {
		_ = json.Unmarshal([]byte(task.Schedule), &state)
		if state.IntervalSeconds <= 0 {
			state.IntervalSeconds = defaultIntervalSeconds
		}
		if state.RunCount < 0 {
			state.RunCount = 0
		}
		if state.MaxRuns > 0 {
			maxRuns = state.MaxRuns
		}
	}

	// DB config 覆盖默认 maxRuns（但不覆盖 schedule.max_runs）
	if state.MaxRuns <= 0 {
		key := "ping_max_runs"
		if task.TaskType == "tcp_ping" {
			key = "tcp_ping_max_runs"
		}
		if v, err := s.db.GetConfig(key); err == nil {
			if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && i > 0 {
				maxRuns = i
			}
		}
	}

	state.RunCount++
	if state.RunCount >= maxRuns {
		state.MaxRuns = maxRuns
		now := time.Now()
		task.Status = "completed"
		task.CompletedAt = &now
		task.NextRunAt = nil
		stateBytes, _ := json.Marshal(state)
		task.Schedule = string(stateBytes)
		_ = s.db.UpdateTask(task)
		return
	}

	nextRun := time.Now().Add(time.Duration(state.IntervalSeconds) * time.Second)
	task.NextRunAt = &nextRun
	stateBytes, _ := json.Marshal(state)
	task.Schedule = string(stateBytes)
	_ = s.db.UpdateTask(task)
}
