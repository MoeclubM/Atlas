# Atlas

轻量化网络测试平台，提供 Web 控制端与可独立部署的 Probe 节点。

## 快速开始

### 启动 Web

```bash
cp .env.example .env
# 编辑 .env，至少设置 SHARED_SECRET
docker compose up -d --build
curl http://localhost:18080/api/health
```

默认访问地址：`http://localhost:18080`

### 接入 Probe

```bash
sudo bash probe/scripts/install.sh \
  --server-url wss://atlas.example.com/ws \
  --auth-token 'YOUR_SHARED_SECRET'
```

`--probe-name` 可省略，默认使用系统主机名。节点接入后也可以在后台面板改显示名。

## 开发

本地联调会一起启动 `web + dev probe`：

```bash
cp .env.example .env
# 编辑 .env，至少设置 SHARED_SECRET
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

本地联调地址：`http://localhost:18080`

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
