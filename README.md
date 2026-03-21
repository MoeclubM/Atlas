# Atlas

轻量化网络测试平台，提供 Web 控制端与可独立部署的 Probe 节点。

## 部署路径

### 生产部署

- `web` 使用 `docker compose` 启动
- `probe` 在独立 Debian/Ubuntu 节点上通过安装脚本接入

### 本地联调

- 使用 `docker-compose.yml` + `docker-compose.dev.yml` 一起启动 `web + dev probe`

## 快速开始

### Web

```bash
cp .env.example .env
# 编辑 .env，至少设置 SHARED_SECRET
docker compose up -d --build
curl http://localhost:18080/api/health
```

默认访问地址：

- `http://localhost:18080`

### Probe

```bash
sudo bash probe/scripts/install.sh \
  --server-url wss://atlas.example.com/ws \
  --auth-token 'YOUR_SHARED_SECRET' \
  --probe-name 'hk-probe-01'
```

## 文档

- 部署与使用教程：`docs/TUTORIAL.md`
- 前端说明：`frontend/FRONTEND_GUIDE.md`

## 仓库结构

```text
web/        Web 服务端
probe/      Probe 客户端
frontend/   Vue 前端
shared/     共享协议与模型
deploy/     Dockerfile
```

## License

MIT
