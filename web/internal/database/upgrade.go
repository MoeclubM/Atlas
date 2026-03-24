package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"atlas/web/internal/model"
)

// CreateProbeUpgrade 创建探针升级记录
func (d *Database) CreateProbeUpgrade(upgrade *model.ProbeUpgrade) error {
	query := `
		INSERT INTO probe_upgrades (upgrade_id, probe_id, from_version, target_version, status, error_message, requested_at, acked_at, completed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := d.db.Exec(
		query,
		upgrade.UpgradeID,
		upgrade.ProbeID,
		strings.TrimSpace(upgrade.FromVersion),
		strings.TrimSpace(upgrade.TargetVersion),
		strings.TrimSpace(upgrade.Status),
		upgrade.ErrorMessage,
		upgrade.RequestedAt,
		upgrade.AckedAt,
		upgrade.CompletedAt,
	)
	return err
}

// GetProbeUpgrade 获取升级记录
func (d *Database) GetProbeUpgrade(upgradeID string) (*model.ProbeUpgrade, error) {
	query := `SELECT id, upgrade_id, probe_id, from_version, target_version, status, error_message, requested_at, acked_at, completed_at
		FROM probe_upgrades WHERE upgrade_id = ?`

	upgrade := &model.ProbeUpgrade{}
	err := d.db.QueryRow(query, upgradeID).Scan(
		&upgrade.ID,
		&upgrade.UpgradeID,
		&upgrade.ProbeID,
		&upgrade.FromVersion,
		&upgrade.TargetVersion,
		&upgrade.Status,
		&upgrade.ErrorMessage,
		&upgrade.RequestedAt,
		&upgrade.AckedAt,
		&upgrade.CompletedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("probe upgrade not found")
	}
	return upgrade, err
}

// GetLatestProbeUpgrade 获取探针最近一次升级记录
func (d *Database) GetLatestProbeUpgrade(probeID string) (*model.ProbeUpgrade, error) {
	query := `SELECT id, upgrade_id, probe_id, from_version, target_version, status, error_message, requested_at, acked_at, completed_at
		FROM probe_upgrades WHERE probe_id = ? ORDER BY requested_at DESC, id DESC LIMIT 1`

	upgrade := &model.ProbeUpgrade{}
	err := d.db.QueryRow(query, probeID).Scan(
		&upgrade.ID,
		&upgrade.UpgradeID,
		&upgrade.ProbeID,
		&upgrade.FromVersion,
		&upgrade.TargetVersion,
		&upgrade.Status,
		&upgrade.ErrorMessage,
		&upgrade.RequestedAt,
		&upgrade.AckedAt,
		&upgrade.CompletedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return upgrade, err
}

// GetActiveProbeUpgrade 获取探针当前未结束的升级记录
func (d *Database) GetActiveProbeUpgrade(probeID string) (*model.ProbeUpgrade, error) {
	query := `SELECT id, upgrade_id, probe_id, from_version, target_version, status, error_message, requested_at, acked_at, completed_at
		FROM probe_upgrades
		WHERE probe_id = ? AND status IN (?, ?)
		ORDER BY requested_at DESC, id DESC LIMIT 1`

	upgrade := &model.ProbeUpgrade{}
	err := d.db.QueryRow(query, probeID, model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted).Scan(
		&upgrade.ID,
		&upgrade.UpgradeID,
		&upgrade.ProbeID,
		&upgrade.FromVersion,
		&upgrade.TargetVersion,
		&upgrade.Status,
		&upgrade.ErrorMessage,
		&upgrade.RequestedAt,
		&upgrade.AckedAt,
		&upgrade.CompletedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return upgrade, err
}

// MarkProbeUpgradeAccepted 标记升级请求已被探针接受
func (d *Database) MarkProbeUpgradeAccepted(upgradeID string) error {
	now := time.Now()
	_, err := d.db.Exec(`
		UPDATE probe_upgrades
		SET status = ?,
		    acked_at = COALESCE(acked_at, ?),
		    error_message = NULL
		WHERE upgrade_id = ? AND status IN (?, ?)
	`, model.ProbeUpgradeStatusAccepted, now, upgradeID, model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted)
	return err
}

// MarkProbeUpgradeRejected 标记升级请求被探针拒绝
func (d *Database) MarkProbeUpgradeRejected(upgradeID, message string) error {
	now := time.Now()
	_, err := d.db.Exec(`
		UPDATE probe_upgrades
		SET status = ?,
		    acked_at = COALESCE(acked_at, ?),
		    completed_at = COALESCE(completed_at, ?),
		    error_message = ?
		WHERE upgrade_id = ? AND status IN (?, ?)
	`, model.ProbeUpgradeStatusRejected, now, now, strings.TrimSpace(message), upgradeID, model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted)
	return err
}

// MarkProbeUpgradeFailed 标记升级请求失败
func (d *Database) MarkProbeUpgradeFailed(upgradeID, message string) error {
	now := time.Now()
	_, err := d.db.Exec(`
		UPDATE probe_upgrades
		SET status = ?,
		    completed_at = COALESCE(completed_at, ?),
		    error_message = ?
		WHERE upgrade_id = ? AND status IN (?, ?)
	`, model.ProbeUpgradeStatusFailed, now, strings.TrimSpace(message), upgradeID, model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted)
	return err
}

// MarkProbeUpgradeApplied 标记升级完成
func (d *Database) MarkProbeUpgradeApplied(upgradeID string) error {
	now := time.Now()
	_, err := d.db.Exec(`
		UPDATE probe_upgrades
		SET status = ?,
		    acked_at = COALESCE(acked_at, ?),
		    completed_at = COALESCE(completed_at, ?),
		    error_message = NULL
		WHERE upgrade_id = ? AND status IN (?, ?)
	`, model.ProbeUpgradeStatusApplied, now, now, upgradeID, model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted)
	return err
}

// ReconcileProbeUpgradeVersion 根据探针最新注册版本回写升级结果
func (d *Database) ReconcileProbeUpgradeVersion(probeID, currentVersion string) (*model.ProbeUpgrade, error) {
	currentVersion = strings.TrimSpace(currentVersion)
	if currentVersion == "" {
		return nil, nil
	}

	upgrade, err := d.GetActiveProbeUpgrade(probeID)
	if err != nil || upgrade == nil {
		return upgrade, err
	}

	if strings.TrimSpace(upgrade.TargetVersion) != currentVersion {
		return upgrade, nil
	}

	if err := d.MarkProbeUpgradeApplied(upgrade.UpgradeID); err != nil {
		return nil, err
	}

	return d.GetProbeUpgrade(upgrade.UpgradeID)
}

// TimeoutStaleProbeUpgrades 将超时未完成的升级标记为 timeout
func (d *Database) TimeoutStaleProbeUpgrades(timeout time.Duration) (int64, error) {
	if timeout <= 0 {
		return 0, nil
	}

	now := time.Now()
	cutoff := now.Add(-timeout)
	result, err := d.db.Exec(`
		UPDATE probe_upgrades
		SET status = ?,
		    completed_at = COALESCE(completed_at, ?),
		    error_message = CASE
		        WHEN error_message IS NULL OR error_message = '' THEN ?
		        ELSE error_message
		    END
		WHERE status IN (?, ?)
		  AND COALESCE(acked_at, requested_at) < ?
	`, model.ProbeUpgradeStatusTimeout, now, "probe did not report target version before timeout", model.ProbeUpgradeStatusQueued, model.ProbeUpgradeStatusAccepted, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
