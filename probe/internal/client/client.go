package client

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"atlas/probe/internal/config"
	"atlas/probe/internal/manager"
	"atlas/shared/protocol"
)

// Version is the probe build version. It should be injected via -ldflags.
var Version = "dev"

// Client WebSocket客户端
type Client struct {
	config      *config.Config
	taskManager *manager.Manager
	probeID     string

	connMu sync.RWMutex
	conn   *websocket.Conn

	writeMu   sync.Mutex
	stopChan  chan struct{}
	startOnce sync.Once
	closeOnce sync.Once
}

// New 创建新的客户端
func New(cfg *config.Config, taskMgr *manager.Manager) *Client {
	probeID, err := loadOrCreateStableProbeID()
	if err != nil {
		log.Printf("[Client] Warning: failed to persist probe_id: %v, using UUID", err)
		probeID = "probe-" + uuid.New().String()[:8]
	}

	return &Client{
		config:      cfg,
		taskManager: taskMgr,
		probeID:     probeID,
		stopChan:    make(chan struct{}),
	}
}

// Connect 连接到Web服务端
func (c *Client) Connect() error {
	log.Printf("[Client] Connecting to %s...", c.config.Server.URL)

	if err := c.dialAndRegister(); err != nil {
		return err
	}

	c.startOnce.Do(func() {
		// 启动心跳
		go c.heartbeatLoop()
		// 启动消息接收
		go c.readLoop()
	})

	return nil
}

func (c *Client) getConn() *websocket.Conn {
	c.connMu.RLock()
	defer c.connMu.RUnlock()
	return c.conn
}

func (c *Client) swapConn(newConn *websocket.Conn) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	var oldConn *websocket.Conn
	c.connMu.Lock()
	oldConn = c.conn
	c.conn = newConn
	c.connMu.Unlock()

	if oldConn != nil {
		_ = oldConn.Close()
	}
}

func (c *Client) closeIfCurrent(conn *websocket.Conn) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	shouldClose := false
	c.connMu.Lock()
	if c.conn == conn {
		c.conn = nil
		shouldClose = true
	}
	c.connMu.Unlock()

	if shouldClose {
		_ = conn.Close()
	}
}

func (c *Client) dialAndRegister() error {
	conn, _, err := websocket.DefaultDialer.Dial(c.config.Server.URL, nil)
	if err != nil {
		return err
	}

	c.swapConn(conn)
	log.Println("[Client] Connected successfully")

	return c.register()
}

// register 发送注册消息
func (c *Client) register() error {
	log.Println("[Client] Registering probe...")

	metadata := map[string]string{
		"os":   runtime.GOOS,
		"arch": runtime.GOARCH,
	}

	// 可选：上报 ASN/ISP（用于在服务端 UI 展示运营商信息）
	if asn := os.Getenv("PROBE_ASN"); asn != "" {
		metadata["asn"] = asn
	}
	if isp := os.Getenv("PROBE_ISP"); isp != "" {
		metadata["isp"] = isp
	}

	// 添加经纬度到 metadata
	if c.config.Probe.Latitude != nil {
		metadata["latitude"] = fmt.Sprintf("%f", *c.config.Probe.Latitude)
	}
	if c.config.Probe.Longitude != nil {
		metadata["longitude"] = fmt.Sprintf("%f", *c.config.Probe.Longitude)
	}

	registerMsg := protocol.RegisterMessage{
		ProbeID:      c.probeID,
		Name:         c.config.Probe.Name,
		Location:     c.config.Probe.Location,
		Region:       c.config.Probe.Region,
		Capabilities: c.config.Capabilities,
		Version:      Version,
		AuthToken:    c.config.Server.AuthToken,
		Metadata:     metadata,
	}

	return c.sendMessage("register", registerMsg)
}

// heartbeatLoop 心跳循环
func (c *Client) heartbeatLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			heartbeatMsg := protocol.HeartbeatMessage{
				ProbeID:     c.probeID,
				Status:      "online",
				CPUUsage:    0,
				MemUsage:    0,
				ActiveTasks: c.taskManager.ActiveTaskCount(),
			}

			if err := c.sendMessage("heartbeat", heartbeatMsg); err != nil {
				log.Printf("[Client] Failed to send heartbeat: %v", err)
			}

		case <-c.stopChan:
			return
		}
	}
}

// readLoop 读取消息循环
func (c *Client) readLoop() {
	for {
		select {
		case <-c.stopChan:
			return
		default:
		}

		conn := c.getConn()
		if conn == nil {
			if err := c.reconnect(); err != nil {
				return
			}
			continue
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[Client] Read error: %v", err)
			c.closeIfCurrent(conn)
			if err := c.reconnect(); err != nil {
				return
			}
			continue
		}

		if err := c.handleMessage(message); err != nil {
			log.Printf("[Client] Failed to handle message: %v", err)
		}
	}
}

