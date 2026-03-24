CREATE TABLE IF NOT EXISTS probe_upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upgrade_id TEXT UNIQUE NOT NULL,
    probe_id TEXT NOT NULL,
    from_version TEXT,
    target_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acked_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (probe_id) REFERENCES probes(probe_id)
);

CREATE INDEX IF NOT EXISTS idx_probe_upgrades_probe_id ON probe_upgrades(probe_id);
CREATE INDEX IF NOT EXISTS idx_probe_upgrades_status ON probe_upgrades(status);
CREATE INDEX IF NOT EXISTS idx_probe_upgrades_requested_at ON probe_upgrades(requested_at);
