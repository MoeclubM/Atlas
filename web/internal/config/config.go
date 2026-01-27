package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config Web服务端配置
type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	WebSocket WebSocketConfig `yaml:"websocket"`
	Scheduler SchedulerConfig `yaml:"scheduler"`
	Security  SecurityConfig  `yaml:"security"`
	Logging   LoggingConfig   `yaml:"logging"`
}

// ServerConfig HTTP服务器配置
type ServerConfig struct {
	Port       int    `yaml:"port"`
	Mode       string `yaml:"mode"` // debug/release
	StaticPath string `yaml:"static_path"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Path           string `yaml:"path"`
	MaxConnections int    `yaml:"max_connections"`
}

// WebSocketConfig WebSocket配置
type WebSocketConfig struct {
	HeartbeatInterval int   `yaml:"heartbeat_interval"` // 秒
	ReadTimeout       int   `yaml:"read_timeout"`
	WriteTimeout      int   `yaml:"write_timeout"`
	MaxMessageSize    int64 `yaml:"max_message_size"`
}

// SchedulerConfig 调度器配置
type SchedulerConfig struct {
	WorkerCount        int `yaml:"worker_count"`
	ScanInterval       int `yaml:"scan_interval"` // 秒
	MaxConcurrentTasks int `yaml:"max_concurrent_tasks"`
}

// SecurityConfig 安全配置
type SecurityConfig struct {
	SharedSecret    string   `yaml:"shared_secret"`
	JWTSecret       string   `yaml:"jwt_secret"`
	AdminPassword   string   `yaml:"admin_password"`
	CORSOrigins     []string `yaml:"cors_origins"`
}

// LoggingConfig 日志配置
type LoggingConfig struct {
	Level string `yaml:"level"` // debug/info/warn/error
	File  string `yaml:"file"`
}

// Load 加载配置文件
func Load(configPath string) (*Config, error) {
	// 设置默认配置
	config := &Config{
		Server: ServerConfig{
			Port:       8080,
			Mode:       "debug",
			StaticPath: "./static",
		},
		Database: DatabaseConfig{
			Path:           "./data/atlas.db",
			MaxConnections: 10,
		},
		WebSocket: WebSocketConfig{
			HeartbeatInterval: 30,
			ReadTimeout:       60,
			WriteTimeout:      60,
			MaxMessageSize:    1048576, // 1MB
		},
		Scheduler: SchedulerConfig{
			WorkerCount:        4,
			ScanInterval:       1,
			MaxConcurrentTasks: 100,
		},
		Security: SecurityConfig{
			SharedSecret:  "your-secret-key-change-in-production",
			JWTSecret:     "your-jwt-secret-change-in-production",
			AdminPassword: "change-me",
			CORSOrigins:   []string{"*"},
		},
		Logging: LoggingConfig{
			Level: "info",
			File:  "./logs/atlas.log",
		},
	}

	// 如果配置文件存在,读取并覆盖默认值
	if resolvedPath, ok := resolveConfigPath(configPath); ok {
		data, err := os.ReadFile(resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}

		if err := yaml.Unmarshal(data, config); err != nil {
			return nil, fmt.Errorf("failed to parse config file: %w", err)
		}

		applyRelativePaths(filepath.Dir(resolvedPath), config)
	}

	// 从环境变量覆盖
	if port := os.Getenv("SERVER_PORT"); port != "" {
		fmt.Sscanf(port, "%d", &config.Server.Port)
	}
	if dbPath := os.Getenv("DB_PATH"); dbPath != "" {
		config.Database.Path = dbPath
	}
	if secret := os.Getenv("SHARED_SECRET"); secret != "" {
		config.Security.SharedSecret = secret
	}
	if jwtSecret := os.Getenv("JWT_SECRET"); jwtSecret != "" {
		config.Security.JWTSecret = jwtSecret
	}
	if adminPassword := os.Getenv("ADMIN_PASSWORD"); adminPassword != "" {
		config.Security.AdminPassword = adminPassword
	}

	return config, nil
}

func resolveConfigPath(configPath string) (string, bool) {
	if configPath == "" {
		return "", false
	}
	if _, err := os.Stat(configPath); err == nil {
		return configPath, true
	}
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), configPath)
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate, true
		}
	}
	return "", false
}

func applyRelativePaths(baseDir string, cfg *Config) {
	if cfg == nil {
		return
	}
	if cfg.Server.StaticPath != "" && !filepath.IsAbs(cfg.Server.StaticPath) {
		cfg.Server.StaticPath = filepath.Clean(filepath.Join(baseDir, cfg.Server.StaticPath))
	}
	if cfg.Database.Path != "" && !filepath.IsAbs(cfg.Database.Path) {
		cfg.Database.Path = filepath.Clean(filepath.Join(baseDir, cfg.Database.Path))
	}
	if cfg.Logging.File != "" && !filepath.IsAbs(cfg.Logging.File) {
		cfg.Logging.File = filepath.Clean(filepath.Join(baseDir, cfg.Logging.File))
	}
}
