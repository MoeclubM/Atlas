package websocket

import (
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// 发送消息超时时间
	writeWait = 10 * time.Second

	// 等待pong消息的超时时间
	pongWait = 60 * time.Second

	// ping消息发送周期
	pingPeriod = (pongWait * 9) / 10

	// 最大消息大小
	maxMessageSize = 1024 * 1024 // 1MB
)


var (
	ErrProbeNotConnected = errors.New("probe not connected")
	ErrSendTimeout       = errors.New("send message timeout")
)

// Connection WebSocket连接封装
type Connection struct {
	hub      *Hub
	ws       *websocket.Conn
	send     chan []byte
	ProbeID  string
	RemoteIP string
}

// readPump 读取消息
func (c *Connection) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.ws.Close()
	}()

	c.ws.SetReadLimit(maxMessageSize)
	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Connection] WebSocket error: %v", err)
			}
			break
		}

		// 处理接收到的消息
		if err := c.handleMessage(message); err != nil {
			log.Printf("[Connection] Failed to handle message: %v", err)
		}
	}
}

// writePump 发送消息
func (c *Connection) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.ws.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub关闭了发送通道
				_ = c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// 保持“一帧一条 JSON 消息”，避免多条消息拼接导致 probe 端 json.Unmarshal 失败
			if err := c.ws.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage 处理接收到的消息
func (c *Connection) handleMessage(message []byte) error {
	var msg map[string]interface{}
	if err := json.Unmarshal(message, &msg); err != nil {
		return err
	}

	msgType, ok := msg["type"].(string)
	if !ok {
		return errors.New("invalid message type")
	}

	// 根据消息类型路由到相应的处理器
	switch msgType {
	case "register":
		return c.handleRegister(msg)
	case "heartbeat":
		return c.handleHeartbeat(msg)
	case "task_result":
		return c.handleTaskResult(msg)
	case "task_status":
		return c.handleTaskStatus(msg)
	case "error":
		return c.handleError(msg)
	case "ping":
		return c.handlePing(msg)
	default:
		log.Printf("[Connection] Unknown message type: %s", msgType)
	}

	return nil
}

// sendMessage 发送消息
func (c *Connection) sendMessage(msgType string, data interface{}) error {
	message := map[string]interface{}{
		"type":      msgType,
		"timestamp": time.Now().Unix(),
		"data":      data,
	}

	msgBytes, err := json.Marshal(message)
	if err != nil {
		return err
	}

	select {
	case c.send <- msgBytes:
		return nil
	case <-time.After(writeWait):
		return ErrSendTimeout
	}
}
