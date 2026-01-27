package model

import "time"

// Probe 探针模型
type Probe struct {
	ID            int64     `json:"id" db:"id"`
	ProbeID       string    `json:"probe_id" db:"probe_id"`
	Name          string    `json:"name" db:"name"`
	Location      string    `json:"location" db:"location"`
	Region        string    `json:"region" db:"region"`
	Latitude      *float64  `json:"latitude,omitempty" db:"latitude"`   // 纬度
	Longitude     *float64  `json:"longitude,omitempty" db:"longitude"` // 经度
	IPAddress     string    `json:"ip_address" db:"ip_address"`
	Capabilities  string    `json:"capabilities" db:"capabilities"`   // JSON array
	Status        string    `json:"status" db:"status"`                 // online/offline/busy
	LastHeartbeat time.Time `json:"last_heartbeat" db:"last_heartbeat"`
	RegisteredAt  time.Time `json:"registered_at" db:"registered_at"`
	Metadata      string    `json:"metadata" db:"metadata"`             // JSON object
	AuthToken     string    `json:"auth_token,omitempty" db:"auth_token"`
}

// Task 任务模型
type Task struct {
	ID             int64      `json:"id" db:"id"`
	TaskID         string     `json:"task_id" db:"task_id"`
	UserID         *int64     `json:"user_id,omitempty" db:"user_id"`
	TaskType       string     `json:"task_type" db:"task_type"`
	Mode           string     `json:"mode" db:"mode"` // single/continuous
	Target         string     `json:"target" db:"target"`
	Parameters     string     `json:"parameters" db:"parameters"`             // JSON
	AssignedProbes string     `json:"assigned_probes" db:"assigned_probes"`   // JSON array
	Status         string     `json:"status" db:"status"`
	Schedule       string     `json:"schedule,omitempty" db:"schedule"`       // JSON
	Priority       int        `json:"priority" db:"priority"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	StartedAt      *time.Time `json:"started_at,omitempty" db:"started_at"`
	CompletedAt    *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	NextRunAt      *time.Time `json:"next_run_at,omitempty" db:"next_run_at"`
}

// TaskExecution 任务执行记录
type TaskExecution struct {
	ID          int64      `json:"id" db:"id"`
	ExecutionID string     `json:"execution_id" db:"execution_id"`
	TaskID      string     `json:"task_id" db:"task_id"`
	ProbeID     string     `json:"probe_id" db:"probe_id"`
	Status      string     `json:"status" db:"status"`
	StartedAt   time.Time  `json:"started_at" db:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	Error       *string    `json:"error,omitempty" db:"error"`
}

// Result 测试结果
type Result struct {
	ID          int64     `json:"id" db:"id"`
	ResultID    string    `json:"result_id" db:"result_id"`
	ExecutionID string    `json:"execution_id" db:"execution_id"`
	TaskID      string    `json:"task_id" db:"task_id"`
	ProbeID     string    `json:"probe_id" db:"probe_id"`
	Target      string    `json:"target" db:"target"`
	TestType    string    `json:"test_type" db:"test_type"`
	Status      string    `json:"status,omitempty" db:"status"`
	ResultData  string    `json:"result_data" db:"result_data"` // JSON
	Summary     string    `json:"summary,omitempty" db:"summary"` // JSON
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// User 用户模型
type User struct {
	ID           int64      `json:"id" db:"id"`
	Username     string     `json:"username" db:"username"`
	PasswordHash string     `json:"-" db:"password_hash"`
	Email        string     `json:"email" db:"email"`
	Role         string     `json:"role" db:"role"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty" db:"last_login"`
}

// Config 系统配置
type Config struct {
	Key         string    `json:"key" db:"key"`
	Value       string    `json:"value" db:"value"`
	Description string    `json:"description" db:"description"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}
