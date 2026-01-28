package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"time"

	"github.com/google/uuid"

	"atlas/shared/protocol"
	"atlas/web/internal/geoip"
	"atlas/web/internal/model"
)

// handleRegister 处理探针注册
func (c *Connection) handleRegister(msg map[string]interface{}) error {
	dataBytes, _ := json.Marshal(msg["data"])
	var registerMsg protocol.RegisterMessage
	if err := json.Unmarshal(dataBytes, &registerMsg); err != nil {
		return err
	}

	log.Printf("[Handler] Probe registering: %s (%s) from IP: %s", registerMsg.Name, registerMsg.ProbeID, c.RemoteIP)

	// 验证认证令牌
	// 优先使用数据库中的 shared_secret（允许后台动态修改），否则使用启动配置
	secret, err := c.hub.db.GetConfig("shared_secret")
	if err != nil || secret == "" {
		secret = c.hub.sharedSecret
	}
	if registerMsg.AuthToken != secret {
		log.Printf("[Handler] Invalid auth token from probe: %s", registerMsg.ProbeID)
		c.sendMessage("register_ack", protocol.RegisterAckMessage{
			Success: false,
			Message: "Invalid auth token",
		})
		c.ws.Close()
		return nil
	}

	// 保存探针信息
	capabilitiesJSON, _ := json.Marshal(registerMsg.Capabilities)
	metadataJSON, _ := json.Marshal(registerMsg.Metadata)

	// 提取 IP 地址(去除端口)
	probeIP := c.RemoteIP
	if idx := len(probeIP) - 1; idx >= 0 {
		for i := idx; i >= 0; i-- {
			if probeIP[i] == ':' {
				probeIP = probeIP[:i]
				break
			}
		}
	}

	probe := &model.Probe{
		ProbeID:       registerMsg.ProbeID,
		Name:          registerMsg.Name,
		Location:      registerMsg.Location,
		Region:        registerMsg.Region,
		IPAddress:     probeIP,
		Capabilities:  string(capabilitiesJSON),
		Status:        "online",
		LastHeartbeat: time.Now(),
		Metadata:      string(metadataJSON),
		AuthToken:     registerMsg.AuthToken,
	}

	// 从 metadata 中提取经纬度(如果有)
	if lat, ok := registerMsg.Metadata["latitude"]; ok {
		if latVal, err := parseFloat64(lat); err == nil {
			probe.Latitude = &latVal
			log.Printf("[Handler] Using latitude from metadata: %f", latVal)
		}
	}
	if lon, ok := registerMsg.Metadata["longitude"]; ok {
		if lonVal, err := parseFloat64(lon); err == nil {
			probe.Longitude = &lonVal
			log.Printf("[Handler] Using longitude from metadata: %f", lonVal)
		}
	}

	// 如果没有坐标信息,从 IP 数据库查询
	if probe.Latitude == nil || probe.Longitude == nil {
		log.Printf("[Handler] Querying GeoIP for %s...", probeIP)
		if location, err := c.hub.geoip.Lookup(probeIP); err == nil {
			probe.Latitude = &location.Latitude
			probe.Longitude = &location.Longitude
			log.Printf("[Handler] GeoIP lookup success: %s, %s (%.4f, %.4f)",
				location.City, location.Country, location.Latitude, location.Longitude)

			// 如果 location 为空,尝试从 GeoIP 结果更新
			if registerMsg.Location == "" || registerMsg.Location == "Unknown" {
				if location.City != "" {
					probe.Location = fmt.Sprintf("%s, %s", location.City, location.Country)
				}
			}
		} else {
			log.Printf("[Handler] GeoIP lookup failed: %v", err)

			// 如果是本地IP,使用默认位置
			if probeIP == "127.0.0.1" || probeIP == "::1" || probeIP == "localhost" || probeIP == "[::1]" {
				log.Printf("[Handler] Using default location for local IP")
				defaultLat := 39.9042 // Beijing
				defaultLon := 116.4074
				probe.Latitude = &defaultLat
				probe.Longitude = &defaultLon
				if probe.Location == "" {
					probe.Location = "Beijing, China (Local)"
				}
				if probe.Region == "" {
					probe.Region = "Beijing"
				}
			}
		}
	}

	if err := c.hub.db.SaveProbe(probe); err != nil {
		log.Printf("[Handler] Failed to save probe: %v", err)
		c.sendMessage("register_ack", protocol.RegisterAckMessage{
			Success: false,
			Message: fmt.Sprintf("Failed to save probe info: %v", err),
		})
		return err
	}

	// 设置连接的ProbeID
	c.ProbeID = registerMsg.ProbeID

	// 注册到Hub
	c.hub.register <- c

	// 发送注册成功响应
	c.sendMessage("register_ack", protocol.RegisterAckMessage{
		Success: true,
		ProbeID: registerMsg.ProbeID,
		Message: "Registration successful",
		Config: protocol.ProbeConfig{
			HeartbeatInterval:  30,
			MaxConcurrentTasks: 5,
		},
	})

	log.Printf("[Handler] Probe registered successfully: %s", registerMsg.Name)
	return nil
}

