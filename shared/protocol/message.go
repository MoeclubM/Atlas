package protocol

import "time"

// 消息类型常量
const (
	// Probe → Web
	MsgTypeRegister    = "register"
	MsgTypeHeartbeat   = "heartbeat"
	MsgTypeTaskResult  = "task_result"
	MsgTypeTaskStatus  = "task_status"
	MsgTypeError       = "error"

	// Web → Probe
	MsgTypeRegisterAck  = "register_ack"
	MsgTypeHeartbeatAck = "heartbeat_ack"
	MsgTypeTaskAssign   = "task_assign"
	MsgTypeTaskCancel   = "task_cancel"
	MsgTypeConfig       = "config"

	// 双向
	MsgTypePing = "ping"
	MsgTypePong = "pong"
)

// WSMessage WebSocket消息基础结构
type WSMessage struct {
	Type      string      `json:"type"`       // 消息类型
	RequestID string      `json:"request_id"` // 请求ID(用于响应匹配)
	Timestamp int64       `json:"timestamp"`  // 时间戳
	Data      interface{} `json:"data"`       // 消息载荷
}

// RegisterMessage 探针注册消息
type RegisterMessage struct {
	ProbeID      string            `json:"probe_id"`      // 探针ID
	Name         string            `json:"name"`          // 探针名称
	Location     string            `json:"location"`      // 地理位置
	Region       string            `json:"region"`        // 区域
	Capabilities []string          `json:"capabilities"`  // 支持的测试类型
	Version      string            `json:"version"`       // 探针版本
	AuthToken    string            `json:"auth_token"`    // 认证令牌
	Metadata     map[string]string `json:"metadata"`      // 额外信息
}

// RegisterAckMessage 注册响应消息
type RegisterAckMessage struct {
	Success bool        `json:"success"`
	ProbeID string      `json:"probe_id"`
	Message string      `json:"message"`
	Config  ProbeConfig `json:"config"` // 服务端配置
}

// ProbeConfig 探针配置
type ProbeConfig struct {
	HeartbeatInterval  int `json:"heartbeat_interval"`   // 心跳间隔(秒)
	MaxConcurrentTasks int `json:"max_concurrent_tasks"` // 最大并发任务数
}

// HeartbeatMessage 心跳消息
type HeartbeatMessage struct {
	ProbeID     string  `json:"probe_id"`
	Status      string  `json:"status"`       // online/busy
	CPUUsage    float64 `json:"cpu_usage"`    // CPU使用率
	MemUsage    float64 `json:"mem_usage"`    // 内存使用率
	ActiveTasks int     `json:"active_tasks"` // 活跃任务数
}

// HeartbeatAckMessage 心跳响应消息
type HeartbeatAckMessage struct {
	Timestamp     int64 `json:"timestamp"`
	NextHeartbeat int   `json:"next_heartbeat"` // 下次心跳间隔(秒)
}

// TaskAssignMessage 任务分配消息
type TaskAssignMessage struct {
	TaskID      string                 `json:"task_id"`
	ExecutionID string                 `json:"execution_id"`
	TaskType    string                 `json:"task_type"`
	Target      string                 `json:"target"`
	Parameters  map[string]interface{} `json:"parameters"`
	Timeout     int                    `json:"timeout"` // 超时时间(秒)
}

// TaskCancelMessage 任务取消消息
type TaskCancelMessage struct {
	ExecutionID string `json:"execution_id"` // 执行ID
	TaskID      string `json:"task_id"`      // 任务ID
	Reason      string `json:"reason"`       // 取消原因
}

// TaskResultMessage 任务结果上报消息
type TaskResultMessage struct {
	ExecutionID string      `json:"execution_id"`
	TaskID      string      `json:"task_id"`
	ProbeID     string      `json:"probe_id"`
	Status      string      `json:"status"` // success/failed
	ResultData  interface{} `json:"result_data"`
	Error       string      `json:"error,omitempty"`
	Duration    int64       `json:"duration"` // 执行耗时(ms)
}

// TaskStatusMessage 任务状态更新消息
type TaskStatusMessage struct {
	ExecutionID string `json:"execution_id"`
	TaskID      string `json:"task_id"`
	ProbeID     string `json:"probe_id"`
	Status      string `json:"status"`
	Progress    int    `json:"progress"` // 进度百分比(0-100)
	Message     string `json:"message,omitempty"`
}

