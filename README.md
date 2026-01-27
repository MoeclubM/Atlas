# Atlas - 全球网络测试平台

基于 WebSocket 的分布式网络测试系统，具有自动 IP 地理位置获取和可视化地图展示功能。

## 🚀 快速启动

### Web（docker-compose，一键部署，仅包含 web）

1) 复制并编辑环境变量：
```bash
cp .env.example .env
```

2) **必须**设置 `SHARED_SECRET`（生产环境请使用强随机值）：
- Web 端：`SHARED_SECRET`
- Probe 端：`AUTH_TOKEN`（必须与 `SHARED_SECRET` 完全一致）

3) 启动：
```bash
docker compose up --build -d
```

4) 健康检查：
```bash
curl http://localhost:18080/api/health
```

访问 http://localhost:18080

> 注意：本仓库的 docker-compose 仅启动 web；Probe 需要在独立机器上通过脚本安装并通过 systemd 运行。

### 本地开发模式 (Windows)

#### 前置要求

需要安装 GCC 编译器 (SQLite CGO 支持):
- TDM-GCC: https://jmeubank.github.io/tdm-gcc/
- MinGW-w64: https://sourceforge.net/projects/mingw-w64/

#### 启动步骤

1. **构建前端**:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **启动后端** (新终端):
   ```bash
   cd web
   set CGO_ENABLED=1
   go run cmd/server/main.go
   ```

3. **启动探针** (新终端):
   ```bash
   cd probe
   go run cmd/probe/main.go
   ```

4. 访问 http://localhost:18080

**快捷方式**: 使用提供的批处理脚本
详细说明：参考 Makefile 与各模块 README（如需补充 Windows/Linux 本地开发脚本，可后续加入）。

## ✨ 核心特性

### 自动地理位置获取
- 探针注册时自动从 IP 地址获取地理坐标
- 使用 ip-api.com 免费服务
- 无需手动配置经纬度

### 可视化界面
- 世界地图展示测试节点
- 根据延迟自动着色 (绿/黄/橙/红)
- 实时延迟曲线图 (ECharts)
- Ping/TCP 支持持续监控（监控模式）
- 其他类型为单次测试

### 网络测试
- ICMP Ping
- TCP Ping
- MTR 路由追踪
- Traceroute
- HTTP 测试 (计划中)

### 技术栈
- **后端**: Go + Gin + WebSocket + SQLite
- **前端**: Vue 3 + TypeScript + Vuetify
- **地图**: Leaflet + OpenStreetMap
- **图表**: ECharts 5

## 📁 项目结构

```
Atlas/
├── web/                    # Web 服务端
│   ├── cmd/server/         # 入口
│   ├── internal/
│   │   ├── api/            # HTTP API
│   │   ├── websocket/      # WebSocket 处理
│   │   ├── geoip/          # IP 地理位置查询 ✨
│   │   ├── database/       # 数据库
│   │   └── scheduler/      # 任务调度
│   └── config.yaml.example
│
├── probe/                  # 探针客户端
│   ├── cmd/probe/          # 入口
│   ├── internal/
│   │   ├── client/         # WebSocket 客户端
│   │   └── executor/       # 测试执行器
│   └── config.yaml.example
│
├── frontend/               # Vue.js 前端
│   ├── src/
│   │   ├── views/          # 页面
│   │   │   ├── SingleTestResult.vue       ✨
│   │   │   └── ContinuousTestResult.vue   ✨
│   │   ├── components/
│   │   │   ├── WorldMap.vue               ✨
│   │   │   └── QuickTaskForm.vue
│   │   └── api/
│   └── dist/               # 构建输出
│
├── shared/                 # 共享模型
│
├── deploy/                 # Docker 配置
│   ├── web/Dockerfile
│   └── probe/Dockerfile
│
├── docker-compose.yml
└── start.sh                # Docker 启动脚本（可选）
```

## 🗺️ 自动地理位置工作原理

1. **探针连接**: 探针通过 WebSocket 连接到 Web 服务端
2. **IP 提取**: 服务端提取探针的真实 IP 地址
3. **坐标查询**:
   - 优先使用探针提供的坐标 (如果有)
   - 否则调用 GeoIP API 自动查询
4. **保存数据**: 经纬度自动保存到数据库
5. **地图展示**: 前端从数据库读取坐标并在地图上标记

相关代码:
- `web/internal/geoip/geoip.go` - GeoIP 查询服务
- `web/internal/websocket/handler.go:handleRegister()` - 注册逻辑

## 🧪 使用示例

1. 访问 http://localhost:18080
2. 在首页选择测试类型并输入目标（如 `8.8.8.8` / `google.com`）
3. Ping/TCP 点击“开始监控”启动持续监控；其他类型点击“开始测试”
4. 查看节点列表、地图与延迟曲线/柱状图

## Probe（脚本安装 + systemd 管理，Ubuntu/Debian）

### 前置说明
- Probe 通过 WebSocket 连接 Web：`server.url`（示例：`ws://<host>:18080/ws` 或 `wss://<domain>/ws`）
- 鉴权关系：`AUTH_TOKEN` **必须**与 Web 端 `SHARED_SECRET` 完全一致（校验位置：`web/internal/websocket/handler.go:33`）
- 能力探测依赖系统命令：`ping` / `mtr` / `traceroute`（Probe 启动时会检测命令是否存在并决定 capabilities，见 `probe/cmd/probe/main.go:17`）
- 生产建议通过 systemd 赋予最小能力（CAP_NET_RAW 等），避免 probe 以 root 运行

### 安装/升级
在 Ubuntu/Debian 机器上执行（以 root 运行）：

- 安装 latest：
```bash
sudo bash probe/scripts/install.sh
```

- 安装指定版本（回滚）：
```bash
sudo bash probe/scripts/install.sh --version vX.Y.Z
```

安装后：
- 二进制：`/usr/local/bin/atlas-probe`
- 配置：`/etc/atlas-probe/config.yaml`（仅首次创建；请编辑其中的 `server.url` 与 `server.auth_token`）
- 服务：`atlas-probe.service`

常用命令：
```bash
sudo systemctl status atlas-probe
sudo systemctl restart atlas-probe
sudo journalctl -u atlas-probe -f
```

### 校验与安全建议
- 安装脚本会从 Release 下载 `checksums.txt` 并对 tar.gz 进行 SHA256 校验
- systemd unit 默认启用 `NoNewPrivileges=true` 等基础加固项，并使用系统用户 `atlas-probe` 运行

## 📊 地图颜色说明

- **绿色**: 延迟 < 50ms (优秀)
- **黄色**: 延迟 50-200ms (一般)
- **橙色**: 延迟 200-300ms (较差)
- **红色**: 延迟 > 300ms 或失败

## 🛠️ 开发

### 修改前端
```bash
cd frontend
npm run dev  # 开发服务器 (http://localhost:5173)
```

### 运行测试
```bash
cd web && go test ./...
cd probe && go test ./...
```

### 数据库迁移
迁移文件位于 `web/migrations/`，启动时自动执行。

## 📝 待办事项

- [ ] 实现 HTTP 测试执行器
- [ ] 添加 IPv4/IPv6 强制解析
- [ ] WebSocket 实时推送测试结果
- [ ] 用户认证系统
- [ ] 导出测试报告
- [ ] 热力图模式

## 📄 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

---

详细文档：见 frontend/FRONTEND_GUIDE.md