func parseFloat64(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}

// handleHeartbeat 处理心跳消息
func (c *Connection) handleHeartbeat(msg map[string]interface{}) error {
	dataBytes, _ := json.Marshal(msg["data"])
	var heartbeatMsg protocol.HeartbeatMessage
	if err := json.Unmarshal(dataBytes, &heartbeatMsg); err != nil {
		return err
	}

	// 更新探针心跳时间
	if err := c.hub.db.UpdateProbeHeartbeat(heartbeatMsg.ProbeID); err != nil {
		log.Printf("[Handler] Failed to update heartbeat: %v", err)
		return err
	}

	// 更新探针状态
	if err := c.hub.db.UpdateProbeStatus(heartbeatMsg.ProbeID, heartbeatMsg.Status); err != nil {
		log.Printf("[Handler] Failed to update probe status: %v", err)
	}

	// 发送心跳响应
	c.sendMessage("heartbeat_ack", protocol.HeartbeatAckMessage{
		Timestamp:     time.Now().Unix(),
		NextHeartbeat: 30,
	})

	return nil
}

// handleTaskResult 处理任务结果
func (c *Connection) handleTaskResult(msg map[string]interface{}) error {
	dataBytes, _ := json.Marshal(msg["data"])
	var resultMsg protocol.TaskResultMessage
	if err := json.Unmarshal(dataBytes, &resultMsg); err != nil {
		return err
	}

	log.Printf("[Handler] Received task result: execution=%s, status=%s", resultMsg.ExecutionID, resultMsg.Status)

	// 更新执行记录
	execution, err := c.hub.db.GetExecution(resultMsg.ExecutionID)
	if err != nil {
		log.Printf("[Handler] Failed to get execution: %v", err)
		return err
	}

	now := time.Now()
	execution.Status = resultMsg.Status
	execution.CompletedAt = &now
	if resultMsg.Error != "" {
		execution.Error = &resultMsg.Error
	} else {
		execution.Error = nil
	}

	if err := c.hub.db.UpdateExecution(execution); err != nil {
		log.Printf("[Handler] Failed to update execution: %v", err)
		return err
	}

	// 获取任务信息以获取正确的target和test_type
	task, err := c.hub.db.GetTask(resultMsg.TaskID)
	if err != nil {
		log.Printf("[Handler] Failed to get task: %v", err)
		return err
	}

	// 为 traceroute 结果富化 hops IP 的 GeoIP/ISP 信息
	if task.TaskType == "traceroute" && c.hub.geoip != nil {
		enrichHopsWithGeoIP(resultMsg.ResultData, c.hub.geoip)
	}

	// 保存测试结果
	resultDataJSON, _ := json.Marshal(resultMsg.ResultData)

	// 提取摘要信息
	summary := extractSummary(resultMsg.ResultData)

	// 提取 resolved_ip 并查询 ISP/ASN 信息
	resolvedIP := extractResolvedIP(resultMsg.ResultData)
	if resolvedIP != "" && c.hub.geoip != nil {
		location, err := c.hub.geoip.Lookup(resolvedIP)
		if err == nil && location != nil {
			if location.ISP != "" {
				summary["target_isp"] = location.ISP
			}
			if location.ASN != "" {
				summary["target_asn"] = location.ASN
			}
			if location.ASName != "" {
				summary["target_as_name"] = location.ASName
			}
		}
	}

	summaryJSON, _ := json.Marshal(summary)

	result := &model.Result{
		ResultID:    uuid.New().String(),
		ExecutionID: resultMsg.ExecutionID,
		TaskID:      resultMsg.TaskID,
		ProbeID:     resultMsg.ProbeID,
		Target:      task.Target,
		TestType:    task.TaskType,
		Status:      resultMsg.Status,
		ResultData:  string(resultDataJSON),
		Summary:     string(summaryJSON),
	}

	if err := c.hub.db.SaveResult(result); err != nil {
		log.Printf("[Handler] Failed to save result: %v", err)
		return err
	}

	// 检查任务的所有执行是否都完成了
	executions, err := c.hub.db.ListExecutionsByTask(resultMsg.TaskID)
	if err == nil {
		allCompleted := true
		for _, exec := range executions {
			if exec.Status == "pending" || exec.Status == "running" {
				allCompleted = false
				break
			}
		}

		// 如果所有执行都完成,更新任务状态
		if allCompleted {
			task, _ := c.hub.db.GetTask(resultMsg.TaskID)
			if task != nil && task.Mode == "single" {
				task.Status = "completed"
				now := time.Now()
				task.CompletedAt = &now
				c.hub.db.UpdateTask(task)
				log.Printf("[Handler] Task completed: %s", resultMsg.TaskID)
			}
		}
	}

	return nil
}

