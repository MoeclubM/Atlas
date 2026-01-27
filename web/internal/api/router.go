package api

import (
	"github.com/gin-gonic/gin"

	"atlas/web/internal/api/handler"
	"atlas/web/internal/api/middleware"
	"atlas/web/internal/config"
	"atlas/web/internal/database"
	"atlas/web/internal/geoip"
	"atlas/web/internal/websocket"
)

// SetupRoutes 设置API路由
func SetupRoutes(r *gin.Engine, db *database.Database, hub *websocket.Hub, cfg *config.Config) {
	// 创建处理器
	taskHandler := handler.NewTaskHandler(db, hub)
	probeHandler := handler.NewProbeHandler(db)
	resultHandler := handler.NewResultHandler(db)

	// API路由组
	api := r.Group("/api")
	{
		adminHandler := handler.NewAdminHandler(db, cfg)
		admin := api.Group("/admin")
		{
			admin.POST("/login", adminHandler.Login)

			authed := admin.Group("")
			authed.Use(middleware.AdminAuth(cfg.Security.JWTSecret))
			{
				authed.GET("/generate-secret", adminHandler.GenerateSharedSecret)
				authed.GET("/config", adminHandler.GetConfig)
				authed.PUT("/config", adminHandler.UpdateConfig)
				authed.PUT("/probes/:id", adminHandler.UpdateProbe)
				authed.DELETE("/probes/:id", adminHandler.DeleteProbe)
			}
		}

		// 任务相关
		tasks := api.Group("/tasks")
		{
			tasks.POST("", taskHandler.CreateTask)
			tasks.GET("", taskHandler.ListTasks)
			tasks.GET("/:id", taskHandler.GetTask)
			tasks.DELETE("/:id", taskHandler.CancelTask)
		}

		// 探针相关
		probes := api.Group("/probes")
		{
			probes.GET("", probeHandler.ListProbes)
			probes.GET("/:id", probeHandler.GetProbe)
		}

		// 执行记录相关
		executions := api.Group("/executions")
		{
			executions.GET("", taskHandler.ListExecutions)
		}

		// 结果相关
		results := api.Group("/results")
		{
			results.GET("", resultHandler.ListResults)
			results.GET("/:id", resultHandler.GetResult)
		}

		// 健康检查
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status": "ok",
			})
		})

		// GeoIP 查询
		geoIPService := geoip.New()
		api.GET("/geoip", func(c *gin.Context) {
			ip := c.Query("ip")
			if ip == "" {
				c.JSON(400, gin.H{
					"success": false,
					"error":   "ip parameter is required",
				})
				return
			}

			location, err := geoIPService.Lookup(ip)
			if err != nil {
				c.JSON(400, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(200, gin.H{
				"success": true,
				"data":    location,
			})
		})
	}
}
