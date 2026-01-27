# 阶段 1: 构建
FROM golang:1.21-alpine AS builder

WORKDIR /build

# 安装构建依赖
RUN apk add --no-cache git

# 复制 go.mod 和 go.sum
COPY probe/go.* ./

# 复制 shared 模块（用于本地 replace ../shared）
COPY shared/ /shared/

RUN go mod download

# 复制源代码
COPY probe/ ./
COPY shared/ /build/shared/

# 构建
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags '-w -s' -o atlas-probe cmd/probe/main.go

# 阶段 2: 最终镜像
FROM alpine:latest

# 安装网络工具
RUN apk --no-cache add \
    ca-certificates \
    iputils \
    bind-tools \
    mtr \
    traceroute \
    tcptraceroute \
    busybox-extras \
    tzdata

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制二进制文件
COPY --from=builder /build/atlas-probe .

# 创建日志目录
RUN mkdir -p /app/logs

# 创建默认配置文件
RUN echo 'probe:\n\
  name: "Docker Probe"\n\
  location: "Unknown"\n\
  region: "unknown"\n\
server:\n\
  url: "ws://web:8080/ws"\n\
  auth_token: "change-me"\n\
  reconnect_interval: 5\n\
  max_reconnect_attempts: 0\n\
capabilities:\n\
  - icmp_ping\n\
  - tcp_ping\n\
  - mtr\n\
  - traceroute\n\
executor:\n\
  max_concurrent_tasks: 5\n\
  task_timeout: 300\n\
logging:\n\
  level: info\n\
  file: /app/logs/probe.log' > /app/config.yaml.default

# 数据卷
VOLUME ["/app/logs"]

# 启动命令
CMD ["./atlas-probe"]
