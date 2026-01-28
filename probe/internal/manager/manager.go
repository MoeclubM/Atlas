package manager

import (
	"context"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"atlas/shared/protocol"
)

// TaskClient 任务客户端接口
type TaskClient interface {
	SendTaskResult(result protocol.TaskResultMessage) error
	SendTaskStatus(status protocol.TaskStatusMessage) error
}

// Manager 任务管理器
type Manager struct {
	taskQueue chan TaskJob
	workers   int
	wg        sync.WaitGroup
	stopChan  chan struct{}

	activeTasks sync.Map // executionID => context.CancelFunc
	activeCount atomic.Int64
}

// TaskJob 任务作业
type TaskJob struct {
	Task   protocol.TaskAssignMessage
	Client TaskClient
}

// New 创建新的任务管理器
func New(maxWorkers int) *Manager {
	return &Manager{
		taskQueue: make(chan TaskJob, 100),
		workers:   maxWorkers,
		stopChan:  make(chan struct{}),
	}
}

// Start 启动任务管理器
func (m *Manager) Start() {
	log.Printf("[Manager] Starting %d workers...", m.workers)

	for i := 0; i < m.workers; i++ {
		m.wg.Add(1)
		go m.worker(i)
	}
}

// Stop 停止任务管理器
func (m *Manager) Stop() {
	close(m.stopChan)
	m.wg.Wait()
}

// SubmitTask 提交任务
func (m *Manager) SubmitTask(task protocol.TaskAssignMessage, client TaskClient) {
	m.taskQueue <- TaskJob{
		Task:   task,
		Client: client,
	}
}

// CancelTask 取消任务
func (m *Manager) CancelTask(executionID string) {
	// 取消正在执行的任务（通过 context）
	if v, exists := m.activeTasks.Load(executionID); exists {
		if cancel, ok := v.(context.CancelFunc); ok {
			log.Printf("[Manager] Cancelling task %s", executionID)
			cancel()
			return
		}
	}

	// 尝试从队列中移除任务：channel 不支持直接遍历删除，这里仅记录
	log.Printf("[Manager] Task %s cancel requested (not running)", executionID)
}

// ActiveTaskCount 获取活跃任务数
func (m *Manager) ActiveTaskCount() int {
	v := m.activeCount.Load()
	if v < 0 {
		return 0
	}
	return int(v)
}

// worker 工作协程
func (m *Manager) worker(id int) {
	defer m.wg.Done()

	for {
		select {
		case job := <-m.taskQueue:
			m.executeTask(id, job)
		case <-m.stopChan:
			return
		}
	}
}

// executeTask 执行任务
func (m *Manager) executeTask(workerID int, job TaskJob) {
	task := job.Task
	log.Printf("[Worker %d] Executing task: %s (type: %s, target: %s)",
		workerID, task.TaskID, task.TaskType, task.Target)

	// 标记为活跃任务（用于 cancel/timeout）
	ctx, cancel := context.WithCancel(context.Background())
	if task.Timeout > 0 {
		ctx, cancel = context.WithTimeout(context.Background(), time.Duration(task.Timeout)*time.Second)
	}
	m.activeTasks.Store(task.ExecutionID, cancel)
	m.activeCount.Add(1)
	defer func() {
		cancel()
		m.activeTasks.Delete(task.ExecutionID)
		m.activeCount.Add(-1)
	}()

	// 发送状态:开始执行
	job.Client.SendTaskStatus(protocol.TaskStatusMessage{
		ExecutionID: task.ExecutionID,
		TaskID:      task.TaskID,
		ProbeID:     "", // 会由client填充
		Status:      "running",
		Progress:    0,
	})

	startTime := time.Now()

	// 超时/取消：执行前先检查一次，避免无意义执行
	if err := ctx.Err(); err != nil {
		// 直接返回超时/取消
		result := protocol.TaskResultMessage{
			ExecutionID: task.ExecutionID,
			TaskID:      task.TaskID,
			ProbeID:     "", // 会由client填充
			Status:      "failed",
			Error:       err.Error(),
			Duration:    0,
		}
		_ = job.Client.SendTaskResult(result)
		return
	}

	// 根据任务类型执行
	var resultData interface{}
	var err error

	switch task.TaskType {
	case "icmp_ping":
		resultData, err = executeICMPPing(ctx, task.Target, task.Parameters)
	case "tcp_ping":
		resultData, err = executeTCPPing(task.Target, task.Parameters)
	case "traceroute":
		resultData, err = executeTraceroute(ctx, task.Target, task.Parameters)
	case "http_test":
		resultData, err = executeHTTPTest(task.Target, task.Parameters)
	case "bird_route":
		resultData, err = executeBirdRoute(task.Target, task.Parameters)
	default:
		err = fmt.Errorf("unsupported task type: %s", task.TaskType)
	}

	duration := time.Since(startTime).Milliseconds()

	// 构建结果消息
	result := protocol.TaskResultMessage{
		ExecutionID: task.ExecutionID,
		TaskID:      task.TaskID,
		ProbeID:     "", // 会由client填充
		Duration:    duration,
	}

	if err != nil {
		result.Status = "failed"
		result.Error = err.Error()
		log.Printf("[Worker %d] Task failed: %s - %v", workerID, task.TaskID, err)
	} else {
		result.Status = "success"
		result.ResultData = resultData
		log.Printf("[Worker %d] Task completed: %s (duration: %dms)", workerID, task.TaskID, duration)
	}

	// 发送结果
	if err := job.Client.SendTaskResult(result); err != nil {
		log.Printf("[Worker %d] Failed to send result: %v", workerID, err)
	}
}
