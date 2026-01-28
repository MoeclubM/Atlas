-- Atlas Network Testing Platform Database Schema

-- 1. Probes表 (探针信息)
CREATE TABLE IF NOT EXISTS probes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    probe_id TEXT UNIQUE NOT NULL,           -- 唯一标识符 (UUID)
    name TEXT NOT NULL,                       -- 探针名称
    location TEXT NOT NULL,                   -- 地理位置 (国家/城市)
    region TEXT,                              -- 区域标识 (asia/us/eu等)
    ip_address TEXT,                          -- 探针IP地址
    capabilities TEXT,                        -- 支持的测试类型 JSON: ["icmp","tcp","traceroute","bird"]
    status TEXT DEFAULT 'offline',            -- 状态: online/offline/busy
    last_heartbeat DATETIME,                  -- 最后心跳时间
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,                            -- 额外信息 JSON: {"os":"linux","version":"1.0.0"}
    auth_token TEXT UNIQUE                    -- 认证令牌
);

CREATE INDEX IF NOT EXISTS idx_probes_probe_id ON probes(probe_id);
CREATE INDEX IF NOT EXISTS idx_probes_status ON probes(status);

-- 2. Tasks表 (测试任务)
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT UNIQUE NOT NULL,             -- 任务UUID
    user_id INTEGER,                          -- 创建用户ID (可选)
    task_type TEXT NOT NULL,                  -- 任务类型: icmp_ping/tcp_ping/traceroute/bird_route
    mode TEXT NOT NULL,                       -- 模式: single/continuous
    target TEXT NOT NULL,                     -- 测试目标 (IP/域名)
    parameters TEXT,                          -- 测试参数 JSON: {"count":4,"interval":1,"timeout":5}
    assigned_probes TEXT,                     -- 分配的探针列表 JSON: ["probe-1","probe-2"]
    status TEXT DEFAULT 'pending',            -- 状态: pending/running/completed/failed/cancelled
    schedule TEXT,                            -- 调度配置 JSON: {"type":"cron","expr":"*/5 * * * *"}
    priority INTEGER DEFAULT 5,               -- 优先级 1-10
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    next_run_at DATETIME                      -- 下次运行时间(持续任务)
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run_at);

-- 3. Task Executions表 (任务执行记录)
CREATE TABLE IF NOT EXISTS task_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT UNIQUE NOT NULL,        -- 执行UUID
    task_id TEXT NOT NULL,                    -- 关联任务ID
    probe_id TEXT NOT NULL,                   -- 执行探针ID
    status TEXT DEFAULT 'pending',            -- pending/running/success/failed
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error TEXT,                               -- 错误信息
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    FOREIGN KEY (probe_id) REFERENCES probes(probe_id)
);

CREATE INDEX IF NOT EXISTS idx_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_probe_id ON task_executions(probe_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON task_executions(status);

-- 4. Results表 (测试结果)
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id TEXT UNIQUE NOT NULL,           -- 结果UUID
    execution_id TEXT NOT NULL,               -- 关联执行ID
    task_id TEXT NOT NULL,                    -- 关联任务ID
    probe_id TEXT NOT NULL,                   -- 执行探针ID
    target TEXT NOT NULL,                     -- 测试目标
    test_type TEXT NOT NULL,                  -- 测试类型
    status TEXT DEFAULT 'success',            -- 结果状态: success/failed/timeout
    result_data TEXT NOT NULL,                -- 结果数据 JSON
    summary TEXT,                             -- 结果摘要 JSON: {"avg_latency":50,"packet_loss":0}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES task_executions(execution_id),
    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
    FOREIGN KEY (probe_id) REFERENCES probes(probe_id)
);

CREATE INDEX IF NOT EXISTS idx_results_task_id ON results(task_id);
CREATE INDEX IF NOT EXISTS idx_results_probe_id ON results(probe_id);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);

-- 5. Users表 (用户管理,可选)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'user',                 -- user/admin
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- 6. Config表 (系统配置)
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT OR IGNORE INTO config (key, value, description) VALUES
('heartbeat_interval', '30', '探针心跳间隔(秒)'),
('max_concurrent_tasks', '5', '单个探针最大并发任务数'),
('task_timeout', '300', '任务默认超时时间(秒)'),
('scheduler_interval', '5', '调度器扫描间隔(秒)'),
('blocked_networks', '', '禁测网段(CIDR)，每行一个');
