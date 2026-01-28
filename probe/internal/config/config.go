package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config Probe配置
type Config struct {
	Probe        ProbeConfig    `yaml:"probe"`
	Server       ServerConfig   `yaml:"server"`
	Capabilities []string       `yaml:"capabilities"`
	Executor     ExecutorConfig `yaml:"executor"`
	Logging      LoggingConfig  `yaml:"logging"`
}

// ProbeConfig 探针信息
type ProbeConfig struct {
	Name      string   `yaml:"name"`
	Location  string   `yaml:"location"`
	Region    string   `yaml:"region"`
	Latitude  *float64 `yaml:"latitude,omitempty"`  // 纬度
	Longitude *float64 `yaml:"longitude,omitempty"` // 经度
}

// ServerConfig 服务器连接配置
type ServerConfig struct {
	URL                   string `yaml:"url"`                     // WebSocket URL
	AuthToken             string `yaml:"auth_token"`
	ReconnectInterval     int    `yaml:"reconnect_interval"`      // 秒
	MaxReconnectAttempts  int    `yaml:"max_reconnect_attempts"`  // 0表示无限重试
}

// ExecutorConfig 执行器配置
type ExecutorConfig struct {
	MaxConcurrentTasks int `yaml:"max_concurrent_tasks"`
	TaskTimeout        int `yaml:"task_timeout"` // 秒
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
		Probe: ProbeConfig{
			Name:     "Default Probe",
			Location: "", // 留空以自动检测
			Region:   "", // 留空以自动检测
		},
		Server: ServerConfig{
			URL:                  "ws://localhost:8080/ws",
			AuthToken:            "your-secret-key",
			ReconnectInterval:    5,
			MaxReconnectAttempts: 0, // 无限重试
		},
		Capabilities: []string{"icmp_ping", "tcp_ping", "traceroute", "bird_route"},
		Executor: ExecutorConfig{
			MaxConcurrentTasks: 5,
			TaskTimeout:        300,
		},
		Logging: LoggingConfig{
			Level: "info",
			File:  "./logs/probe.log",
		},
	}

	// 如果配置文件存在,读取并覆盖默认值
	if _, err := os.Stat(configPath); err == nil {
		data, err := os.ReadFile(configPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}

		if err := yaml.Unmarshal(data, config); err != nil {
			return nil, fmt.Errorf("failed to parse config file: %w", err)
		}
	}

	// 从环境变量覆盖
	if name := os.Getenv("PROBE_NAME"); name != "" {
		config.Probe.Name = name
	}
	if location := os.Getenv("PROBE_LOCATION"); location != "" {
		config.Probe.Location = location
	}
	if region := os.Getenv("PROBE_REGION"); region != "" {
		config.Probe.Region = region
	}
	if lat := os.Getenv("PROBE_LATITUDE"); lat != "" {
		if latVal, err := parseFloat(lat); err == nil {
			config.Probe.Latitude = &latVal
		}
	}
	if lon := os.Getenv("PROBE_LONGITUDE"); lon != "" {
		if lonVal, err := parseFloat(lon); err == nil {
			config.Probe.Longitude = &lonVal
		}
	}
	if url := os.Getenv("WEB_SERVER_URL"); url != "" {
		config.Server.URL = url
	}
	if token := os.Getenv("AUTH_TOKEN"); token != "" {
		config.Server.AuthToken = token
	}

	return config, nil
}

func parseFloat(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}