// handleTaskStatus 处理任务状态更新
func (c *Connection) handleTaskStatus(msg map[string]interface{}) error {
	dataBytes, _ := json.Marshal(msg["data"])
	var statusMsg protocol.TaskStatusMessage
	if err := json.Unmarshal(dataBytes, &statusMsg); err != nil {
		return err
	}

	log.Printf("[Handler] Task status update: execution=%s, status=%s, progress=%d%%",
		statusMsg.ExecutionID, statusMsg.Status, statusMsg.Progress)

	// 更新执行状态
	execution, err := c.hub.db.GetExecution(statusMsg.ExecutionID)
	if err != nil {
		return err
	}

	execution.Status = statusMsg.Status
	return c.hub.db.UpdateExecution(execution)
}

// handleError 处理错误消息
func (c *Connection) handleError(msg map[string]interface{}) error {
	dataBytes, _ := json.Marshal(msg["data"])
	var errorMsg protocol.ErrorMessage
	if err := json.Unmarshal(dataBytes, &errorMsg); err != nil {
		return err
	}

	log.Printf("[Handler] Error from probe %s: [%s] %s - %s",
		c.ProbeID, errorMsg.Code, errorMsg.Message, errorMsg.Details)

	return nil
}

// handlePing 处理ping消息
func (c *Connection) handlePing(msg map[string]interface{}) error {
	return c.sendMessage("pong", map[string]interface{}{
		"timestamp": time.Now().Unix(),
	})
}

// extractSummary 从结果数据中提取摘要
func extractSummary(resultData interface{}) map[string]interface{} {
	summary := make(map[string]interface{})

	dataMap, ok := resultData.(map[string]interface{})
	if !ok {
		return summary
	}

	// 根据不同类型的结果提取关键指标
	if avgRTT, ok := dataMap["avg_rtt_ms"]; ok {
		summary["avg_latency"] = avgRTT
	}
	if avgConnTime, ok := dataMap["avg_connect_time_ms"]; ok {
		summary["avg_latency"] = avgConnTime
	}
	if packetLoss, ok := dataMap["packet_loss_percent"]; ok {
		summary["packet_loss"] = packetLoss
	}

	return summary
}

// extractResolvedIP 从结果数据中提取解析后的IP地址
func extractResolvedIP(resultData interface{}) string {
	dataMap, ok := resultData.(map[string]interface{})
	if !ok {
		return ""
	}

	// ICMP Ping / HTTP / Traceroute: resolved_ip 字段
	if ip, ok := dataMap["resolved_ip"].(string); ok && ip != "" {
		return ip
	}

	// TCP Ping: target 字段可能包含端口，需要提取主机部分
	if target, ok := dataMap["target"].(string); ok && target != "" {
		// 尝试去除端口
		for i := len(target) - 1; i >= 0; i-- {
			if target[i] == ':' {
				// 检查是否为 IPv6（包含多个冒号）
				colonCount := 0
				for j := 0; j < len(target); j++ {
					if target[j] == ':' {
						colonCount++
					}
				}
				if colonCount > 1 {
					// IPv6 地址，不处理
					return target
				}
				// IPv4:port 或 domain:port 形式
				return target[:i]
			}
		}
		return target
	}

	return ""
}

// enrichHopsWithGeoIP 为 traceroute hops 中的 IP 富化 GeoIP/ISP 信息
func enrichHopsWithGeoIP(resultData interface{}, geoipService *geoip.GeoIPService) {
	dataMap, ok := resultData.(map[string]interface{})
	if !ok {
		return
	}

	hopsRaw, ok := dataMap["hops"]
	if !ok {
		return
	}

	hops, ok := hopsRaw.([]interface{})
	if !ok {
		return
	}

	for _, hopRaw := range hops {
		hop, ok := hopRaw.(map[string]interface{})
		if !ok {
			continue
		}

		ipStr, ok := hop["ip"].(string)
		if !ok || ipStr == "" || ipStr == "*" {
			continue
		}

		// 跳过私有IP
		parsedIP := net.ParseIP(ipStr)
		if parsedIP != nil && (parsedIP.IsPrivate() || parsedIP.IsLoopback()) {
			continue
		}

		// 查询 GeoIP
		location, err := geoipService.Lookup(ipStr)
		if err != nil || location == nil {
			continue
		}

		// 写入 geo 字段
		hop["geo"] = map[string]interface{}{
			"isp":       location.ISP,
			"asn":       location.ASN,
			"as_name":   location.ASName,
			"country":   location.Country,
			"region":    location.Region,
			"city":      location.City,
			"latitude":  location.Latitude,
			"longitude": location.Longitude,
		}
	}
}
