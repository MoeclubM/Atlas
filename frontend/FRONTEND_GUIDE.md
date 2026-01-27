# 前端开发快速指南

## 安装依赖

```bash
cd frontend
npm install
```

## 开发模式运行

```bash
npm run dev
```

前端开发服务器将在 `http://localhost:5173` 启动。

## 配置后端 API 地址

如果后端服务不在 `localhost:8080`,需要修改 Vite 代理配置:

编辑 `frontend/vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://your-backend-url:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://your-backend-url:8080',
        ws: true,
      },
    },
  },
})
```

## 构建生产版本

```bash
npm run build
```

构建产物将输出到 `frontend/dist` 目录。

## 预览生产构建

```bash
npm run preview
```

## 运行完整系统

### 1. 启动后端服务

```bash
cd web
go run cmd/server/main.go
```

### 2. 启动前端开发服务器

```bash
cd frontend
npm run dev
```

### 3. 启动至少一个探针

```bash
cd probe
go run cmd/probe/main.go
```

### 4. 访问应用

打开浏览器访问 `http://localhost:5173`

## 配置探针坐标

为了在地图上正确显示探针位置,需要为每个探针配置经纬度。

### 方法 1: 修改探针配置文件

编辑 `probe/config.yaml`,添加 metadata:

```yaml
probe:
  name: "Tokyo Probe"
  location: "Tokyo, Japan"
  region: "asia"
  # 可以在 metadata 中添加坐标信息
  metadata:
    latitude: 35.6762
    longitude: 139.6503
```

### 方法 2: 通过 API 更新

使用 API 直接更新探针信息:

```bash
curl -X PATCH http://localhost:18080/api/probes/{probe_id} \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 35.6762,
    "longitude": 139.6503
  }'
```

### 方法 3: 直接在数据库中更新

```sql
UPDATE probes
SET latitude = 35.6762, longitude = 139.6503
WHERE probe_id = 'your-probe-id';
```

## 常见城市坐标参考

| 城市 | 纬度 | 经度 |
|------|------|------|
| 东京, 日本 | 35.6762 | 139.6503 |
| 纽约, 美国 | 40.7128 | -74.0060 |
| 伦敦, 英国 | 51.5074 | -0.1278 |
| 巴黎, 法国 | 48.8566 | 2.3522 |
| 悉尼, 澳大利亚 | -33.8688 | 151.2093 |
| 新加坡 | 1.3521 | 103.8198 |
| 香港 | 22.3193 | 114.1694 |
| 北京, 中国 | 39.9042 | 116.4074 |
| 上海, 中国 | 31.2304 | 121.4737 |
| 洛杉矶, 美国 | 34.0522 | -118.2437 |
| 芝加哥, 美国 | 41.8781 | -87.6298 |
| 多伦多, 加拿大 | 43.6532 | -79.3832 |
| 柏林, 德国 | 52.5200 | 13.4050 |
| 莫斯科, 俄罗斯 | 55.7558 | 37.6173 |
| 孟买, 印度 | 19.0760 | 72.8777 |
| 圣保罗, 巴西 | -23.5505 | -46.6333 |

## 技术栈

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **语言**: TypeScript
- **UI 库**: Vuetify
- **地图**: Leaflet + OpenStreetMap
- **图表**: ECharts 5
- **HTTP 客户端**: Axios
- **路由**: Vue Router 4
- **状态管理**: Pinia

## 项目结构

```
frontend/
├── src/
│   ├── api/              # API 请求封装
│   ├── components/       # 可复用组件
│   │   ├── WorldMap.vue
│   │   ├── QuickTaskForm.vue
│   │   ├── TaskTable.vue
│   │   ├── ProbeList.vue
│   │   └── PingChart.vue
│   ├── views/            # 页面组件
│   │   ├── Dashboard.vue
│   │   ├── Tasks.vue
│   │   ├── TaskDetail.vue
│   │   ├── SingleTestResult.vue
│   │   ├── ContinuousTestResult.vue
│   │   ├── Probes.vue
│   │   └── Results.vue
│   ├── layouts/          # 布局组件
│   │   └── MainLayout.vue
│   ├── router/           # 路由配置
│   │   └── index.ts
│   ├── stores/           # Pinia 状态管理
│   │   ├── probe.ts
│   │   └── task.ts
│   ├── types/            # TypeScript 类型定义
│   │   ├── index.ts
│   │   └── websocket.ts
│   ├── utils/            # 工具函数
│   │   ├── request.ts
│   │   └── websocket.ts
│   ├── App.vue           # 根组件
│   └── main.ts           # 入口文件
├── public/               # 静态资源
├── index.html
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
└── package.json
```

## 开发建议

1. **使用 VS Code**: 推荐安装以下扩展:
   - Volar (Vue 3 支持)
   - TypeScript Vue Plugin
   - ESLint
   - Prettier

2. **代码规范**: 项目已配置 ESLint 和 Prettier,提交前运行:
   ```bash
   npm run lint
   npm run format
   ```

3. **类型检查**: 开发时启用 TypeScript 严格模式:
   ```bash
   npm run build  # 会进行类型检查
   ```

4. **热更新**: Vite 提供快速的 HMR(热模块替换),修改代码后会自动刷新

## 故障排除

### 地图不显示

1. 检查浏览器控制台是否有错误
2. 确认网络可以访问 OpenStreetMap 瓦片服务器
3. 清除浏览器缓存重试

### 探针不显示在地图上

1. 确认探针已配置 `latitude` 和 `longitude`
2. 检查坐标格式是否正确(纬度: -90 到 90,经度: -180 到 180)
3. 查看浏览器控制台是否有数据加载错误

### API 请求失败

1. 检查后端服务是否正常运行
2. 确认 Vite 代理配置正确
3. 查看浏览器开发者工具的 Network 标签

### 依赖安装失败

如果遇到依赖冲突,尝试:
```bash
npm install --legacy-peer-deps
```

## 贡献指南

欢迎提交 Pull Request!在提交前请确保:

1. 代码通过 ESLint 检查
2. 代码格式符合 Prettier 规范
3. 所有 TypeScript 类型检查通过
4. 功能在主流浏览器中测试通过

---

**更新时间**: 2026-01-12