// handleMessage 处理接收到的消息
func (c *Client) handleMessage(message []byte) error {
	var msg protocol.WSMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		return err
	}

	switch msg.Type {
	case "register_ack":
		var ackMsg protocol.RegisterAckMessage
		dataBytes, _ := json.Marshal(msg.Data)
		json.Unmarshal(dataBytes, &ackMsg)

		if ackMsg.Success {
			log.Printf("[Client] Registration successful: %s", ackMsg.Message)
		} else {
			log.Printf("[Client] Registration failed: %s", ackMsg.Message)
		}

	case "heartbeat_ack":
		// 心跳响应,无需处理

	case "task_assign":
		var taskMsg protocol.TaskAssignMessage
		dataBytes, _ := json.Marshal(msg.Data)
		json.Unmarshal(dataBytes, &taskMsg)

		log.Printf("[Client] Received task: %s (type: %s, target: %s)",
			taskMsg.TaskID, taskMsg.TaskType, taskMsg.Target)

		// 提交任务到任务管理器
		c.taskManager.SubmitTask(taskMsg, c)

	case "task_cancel":
		var cancelMsg protocol.TaskCancelMessage
		dataBytes, _ := json.Marshal(msg.Data)
		json.Unmarshal(dataBytes, &cancelMsg)

		log.Printf("[Client] Received task cancel: %s (execution: %s, reason: %s)",
			cancelMsg.TaskID, cancelMsg.ExecutionID, cancelMsg.Reason)

		// 取消任务
		c.taskManager.CancelTask(cancelMsg.ExecutionID)

	case "pong":
		// Pong响应

	default:
		log.Printf("[Client] Unknown message type: %s", msg.Type)
	}

	return nil
}

// sendMessage 发送消息
func (c *Client) sendMessage(msgType string, data interface{}) error {
	msg := protocol.WSMessage{
		Type:      msgType,
		RequestID: uuid.New().String(),
		Timestamp: time.Now().Unix(),
		Data:      data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	conn := c.getConn()
	if conn == nil {
		return fmt.Errorf("not connected")
	}

	return conn.WriteMessage(websocket.TextMessage, msgBytes)
}

// SendTaskResult 发送任务结果
func (c *Client) SendTaskResult(result protocol.TaskResultMessage) error {
	// 填充ProbeID
	if result.ProbeID == "" {
		result.ProbeID = c.probeID
	}
	return c.sendMessage("task_result", result)
}

// SendTaskStatus 发送任务状态
func (c *Client) SendTaskStatus(status protocol.TaskStatusMessage) error {
	// 填充ProbeID
	if status.ProbeID == "" {
		status.ProbeID = c.probeID
	}
	return c.sendMessage("task_status", status)
}

// reconnect 重新连接
func (c *Client) reconnect() error {
	attempts := 0
	maxAttempts := c.config.Server.MaxReconnectAttempts

	for {
		select {
		case <-c.stopChan:
			return fmt.Errorf("stopped")
		default:
		}

		attempts++
		if maxAttempts > 0 && attempts > maxAttempts {
			log.Printf("[Client] Max reconnect attempts reached")
			return fmt.Errorf("max reconnect attempts reached")
		}

		log.Printf("[Client] Reconnecting (attempt %d)...", attempts)
		time.Sleep(time.Duration(c.config.Server.ReconnectInterval) * time.Second)

		if err := c.dialAndRegister(); err != nil {
			log.Printf("[Client] Reconnect failed: %v", err)
			continue
		}

		log.Println("[Client] Reconnected successfully")
		return nil
	}
}

// Close 关闭连接
func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.stopChan)
	})

	c.writeMu.Lock()
	var conn *websocket.Conn
	c.connMu.Lock()
	conn = c.conn
	c.conn = nil
	c.connMu.Unlock()
	c.writeMu.Unlock()

	if conn != nil {
		_ = conn.Close()
	}
}

func probeIDFilePath() string {
	if probeIDFile := strings.TrimSpace(os.Getenv("PROBE_ID_FILE")); probeIDFile != "" {
		return probeIDFile
	}

	if dir := strings.TrimSpace(os.Getenv("PROBE_ID_DIR")); dir != "" {
		return filepath.Join(dir, "probe_id.txt")
	}

	// 默认放到用户配置目录（容器内可通过挂载 /data 或设置 PROBE_ID_DIR/PROBE_ID_FILE 持久化）
	if configDir, err := os.UserConfigDir(); err == nil && configDir != "" {
		return filepath.Join(configDir, "atlas", "probe_id.txt")
	}

	// 最后兜底：当前工作目录
	return "probe_id.txt"
}

func loadOrCreateStableProbeID() (string, error) {
	filename := probeIDFilePath()

	// 尝试从文件读取
	if data, err := os.ReadFile(filename); err == nil {
		probeID := strings.TrimSpace(string(data))
		if probeID != "" {
			log.Printf("[Client] Loaded existing probe_id: %s", probeID)
			return probeID, nil
		}
	}

	// 生成新的 probe_id
	probeID := "probe-" + uuid.New().String()

	// 保存到文件（确保目录存在）
	if dir := filepath.Dir(filename); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
	}
	if err := os.WriteFile(filename, []byte(probeID), 0o644); err != nil {
		return "", err
	}

	log.Printf("[Client] Created and persisted new probe_id: %s", probeID)
	return probeID, nil
}
