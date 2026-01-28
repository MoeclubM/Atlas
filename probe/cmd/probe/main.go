package main

import (
	"flag"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"syscall"

	"atlas/probe/internal/client"
	"atlas/probe/internal/config"
	"atlas/probe/internal/geoip"
	"atlas/probe/internal/manager"
)

func hasCommand(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func filterCapabilities(caps []string) []string {
	filtered := make([]string, 0, len(caps))
	for _, c := range caps {
		switch c {
		case "icmp_ping":
			if hasCommand("ping") {
				filtered = append(filtered, c)
			}
		case "tcp_ping":
			filtered = append(filtered, c)
		case "traceroute":
			if hasCommand("traceroute") {
				filtered = append(filtered, c)
			}
		case "bird_route":
			if hasCommand("birdc") {
				filtered = append(filtered, c)
			}
		default:
			filtered = append(filtered, c)
		}
	}
	return filtered
}

func main() {
	log.Println("=== Atlas Probe ===")

	configPath := flag.String("config", "config.yaml", "path to probe config file")
	flag.Parse()

	// 加载配置
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Printf("Failed to load config (using defaults): %v", err)
	}

	log.Printf("Probe: %s", cfg.Probe.Name)
	log.Printf("Location: %s", cfg.Probe.Location)
	log.Printf("Server: %s", cfg.Server.URL)

	// 补齐能力声明：探针实现了 http_test，但默认配置里可能没有包含
	caps := make([]string, 0, len(cfg.Capabilities)+1)
	seen := map[string]bool{}
	for _, c := range cfg.Capabilities {
		seen[c] = true
		caps = append(caps, c)
	}
	if !seen["http_test"] {
		caps = append(caps, "http_test")
	}
	cfg.Capabilities = filterCapabilities(caps)
	log.Printf("Capabilities: %v", cfg.Capabilities)

	// 自动获取IP和地理位置信息
	log.Println("Auto-detecting IP and geolocation...")
	ipInfo, err := geoip.GetIPInfo()
	if err != nil {
		log.Printf("Failed to auto-detect IP/location: %v", err)
	} else {
		log.Printf("Public IP: %s", ipInfo.IP)
		log.Printf("Location: %s, %s, %s", ipInfo.City, ipInfo.Region, ipInfo.Country)
		log.Printf("Coordinates: (%.4f, %.4f)", ipInfo.Latitude, ipInfo.Longitude)
		if ipInfo.ASN != "" {
			log.Printf("ASN: %s | ISP: %s", ipInfo.ASN, ipInfo.ISP)
		}

		// 强制使用自动检测的信息，覆盖配置
		cfg.Probe.Location = ipInfo.City + ", " + ipInfo.Country
		cfg.Probe.Latitude = &ipInfo.Latitude
		cfg.Probe.Longitude = &ipInfo.Longitude
		cfg.Probe.Region = ipInfo.Country

		// 上报 ASN/ISP（探针侧自动识别，不需要手动输入运营商）
		if ipInfo.ASN != "" {
			_ = os.Setenv("PROBE_ASN", ipInfo.ASN)
		}
		if ipInfo.ISP != "" {
			_ = os.Setenv("PROBE_ISP", ipInfo.ISP)
		}

		log.Printf("Auto-configured location: %s", cfg.Probe.Location)
		log.Printf("Auto-configured region: %s", cfg.Probe.Region)
		log.Printf("Auto-configured coordinates: (%.4f, %.4f)", *cfg.Probe.Latitude, *cfg.Probe.Longitude)
	}

	// 创建任务管理器
	taskManager := manager.New(cfg.Executor.MaxConcurrentTasks)
	taskManager.Start()

	// 创建WebSocket客户端
	wsClient := client.New(cfg, taskManager)

	// 连接到服务端
	if err := wsClient.Connect(); err != nil {
		log.Fatalf("Failed to connect to server: %v", err)
	}

	log.Println("Probe started successfully")

	// 等待退出信号
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
	wsClient.Close()
	taskManager.Stop()

	log.Println("Probe stopped")
}
