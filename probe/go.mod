module atlas/probe

go 1.21

require (
	atlas/shared v0.0.0-00010101000000-000000000000
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	gopkg.in/yaml.v3 v3.0.1
)

// 引用本地 shared 模块
replace atlas/shared => ../shared