// ErrorMessage 错误消息
type ErrorMessage struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// ============= 测试结果数据结构 =============

// ICMPPingResult ICMP Ping测试结果
type ICMPPingResult struct {
	PacketsSent       int         `json:"packets_sent"`
	PacketsReceived   int         `json:"packets_received"`
	PacketLossPercent float64     `json:"packet_loss_percent"`
	MinRTTMs          float64     `json:"min_rtt_ms"`
	AvgRTTMs          float64     `json:"avg_rtt_ms"`
	MaxRTTMs          float64     `json:"max_rtt_ms"`
	StdDevRTTMs       float64     `json:"stddev_rtt_ms"`
	Replies           []PingReply `json:"replies"`

	// 目标为域名时，探针实际解析并执行测试的 IP；若输入为 IP，则等于输入值。
	ResolvedIP string `json:"resolved_ip,omitempty"`
}

// PingReply Ping响应
type PingReply struct {
	Seq    int     `json:"seq"`
	TTL    int     `json:"ttl"`
	TimeMs float64 `json:"time_ms"`
}

// TCPPingResult TCP Ping测试结果
type TCPPingResult struct {
	Target                string          `json:"target"`
	SuccessfulConnections int             `json:"successful_connections"`
	FailedConnections     int             `json:"failed_connections"`
	AvgConnectTimeMs      float64         `json:"avg_connect_time_ms"`
	MinConnectTimeMs      float64         `json:"min_connect_time_ms"`
	MaxConnectTimeMs      float64         `json:"max_connect_time_ms"`
	Attempts              []TCPPingAttempt `json:"attempts"`

	// 目标为域名时，探针实际解析并连接的 IP；若输入为 IP，则等于输入值。
	ResolvedIP string `json:"resolved_ip,omitempty"`
}

// TCPPingAttempt TCP Ping单次尝试
type TCPPingAttempt struct {
	Seq    int     `json:"seq"`
	Status string  `json:"status"` // success/failed
	TimeMs float64 `json:"time_ms"`
	Error  string  `json:"error,omitempty"`
}

// MTRResult MTR测试结果
type MTRResult struct {
	Hops      []MTRHop `json:"hops"`
	Target    string   `json:"target"`
	TotalHops int      `json:"total_hops"`

	ResolvedIP string `json:"resolved_ip,omitempty"`
}

// MTRHop MTR单跳信息
type MTRHop struct {
	Hop         int     `json:"hop"`
	IP          string  `json:"ip"`
	Hostname    string  `json:"hostname"`
	Sent        int     `json:"sent"`
	Received    int     `json:"received"`
	LossPercent float64 `json:"loss_percent"`
	AvgMs       float64 `json:"avg_ms"`
	MinMs       float64 `json:"min_ms"`
	MaxMs       float64 `json:"max_ms"`
}

// TracerouteResult Traceroute测试结果
type TracerouteResult struct {
	Hops      []TracerouteHop `json:"hops"`
	Target    string          `json:"target"`
	TotalHops int             `json:"total_hops"`
	Success   bool            `json:"success"`

	ResolvedIP string `json:"resolved_ip,omitempty"`
}

// TracerouteHop Traceroute单跳
type TracerouteHop struct {
	Hop      int       `json:"hop"`
	IP       string    `json:"ip"`
	Hostname string    `json:"hostname"`
	RTTs     []float64 `json:"rtts"` // 多次探测的RTT值
	Timeout  bool      `json:"timeout"`
}

// BirdRouteResult Bird路由测试结果
type BirdRouteResult struct {
	Routes    []BirdRoute `json:"routes"`
	TotalRoutes int       `json:"total_routes"`
	Success   bool        `json:"success"`
}

// BirdRoute Bird单条路由
type BirdRoute struct {
	Network   string    `json:"network"`
	Gateway   string    `json:"gateway"`
	Interface string    `json:"interface"`
	Protocol  string    `json:"protocol"`
	Metric    int       `json:"metric"`
	Age       time.Duration `json:"age"`
}
