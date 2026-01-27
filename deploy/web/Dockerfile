# ============================================
# 阶段 1: 构建前端
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# 复制前端源码
COPY frontend/package*.json ./
RUN npm install

# 复制前端源码并构建
COPY frontend/ ./
RUN npx vite build

# ============================================
# 阶段 2: 构建后端
# ============================================
FROM golang:1.21-alpine AS backend-builder

# web 作为 module 根目录放在 /build/web，shared 放在 /build/shared
# 这样 web/go.mod 的 `replace atlas/shared => ../shared` 在容器内可用
WORKDIR /build/web

# 安装构建依赖
# 某些网络环境下 apk 使用 https 会出现 SSL EOF/连接失败，改用 http 源以提升稳定性
RUN sed -i 's|https://|http://|g' /etc/apk/repositories \
  && apk add --no-cache git gcc musl-dev sqlite-dev

# 复制 shared 模块
COPY shared/ /build/shared/

# 复制 go.mod 和 go.sum
COPY web/go.* /build/web/

# 复制源代码
COPY web/ /build/web/

# 构建
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -ldflags '-extldflags "-static"' -o atlas-server cmd/server/main.go

# ============================================
# 阶段 3: 最终镜像
# ============================================
FROM alpine:latest

# 安装运行时依赖
RUN apk --no-cache add ca-certificates sqlite tzdata

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从前端构建阶段复制静态文件
COPY --from=frontend-builder /frontend/dist /app/static

# 从后端构建阶段复制二进制文件
COPY --from=backend-builder /build/web/atlas-server .
COPY --from=backend-builder /build/web/migrations ./migrations

# 创建数据和日志目录
RUN mkdir -p /app/data /app/logs

# 创建默认配置文件
RUN echo 'server:\n\
  port: 8080\n\
  mode: release\n\
  static_path: /app/static\n\
database:\n\
  path: /app/data/atlas.db\n\
websocket:\n\
  heartbeat_interval: 30\n\
scheduler:\n\
  worker_count: 4\n\
  scan_interval: 5\n\
security:\n\
  shared_secret: "change-me"\n\
logging:\n\
  level: info\n\
  file: /app/logs/atlas.log' > /app/config.yaml.default

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/api/health || exit 1

# 数据卷
VOLUME ["/app/data", "/app/logs"]

# 启动命令
CMD ["./atlas-server"]
