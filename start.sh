#!/bin/bash
# 简单的部署测试脚本

echo "====================================="
echo "Atlas Docker 部署测试"
echo "====================================="
echo ""

# 构建并启动
echo ">> 启动服务..."
docker compose up -d

echo ""
echo ">> 等待服务就绪..."
sleep 15

echo ""
echo ">> 检查容器状态..."
docker compose ps

echo ""
echo ">> 检查探针连接..."
curl -s http://localhost:18080/api/probes | jq '.probes[] | {probe_id, name, location, latitude, longitude, status}'

echo ""
echo "====================================="
echo "访问: http://localhost:18080"
echo "====================================="
