# Anki Image Cloze Web

一个在网页里制作 Anki 图片遮挡卡片的工具。

它的重点不是“在线上传处理”，而是“在当前设备本地完成导入、编辑、预览和导出”。如果你只想快速做卡、导出卡包，或者在手机上先处理图片、回到电脑再继续，这个项目就是为这条链路准备的。

## 你能用它做什么

- 导入多张图片或整个文件夹
- 裁切图片、绘制遮罩、按组组织卡片
- 即时预览题面和答案面
- 导出为 `APKG`、纯图片组，或在桌面端直连本机 `AnkiConnect`
- 在浏览器里保存当前项目，下次继续
- 安装成桌面 / 主屏应用，像工具一样打开

## 适合谁

- 想在网页里直接做 Anki 图片遮挡卡的人
- 不想把图片上传到服务端的人
- 希望手机和电脑都能接着处理的人
- 需要 `APKG` 离线导入，而不一定依赖 `AnkiConnect` 的人

## 技术路线

- 前端：`React + Vite + TypeScript`
- 运行方式：纯前端，本地处理
- 默认部署：静态部署即可，适合 `Netlify / Vercel`

## 快速开始

```powershell
cd frontend
npm install
npm run dev
```

默认访问：

- `http://127.0.0.1:5173`

## 构建

```powershell
cd frontend
npm run build
```

构建产物在：

- `frontend/dist`

## 部署

这是一个静态前端项目，部署时只需要构建并发布 `frontend/dist`。

### Netlify

- Base directory：`frontend`
- Build command：`npm run build`
- Publish directory：`dist`

### Vercel

- Root Directory：`frontend`
- Build Command：`npm run build`
- Output Directory：`dist`

## 关于 Anki

- 桌面端可以尝试连接本机 `AnkiConnect`
- 手机端默认更适合走 `APKG` 或纯图片组
- 如果没有配置 `AnkiConnect`，并不影响你导出 `APKG`

## 关于隐私

- 图片不会上传到项目服务端
- 导入、裁切、遮罩、预览、导出都在当前设备完成
- 浏览器本地保存也只保存在当前浏览器环境里

## 文档

- [项目总览](docs/project-overview.md)
- [架构说明](docs/architecture.md)
- [工作流说明](docs/workflows.md)
- [踩坑与纠偏记录](docs/pitfalls-and-corrections.md)
- [Agent 经验与环境约束](docs/agent-experience.md)
- [Git 与工作树说明](docs/git-and-worktree-guide.md)
- [Vercel 统计与监测说明](docs/vercel-analytics.md)
