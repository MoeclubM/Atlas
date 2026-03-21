package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config Web服务端配置
type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Scheduler SchedulerConfig `yaml:"scheduler"`
	Security  SecurityConfig  `yaml:"security"`
}

// ServerConfig HTTP服务器配置
type ServerConfig struct {
	Port       int    `yaml:"port"`
	Mode       string `yaml:"mode"` // debug/release
	StaticPath string `yaml:"static_path"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Path string `yaml:"path"`
}

// SchedulerConfig 调度器配置
type SchedulerConfig struct {
	ScanInterval int `yaml:"scan_interval"` // 秒
}

// SecurityConfig 安全配置
type SecurityConfig struct {
	SharedSecret  string `yaml:"shared_secret"`
	JWTSecret     string `yaml:"jwt_secret"`
	AdminPassword string `yaml:"admin_password"`
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
			Path: "./data/atlas.db",
		},
		Scheduler: SchedulerConfig{
			ScanInterval: 1,
		},
		Security: SecurityConfig{
			SharedSecret:  "your-secret-key-change-in-production",
			JWTSecret:     "your-jwt-secret-change-in-production",
			AdminPassword: "change-me",
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
	if mode := strings.TrimSpace(os.Getenv("GIN_MODE")); mode != "" {
		config.Server.Mode = mode
	} else if mode := strings.TrimSpace(os.Getenv("SERVER_MODE")); mode != "" {
		config.Server.Mode = mode
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
}
