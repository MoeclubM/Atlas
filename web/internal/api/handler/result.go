package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"atlas/web/internal/database"
)

// ResultHandler 结果处理器

type ResultHandler struct {
	db *database.Database
}

// NewResultHandler 创建结果处理器
func NewResultHandler(db *database.Database) *ResultHandler {
	return &ResultHandler{db: db}
}

// ListResults 列出结果
// GET /api/results
func (h *ResultHandler) ListResults(c *gin.Context) {
	taskID := c.Query("task_id")
	probeID := c.Query("probe_id")
	limit := 100
	offset := 0

	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if o := c.Query("offset"); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}

	var results interface{}
	var err error

	if taskID != "" {
		results, err = h.db.ListResultsByTask(taskID, limit, offset)
	} else if probeID != "" {
		results, err = h.db.ListResultsByProbe(probeID, limit, offset)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_id or probe_id required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list results"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"results": results,
	})
}

// GetResult 获取结果详情
// GET /api/results/:id
func (h *ResultHandler) GetResult(c *gin.Context) {
	resultID := c.Param("id")

	result, err := h.db.GetResult(resultID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Result not found"})
		return
	}

	c.JSON(http.StatusOK, result)
}
