package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"atlas/web/internal/config"
	"atlas/web/internal/database"
)

type AdminHandler struct {
	db  *database.Database
	cfg *config.Config
}

type adminConfigDTO struct {
	SharedSecret    string `json:"shared_secret"`
	BlockedNetworks string `json:"blocked_networks"`

	// 测试参数
	PingMaxRuns               int `json:"ping_max_runs"`
	TCPPingMaxRuns            int `json:"tcp_ping_max_runs"`
	TracerouteTimeoutSeconds  int `json:"traceroute_timeout_seconds"`
}

type adminLoginRequest struct {
	Password string `json:"password"`
}

type adminTokenPayload struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

func NewAdminHandler(db *database.Database, cfg *config.Config) *AdminHandler {
	return &AdminHandler{db: db, cfg: cfg}
}

func (h *AdminHandler) Login(c *gin.Context) {
	var req adminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	if h.cfg == nil || h.cfg.Security.AdminPassword == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Admin password not configured"})
		return
	}

	if req.Password != h.cfg.Security.AdminPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid password"})
		return
	}

	jwtSecret := h.cfg.Security.JWTSecret
	if jwtSecret == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "JWT secret not configured"})
		return
	}

	token, err := h.signAdminToken(jwtSecret, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "token": token})
}

func (h *AdminHandler) GetConfig(c *gin.Context) {
	sharedSecret, _ := h.db.GetConfig("shared_secret")
	blocked, _ := h.db.GetConfig("blocked_networks")

	pingMaxRuns, _ := h.db.GetConfig("ping_max_runs")
	tcpPingMaxRuns, _ := h.db.GetConfig("tcp_ping_max_runs")
	trTimeout, _ := h.db.GetConfig("traceroute_timeout_seconds")

	// 如果DB未初始化这些键，退回到当前运行配置
	if sharedSecret == "" {
		sharedSecret = h.cfg.Security.SharedSecret
	}

	c.JSON(http.StatusOK, gin.H{
		"shared_secret":              sharedSecret,
		"blocked_networks":           blocked,
		"ping_max_runs":              pingMaxRuns,
		"tcp_ping_max_runs":          tcpPingMaxRuns,
		"traceroute_timeout_seconds": trTimeout,
	})
}

func (h *AdminHandler) UpdateConfig(c *gin.Context) {
	var req adminConfigDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// shared_secret: 允许为空（由用户自行决定是否清空）
	if err := h.db.SetConfig("shared_secret", req.SharedSecret); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save shared_secret"})
		return
	}

	blocked := normalizeBlockedNetworks(req.BlockedNetworks)
	if blocked != "" {
		if _, err := parseBlockedNetworks(blocked); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid blocked_networks"})
			return
		}
	}
	if err := h.db.SetConfig("blocked_networks", blocked); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save blocked_networks"})
		return
	}

	setPositiveInt := func(key string, v int) {
		if v > 0 {
			_ = h.db.SetConfig(key, strconv.Itoa(v))
		}
	}

	// 数值类配置：0/负数 => 不写入，保持原值
	setPositiveInt("ping_max_runs", req.PingMaxRuns)
	setPositiveInt("tcp_ping_max_runs", req.TCPPingMaxRuns)
	setPositiveInt("traceroute_timeout_seconds", req.TracerouteTimeoutSeconds)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AdminHandler) UpdateProbe(c *gin.Context) {
	probeID := c.Param("id")
	probe, err := h.db.GetProbe(probeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Probe not found"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if strings.TrimSpace(req.Name) != "" {
		probe.Name = strings.TrimSpace(req.Name)
	}


	if err := h.db.SaveProbe(probe); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update probe"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AdminHandler) DeleteProbe(c *gin.Context) {
	probeID := c.Param("id")
	if err := h.db.DeleteProbe(probeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete probe"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AdminHandler) signAdminToken(jwtSecret string, ttl time.Duration) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

	payload := adminTokenPayload{Sub: "admin"}
	if ttl != 0 {
		payload.Exp = time.Now().Add(ttl).Unix()
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	unsigned := header + "." + payloadB64
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(unsigned))
	sig := mac.Sum(nil)
	sigB64 := base64.RawURLEncoding.EncodeToString(sig)

	return unsigned + "." + sigB64, nil
}

func normalizeBlockedNetworks(raw string) string {
	lines := strings.Split(raw, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

func parseBlockedNetworks(blocked string) ([]*net.IPNet, error) {
	lines := strings.Split(blocked, "\n")
	var nets []*net.IPNet
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		_, ipnet, err := net.ParseCIDR(line)
		if err != nil {
			return nil, err
		}
		nets = append(nets, ipnet)
	}
	return nets, nil
}

func (h *AdminHandler) GenerateSharedSecret(c *gin.Context) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate secret"})
		return
	}
	secret := base64.RawURLEncoding.EncodeToString(b)
	c.JSON(http.StatusOK, gin.H{"shared_secret": secret})
}
