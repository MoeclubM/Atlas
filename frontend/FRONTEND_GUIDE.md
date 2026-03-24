# 前端开发快速指南

## 当前前端架构

前端已经完成从 Vue 到 React 的迁移，当前唯一有效的前端源码目录是 `frontend/react-src`。旧的 Vue `src/` 目录和对应配置已移除，不再参与构建。

技术栈：

- React 19
- Vite
- TypeScript
- React Router
- TanStack Query
- Zustand
- Radix UI
- Tailwind CSS
- React Hook Form + Zod
- i18next
- React Leaflet
- ECharts
- Playwright

## 安装依赖

```bash
cd frontend
npm install
```

## 本地开发

```bash
npm run dev
```

默认开发地址为 `http://localhost:3000`。

Vite 会代理：

- `/api` -> `http://localhost:8080`
- `/ws` -> `ws://localhost:8080`

如果后端端口不是 `8080`，可以设置环境变量：

```bash
VITE_BACKEND_PORT=18080 npm run dev
```

## 构建与检查

```bash
npm run build
npm run lint
```

构建产物输出到 `frontend/dist`。

## E2E 测试

Playwright 用例位于 `frontend/tests/e2e`。

```bash
npm run test:e2e
```

常用环境变量：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080
ATLAS_ADMIN_PASSWORD=atlas-admin
```

## 目录结构

```text
frontend/
├── react-src/
│   ├── components/
│   ├── lib/
│   ├── locales/
│   ├── pages/
│   ├── state/
│   ├── App.tsx
│   ├── i18n.ts
│   ├── index.css
│   └── main.tsx
├── tests/
│   └── e2e/
├── index.html
├── playwright.config.ts
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## 开发约束

- 新功能只允许加在 `react-src/`
- 页面级浮层统一走 Portal，不要自行堆叠 `z-index`
- 优先复用 `components/ui` 中的基础组件
- API 返回的松散字段先在 `lib/domain.ts` 和 `lib/result.ts` 里正规化，不要把解析逻辑散落到页面里

## 常见问题

### 地图或探针位置不显示

1. 检查浏览器控制台是否有 Leaflet 相关报错
2. 检查探针是否上报有效经纬度
3. 检查地图瓦片请求是否被网络策略拦截

### API 请求失败

1. 确认 `web` 服务正在运行
2. 确认 `VITE_BACKEND_PORT` 或反向代理配置正确
3. 检查浏览器 Network 面板中的 `/api` 与 `/ws`

### Playwright 失败

1. 确认前后端和 probe 已启动
2. 确认 `PLAYWRIGHT_BASE_URL` 指向正确地址
3. 先执行一次 `npm run build` 和 `npm run lint` 排除基础问题

---

**更新时间**: 2026-03-24
