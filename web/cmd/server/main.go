package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"

	"atlas/web/internal/api"
	"atlas/web/internal/config"
	"atlas/web/internal/database"
	"atlas/web/internal/scheduler"
	"atlas/web/internal/websocket"
)

func main() {
	log.Println("=== Atlas Web Server ===")

	// 加载配置
	cfg, err := config.Load("web/config.yaml")
	if err != nil {
		log.Printf("Failed to load config (using defaults): %v", err)
	}

	// 设置Gin模式
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 初始化数据库
	log.Println("Initializing database...")
	db, err := database.New(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// 运行数据库迁移
	log.Println("Running database migrations...")
	if err := db.Migrate(); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// 创建WebSocket Hub
	log.Println("Initializing WebSocket hub...")
	wsHub := websocket.NewHub(db, cfg.Security.SharedSecret)
	go wsHub.Run()

	// 创建任务调度器
	log.Println("Starting task scheduler...")
	sched := scheduler.New(db, wsHub, cfg.Scheduler.ScanInterval)
	go sched.Start()

	// 创建Gin路由
	r := gin.Default()

	// 启用CORS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// WebSocket路由
	r.GET("/ws", func(c *gin.Context) {
		wsHub.HandleConnection(c.Writer, c.Request)
	})

	// 注册API路由
	api.SetupRoutes(r, db, wsHub, cfg)

	// 静态文件服务(前端)
	r.Static("/static", cfg.Server.StaticPath)
	r.Static("/assets", cfg.Server.StaticPath+"/assets")

	// SPA: 所有非 API/WS 路径回退到 index.html（支持前端 history 路由）
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/ws" || path == "/ws/" {
			c.Status(404)
			return
		}
		if len(path) >= 4 && path[:4] == "/api" {
			c.Status(404)
			return
		}
		c.File(cfg.Server.StaticPath + "/index.html")
	})

	// 启动服务器
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	log.Printf("WebSocket endpoint: ws://localhost%s/ws", addr)
	log.Printf("API endpoint: http://localhost%s/api", addr)

	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
