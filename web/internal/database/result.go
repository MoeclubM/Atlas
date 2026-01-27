package database

import (
	"database/sql"
	"fmt"

	"atlas/web/internal/model"
)

// SaveResult 保存测试结果
func (d *Database) SaveResult(result *model.Result) error {
	query := `
		INSERT INTO results (result_id, execution_id, task_id, probe_id, target, test_type, status, result_data, summary)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := d.db.Exec(query,
		result.ResultID,
		result.ExecutionID,
		result.TaskID,
		result.ProbeID,
		result.Target,
		result.TestType,
		result.Status,
		result.ResultData,
		result.Summary,
	)

	return err
}

// GetResult 获取结果详情
func (d *Database) GetResult(resultID string) (*model.Result, error) {
	query := `SELECT id, result_id, execution_id, task_id, probe_id, target, test_type, COALESCE(status, 'success') as status, result_data, summary, created_at
	          FROM results WHERE result_id = ?`

	result := &model.Result{}
	err := d.db.QueryRow(query, resultID).Scan(
		&result.ID,
		&result.ResultID,
		&result.ExecutionID,
		&result.TaskID,
		&result.ProbeID,
		&result.Target,
		&result.TestType,
		&result.Status,
		&result.ResultData,
		&result.Summary,
		&result.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("result not found")
	}

	return result, err
}

// ListResultsByTask 列出任务的所有结果
func (d *Database) ListResultsByTask(taskID string, limit, offset int) ([]*model.Result, error) {
	query := `SELECT id, result_id, execution_id, task_id, probe_id, target, test_type, COALESCE(status, 'success') as status, result_data, summary, created_at
	          FROM results WHERE task_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`

	rows, err := d.db.Query(query, taskID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*model.Result
	for rows.Next() {
		result := &model.Result{}
		err := rows.Scan(
			&result.ID,
			&result.ResultID,
			&result.ExecutionID,
			&result.TaskID,
			&result.ProbeID,
			&result.Target,
			&result.TestType,
			&result.Status,
			&result.ResultData,
			&result.Summary,
			&result.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	return results, nil
}

// ListResultsByProbe 列出探针的所有结果
func (d *Database) ListResultsByProbe(probeID string, limit, offset int) ([]*model.Result, error) {
	query := `SELECT id, result_id, execution_id, task_id, probe_id, target, test_type, COALESCE(status, 'success') as status, result_data, summary, created_at
	          FROM results WHERE probe_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`

	rows, err := d.db.Query(query, probeID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*model.Result
	for rows.Next() {
		result := &model.Result{}
		err := rows.Scan(
			&result.ID,
			&result.ResultID,
			&result.ExecutionID,
			&result.TaskID,
			&result.ProbeID,
			&result.Target,
			&result.TestType,
			&result.Status,
			&result.ResultData,
			&result.Summary,
			&result.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	return results, nil
}

// ListResultsByExecution 列出执行记录的所有结果
func (d *Database) ListResultsByExecution(executionID string) ([]*model.Result, error) {
	query := `SELECT id, result_id, execution_id, task_id, probe_id, target, test_type, COALESCE(status, 'success') as status, result_data, summary, created_at
	          FROM results WHERE execution_id = ? ORDER BY created_at DESC`

	rows, err := d.db.Query(query, executionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*model.Result
	for rows.Next() {
		result := &model.Result{}
		err := rows.Scan(
			&result.ID,
			&result.ResultID,
			&result.ExecutionID,
			&result.TaskID,
			&result.ProbeID,
			&result.Target,
			&result.TestType,
			&result.Status,
			&result.ResultData,
			&result.Summary,
			&result.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}

	return results, nil
}

// DeleteResult 删除结果
func (d *Database) DeleteResult(resultID string) error {
	query := `DELETE FROM results WHERE result_id = ?`
	_, err := d.db.Exec(query, resultID)
	return err
}

// GetConfig 获取配置值
func (d *Database) GetConfig(key string) (string, error) {
	var value string
	err := d.db.QueryRow("SELECT value FROM config WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("config key not found: %s", key)
	}
	return value, err
}

// SetConfig 设置配置值
func (d *Database) SetConfig(key, value string) error {
	query := `INSERT INTO config (key, value) VALUES (?, ?)
	          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
	_, err := d.db.Exec(query, key, value)
	return err
}
