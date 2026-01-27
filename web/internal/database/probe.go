package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"atlas/web/internal/model"
)

// SaveProbe 保存或更新探针信息
func (d *Database) SaveProbe(probe *model.Probe) error {
	var latitude interface{}
	var longitude interface{}
	if probe.Latitude != nil {
		latitude = *probe.Latitude
	}
	if probe.Longitude != nil {
		longitude = *probe.Longitude
	}

	query := `
		INSERT INTO probes (probe_id, name, location, region, latitude, longitude, ip_address, capabilities, status, last_heartbeat, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(probe_id) DO UPDATE SET
			name = excluded.name,
			location = excluded.location,
			region = excluded.region,
			latitude = excluded.latitude,
			longitude = excluded.longitude,
			ip_address = excluded.ip_address,
			capabilities = excluded.capabilities,
			status = excluded.status,
			last_heartbeat = excluded.last_heartbeat,
			metadata = excluded.metadata
	`

	_, err := d.db.Exec(query,
		probe.ProbeID,
		probe.Name,
		probe.Location,
		probe.Region,
		latitude,
		longitude,
		probe.IPAddress,
		probe.Capabilities,
		probe.Status,
		probe.LastHeartbeat,
		probe.Metadata,
	)

	return err
}

// GetProbe 根据ProbeID获取探针信息
func (d *Database) GetProbe(probeID string) (*model.Probe, error) {
	query := `SELECT id, probe_id, name, location, region, latitude, longitude, ip_address, capabilities, status, last_heartbeat, registered_at, metadata,
	          COALESCE(auth_token, '') AS auth_token
	          FROM probes WHERE probe_id = ?`

	probe := &model.Probe{}
	err := d.db.QueryRow(query, probeID).Scan(
		&probe.ID,
		&probe.ProbeID,
		&probe.Name,
		&probe.Location,
		&probe.Region,
		&probe.Latitude,
		&probe.Longitude,
		&probe.IPAddress,
		&probe.Capabilities,
		&probe.Status,
		&probe.LastHeartbeat,
		&probe.RegisteredAt,
		&probe.Metadata,
		&probe.AuthToken,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("probe not found")
	}

	return probe, err
}

// ListProbes 列出所有探针
func (d *Database) ListProbes(status string) ([]*model.Probe, error) {
	query := `SELECT id, probe_id, name, location, region, latitude, longitude, ip_address, capabilities, status, last_heartbeat, registered_at, metadata
	          FROM probes`

	args := []interface{}{}
	if status != "" {
		query += " WHERE status = ?"
		args = append(args, status)
	}

	query += " ORDER BY registered_at DESC"

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	probes := make([]*model.Probe, 0)
	for rows.Next() {
		probe := &model.Probe{}
		err := rows.Scan(
			&probe.ID,
			&probe.ProbeID,
			&probe.Name,
			&probe.Location,
			&probe.Region,
			&probe.Latitude,
			&probe.Longitude,
			&probe.IPAddress,
			&probe.Capabilities,
			&probe.Status,
			&probe.LastHeartbeat,
			&probe.RegisteredAt,
			&probe.Metadata,
		)
		if err != nil {
			return nil, err
		}
		probes = append(probes, probe)
	}

	return probes, nil
}

// UpdateProbeStatus 更新探针状态
func (d *Database) UpdateProbeStatus(probeID, status string) error {
	query := `UPDATE probes SET status = ?, last_heartbeat = ? WHERE probe_id = ?`
	_, err := d.db.Exec(query, status, time.Now(), probeID)
	return err
}

// UpdateProbeHeartbeat 更新探针心跳时间
func (d *Database) UpdateProbeHeartbeat(probeID string) error {
	query := `UPDATE probes SET last_heartbeat = ? WHERE probe_id = ?`
	_, err := d.db.Exec(query, time.Now(), probeID)
	return err
}

// GetOnlineProbes 获取在线的探针列表
func (d *Database) GetOnlineProbes() ([]*model.Probe, error) {
	// 5分钟内有心跳的探针视为在线
	threshold := time.Now().Add(-5 * time.Minute)
	query := `SELECT id, probe_id, name, location, region, latitude, longitude, ip_address, capabilities, status, last_heartbeat, registered_at, metadata
	          FROM probes
	          WHERE last_heartbeat > ? AND status != 'offline'
	          ORDER BY name`

	rows, err := d.db.Query(query, threshold)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	probes := make([]*model.Probe, 0)
	for rows.Next() {
		probe := &model.Probe{}
		err := rows.Scan(
			&probe.ID,
			&probe.ProbeID,
			&probe.Name,
			&probe.Location,
			&probe.Region,
			&probe.Latitude,
			&probe.Longitude,
			&probe.IPAddress,
			&probe.Capabilities,
			&probe.Status,
			&probe.LastHeartbeat,
			&probe.RegisteredAt,
			&probe.Metadata,
		)
		if err != nil {
			return nil, err
		}
		probes = append(probes, probe)
	}

	return probes, nil
}

// ValidateAuthToken 验证认证令牌
func (d *Database) ValidateAuthToken(token string) (bool, error) {
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM probes WHERE auth_token = ?", token).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// DeleteProbe 删除探针
func (d *Database) DeleteProbe(probeID string) error {
	query := `DELETE FROM probes WHERE probe_id = ?`
	_, err := d.db.Exec(query, probeID)
	return err
}

// GetProbeCapabilities 获取探针支持的能力
func (d *Database) GetProbeCapabilities(probeID string) ([]string, error) {
	probe, err := d.GetProbe(probeID)
	if err != nil {
		return nil, err
	}

	var capabilities []string
	if err := json.Unmarshal([]byte(probe.Capabilities), &capabilities); err != nil {
		return nil, err
	}

	return capabilities, nil
}
