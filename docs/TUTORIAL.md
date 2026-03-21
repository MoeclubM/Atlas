# Atlas 教程

本教程只覆盖当前仓库实际支持的两条使用路径：

1. 生产部署：`web` 用 Docker Compose，`probe` 用脚本安装到独立主机
2. 本地联调：`web + dev probe` 一起在 Docker 里启动

## 1. 生产部署

### 1.1 启动 Web

在控制端机器上执行：

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

```env
SHARED_SECRET=replace-this-with-a-random-secret
```

然后启动：

```bash
docker compose up -d --build
```

健康检查：

```bash
curl http://localhost:18080/api/health
```

默认访问地址：

- `http://localhost:18080`

当前 `docker-compose.yml` 只启动 `web`。

### 1.2 接入 Probe

在独立 Debian/Ubuntu 节点上执行：

```bash
sudo bash probe/scripts/install.sh \
  --server-url wss://atlas.example.com/ws \
  --auth-token 'YOUR_SHARED_SECRET' \
  --probe-name 'hk-probe-01'
```

要求：

- `AUTH_TOKEN` 必须与 Web 端 `SHARED_SECRET` 完全一致
- 节点需要 `ping` / `traceroute` 等系统命令

安装后：

- 二进制：`/usr/local/bin/atlas-probe`
- 配置：`/etc/atlas-probe/config.yaml`
- 服务：`atlas-probe.service`

常用命令：

```bash
sudo systemctl status atlas-probe
sudo systemctl restart atlas-probe
sudo journalctl -u atlas-probe -f
```

### 1.3 升级或回滚 Probe

安装 latest，但先不启动：

```bash
sudo bash probe/scripts/install.sh --no-start
```

安装指定版本：

```bash
sudo bash probe/scripts/install.sh \
  --version vX.Y.Z \
  --server-url wss://atlas.example.com/ws \
  --auth-token 'YOUR_SHARED_SECRET'
```

## 2. 本地联调

本地联调会一起启动 `web + dev probe`。

```bash
cp .env.example .env
# 编辑 .env，至少设置 SHARED_SECRET

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

访问：

- `http://localhost:18080`

验证 probe 是否在线：

```bash
curl http://localhost:18080/api/probes
```

停止联调环境：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

如果还要删卷：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

## 3. 常用操作

查看 Web 日志：

```bash
docker logs -f atlas-web
```

查看本地 dev probe 日志：

```bash
docker logs -f atlas-probe-dev
```

只停 Web：

```bash
docker compose down
```

## 4. 说明

- 生产推荐路径是：`web compose + 远端 probe(systemd)`
- 本地 `docker-compose.dev.yml` 仅用于联调，不是正式部署形态
- Web 默认对外端口是 `18080`
- 数据默认存放在 Compose volume `atlas-data`
