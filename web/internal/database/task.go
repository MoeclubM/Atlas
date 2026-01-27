package database

import (
	"database/sql"
	"fmt"
	"time"

	"atlas/web/internal/model"
)

// CreateTask 创建新任务
func (d *Database) CreateTask(task *model.Task) error {
	query := `
		INSERT INTO tasks (task_id, user_id, task_type, mode, target, parameters, assigned_probes, status, schedule, priority, next_run_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := d.db.Exec(query,
		task.TaskID,
		task.UserID,
		task.TaskType,
		task.Mode,
		task.Target,
		task.Parameters,
		task.AssignedProbes,
		task.Status,
		task.Schedule,
		task.Priority,
		task.NextRunAt,
	)

	return err
}

// GetTask 获取任务详情
func (d *Database) GetTask(taskID string) (*model.Task, error) {
	query := `SELECT id, task_id, user_id, task_type, mode, target, parameters, assigned_probes, status, schedule, priority,
	          created_at, started_at, completed_at, next_run_at
	          FROM tasks WHERE task_id = ?`

	task := &model.Task{}
	err := d.db.QueryRow(query, taskID).Scan(
		&task.ID,
		&task.TaskID,
		&task.UserID,
		&task.TaskType,
		&task.Mode,
		&task.Target,
		&task.Parameters,
		&task.AssignedProbes,
		&task.Status,
		&task.Schedule,
		&task.Priority,
		&task.CreatedAt,
		&task.StartedAt,
		&task.CompletedAt,
		&task.NextRunAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("task not found")
	}

	return task, err
}

// ListTasks 列出任务
func (d *Database) ListTasks(status string, limit, offset int) ([]*model.Task, error) {
	query := `SELECT id, task_id, user_id, task_type, mode, target, parameters, assigned_probes, status, schedule, priority,
	          created_at, started_at, completed_at, next_run_at
	          FROM tasks`

	args := []interface{}{}
	if status != "" {
		query += " WHERE status = ?"
		args = append(args, status)
	}

	query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*model.Task
	for rows.Next() {
		task := &model.Task{}
		err := rows.Scan(
			&task.ID,
			&task.TaskID,
			&task.UserID,
			&task.TaskType,
			&task.Mode,
			&task.Target,
			&task.Parameters,
			&task.AssignedProbes,
			&task.Status,
			&task.Schedule,
			&task.Priority,
			&task.CreatedAt,
			&task.StartedAt,
			&task.CompletedAt,
			&task.NextRunAt,
		)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}

	return tasks, nil
}

// UpdateTask 更新任务
func (d *Database) UpdateTask(task *model.Task) error {
	query := `UPDATE tasks SET status = ?, started_at = ?, completed_at = ?, next_run_at = ?, schedule = ? WHERE task_id = ?`
	_, err := d.db.Exec(query, task.Status, task.StartedAt, task.CompletedAt, task.NextRunAt, task.Schedule, task.TaskID)
	return err
}

// UpdateTaskStatus 更新任务状态
func (d *Database) UpdateTaskStatus(taskID, status string) error {
	query := `UPDATE tasks SET status = ? WHERE task_id = ?`
	_, err := d.db.Exec(query, status, taskID)
	return err
}

// DeleteTask 删除任务
func (d *Database) DeleteTask(taskID string) error {
	query := `DELETE FROM tasks WHERE task_id = ?`
	_, err := d.db.Exec(query, taskID)
	return err
}

// GetPendingTasks 获取待执行的任务
func (d *Database) GetPendingTasks(now time.Time) ([]*model.Task, error) {
	query := `SELECT id, task_id, user_id, task_type, mode, target, parameters, assigned_probes, status, schedule, priority,
	          created_at, started_at, completed_at, next_run_at
	          FROM tasks
	          WHERE status = 'pending' AND mode != 'continuous'
	          ORDER BY priority DESC, created_at ASC`

	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*model.Task
	for rows.Next() {
		task := &model.Task{}
		err := rows.Scan(
			&task.ID,
			&task.TaskID,
			&task.UserID,
			&task.TaskType,
			&task.Mode,
			&task.Target,
			&task.Parameters,
			&task.AssignedProbes,
			&task.Status,
			&task.Schedule,
			&task.Priority,
			&task.CreatedAt,
			&task.StartedAt,
			&task.CompletedAt,
			&task.NextRunAt,
		)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}

	return tasks, nil
}

// GetDueContinuousTasks 获取应该执行的持续任务
func (d *Database) GetDueContinuousTasks(now time.Time) ([]*model.Task, error) {
	query := `SELECT id, task_id, user_id, task_type, mode, target, parameters, assigned_probes, status, schedule, priority,
	          created_at, started_at, completed_at, next_run_at
	          FROM tasks
	          WHERE mode = 'continuous' AND next_run_at <= ?
	          AND (status = 'running' OR status = 'pending')
	          ORDER BY priority DESC`

	rows, err := d.db.Query(query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*model.Task
	for rows.Next() {
		task := &model.Task{}
		err := rows.Scan(
			&task.ID,
			&task.TaskID,
			&task.UserID,
			&task.TaskType,
			&task.Mode,
			&task.Target,
			&task.Parameters,
			&task.AssignedProbes,
			&task.Status,
			&task.Schedule,
			&task.Priority,
			&task.CreatedAt,
			&task.StartedAt,
			&task.CompletedAt,
			&task.NextRunAt,
		)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}

	return tasks, nil
}

// SaveExecution 保存任务执行记录
func (d *Database) SaveExecution(execution *model.TaskExecution) error {
	query := `INSERT INTO task_executions (execution_id, task_id, probe_id, status, started_at)
	          VALUES (?, ?, ?, ?, ?)`

	_, err := d.db.Exec(query,
		execution.ExecutionID,
		execution.TaskID,
		execution.ProbeID,
		execution.Status,
		execution.StartedAt,
	)

	return err
}

// UpdateExecution 更新执行记录
func (d *Database) UpdateExecution(execution *model.TaskExecution) error {
	query := `UPDATE task_executions SET status = ?, completed_at = ?, error = ? WHERE execution_id = ?`
	_, err := d.db.Exec(query, execution.Status, execution.CompletedAt, execution.Error, execution.ExecutionID)
	return err
}

// GetExecution 获取执行记录
func (d *Database) GetExecution(executionID string) (*model.TaskExecution, error) {
	query := `SELECT id, execution_id, task_id, probe_id, status, started_at, completed_at, error
	          FROM task_executions WHERE execution_id = ?`

	execution := &model.TaskExecution{}
	err := d.db.QueryRow(query, executionID).Scan(
		&execution.ID,
		&execution.ExecutionID,
		&execution.TaskID,
		&execution.ProbeID,
		&execution.Status,
		&execution.StartedAt,
		&execution.CompletedAt,
		&execution.Error,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("execution not found")
	}

	return execution, err
}

// ListExecutionsByTask 列出任务的所有执行记录
func (d *Database) ListExecutionsByTask(taskID string) ([]*model.TaskExecution, error) {
	query := `SELECT id, execution_id, task_id, probe_id, status, started_at, completed_at, error
	          FROM task_executions WHERE task_id = ? ORDER BY started_at DESC`

	rows, err := d.db.Query(query, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var executions []*model.TaskExecution
	for rows.Next() {
		execution := &model.TaskExecution{}
		err := rows.Scan(
			&execution.ID,
			&execution.ExecutionID,
			&execution.TaskID,
			&execution.ProbeID,
			&execution.Status,
			&execution.StartedAt,
			&execution.CompletedAt,
			&execution.Error,
		)
		if err != nil {
			return nil, err
		}
		executions = append(executions, execution)
	}

	return executions, nil
}
