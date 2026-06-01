# 健身记录

纯前端 PWA，用于记录个人健身训练。所有数据存储在浏览器 IndexedDB 中。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- Dexie.js（IndexedDB）
- React Router v6
- vite-plugin-pwa

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # TypeScript 检查 + 生产构建
npm run preview    # 预览构建产物
```

## 目录结构

```
src/
├── components/    # Header、BottomNav、CheckButton
├── pages/         # Home、Exercises、Templates、ActiveWorkout、History
├── db/            # Dexie 数据库定义 + 默认数据
├── types/         # TypeScript 类型定义
├── hooks/         # 自定义 hooks
├── App.tsx        # 路由配置
└── main.tsx       # 入口
```

## 部署

构建产物在 `dist/` 目录，为纯静态文件，可部署到 GitHub Pages / Vercel / Netlify。
