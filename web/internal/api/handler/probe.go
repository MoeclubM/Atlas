package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"atlas/web/internal/database"
	"atlas/web/internal/model"
)

// ProbeHandler 探针处理器
type ProbeHandler struct {
	db *database.Database
}

// NewProbeHandler 创建探针处理器
func NewProbeHandler(db *database.Database) *ProbeHandler {
	return &ProbeHandler{db: db}
}

// ListProbes 列出探针
// GET /api/probes
func (h *ProbeHandler) ListProbes(c *gin.Context) {
	status := c.Query("status")

	var (
		probes []*model.Probe
		err    error
	)

	// status=online 时，按心跳阈值过滤（避免“状态字段仍是 online 但实际已离线”的节点被返回）
	if status == "online" {
		probes, err = h.db.GetOnlineProbes()
	} else {
		probes, err = h.db.ListProbes(status)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list probes"})
		return
	}

	for _, p := range probes {
		p.IPAddress = ""
	}

	c.JSON(http.StatusOK, gin.H{
		"probes": probes,
		"total":  len(probes),
	})
}

// GetProbe 获取探针详情
// GET /api/probes/:id
func (h *ProbeHandler) GetProbe(c *gin.Context) {
	probeID := c.Param("id")

	probe, err := h.db.GetProbe(probeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Probe not found"})
		return
	}

	probe.IPAddress = ""
	c.JSON(http.StatusOK, probe)
}
