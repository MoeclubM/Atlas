package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"atlas/web/internal/database"
	"atlas/web/internal/geoip"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源,生产环境应该限制
	},
}

// Hub WebSocket中心,管理所有连接
type Hub struct {
	db           *database.Database
	geoip        *geoip.GeoIPService
	connections  map[string]*Connection // probeID -> Connection
	register     chan *Connection
	unregister   chan *Connection
	mu           sync.RWMutex
	sharedSecret string
}

// NewHub 创建新的Hub
func NewHub(db *database.Database, sharedSecret string) *Hub {
	return &Hub{
		db:           db,
		geoip:        geoip.New(),
		connections:  make(map[string]*Connection),
		register:     make(chan *Connection),
		unregister:   make(chan *Connection),
		sharedSecret: sharedSecret,
	}
}

// Run 启动Hub
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.register:
			h.mu.Lock()
			h.connections[conn.ProbeID] = conn
			h.mu.Unlock()
			log.Printf("[Hub] Registered probe: %s", conn.ProbeID)

		case conn := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.connections[conn.ProbeID]; ok {
				delete(h.connections, conn.ProbeID)
				close(conn.send)
				log.Printf("[Hub] Unregistered probe: %s", conn.ProbeID)

				// 更新数据库状态
				if err := h.db.UpdateProbeStatus(conn.ProbeID, "offline"); err != nil {
					log.Printf("[Hub] Failed to update probe status: %v", err)
				}
			}
			h.mu.Unlock()
		}
	}
}

// HandleConnection 处理WebSocket连接请求
func (h *Hub) HandleConnection(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Hub] WebSocket upgrade failed: %v", err)
		return
	}

	// 获取客户端 IP 地址
	remoteIP := r.Header.Get("X-Forwarded-For")
	if remoteIP == "" {
		remoteIP = r.Header.Get("X-Real-IP")
	}
	if remoteIP == "" {
		remoteIP = r.RemoteAddr
	}

	conn := &Connection{
		hub:      h,
		ws:       ws,
		send:     make(chan []byte, 256),
		RemoteIP: remoteIP,
	}

	// 启动读写协程
	go conn.writePump()
	go conn.readPump()
}

// SendToProbe 向指定探针发送消息
func (h *Hub) SendToProbe(probeID, msgType string, data interface{}) error {
	h.mu.RLock()
	conn, ok := h.connections[probeID]
	h.mu.RUnlock()

	if !ok {
		return ErrProbeNotConnected
	}

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
	case conn.send <- msgBytes:
		return nil
	default:
		return ErrSendTimeout
	}
}

// IsProbeOnline 检查探针是否在线
func (h *Hub) IsProbeOnline(probeID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[probeID]
	return ok
}
