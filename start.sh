#!/bin/bash
set -euo pipefail

echo "====================================="
echo "Atlas Web (Docker Compose) 启动脚本"
echo "====================================="
echo ""

echo ">> 启动 web 服务..."
docker compose up -d --build

echo ""
echo ">> 等待 web 健康检查通过..."
for i in {1..60}; do
  status="$(docker inspect --format '{{.State.Health.Status}}' atlas-web 2>/dev/null || true)"
  if [[ "${status}" == "healthy" ]]; then
    echo "web healthy"
    break
  fi
  sleep 2
  if [[ $i -eq 60 ]]; then
    echo "web did not become healthy" >&2
    docker compose ps
    exit 1
  fi
done

echo ""
echo ">> 验证健康检查接口..."
curl -fsS http://localhost:18080/api/health

echo ""
echo "====================================="
echo "访问: http://localhost:18080"
echo "====================================="
