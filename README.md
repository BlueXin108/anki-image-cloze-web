# Anki Image Cloze Web Workbench

这是一个面向 Vercel 和静态部署场景的 Anki 图像挖空网页工作台。当前主目标是把“导入图片 -> 手动裁剪 -> 画遮罩 -> 按组预览 -> 直接导入 Anki”这条链路跑顺。

当前产品形态：

- `手动模式`
  - 已完成
  - 支持多图上传、文件夹导入、浏览器本地保存、即时预览、直接连接本机 AnkiConnect
- `流水线模式`
  - 当前保留 UI 占位
  - 后续再逐步接回 OCR、自动归类或自动遮罩能力

## 文档入口

建议按这个顺序阅读：

1. [项目总览](docs/project-overview.md)
2. [架构说明](docs/architecture.md)
3. [工作流说明](docs/workflows.md)
4. [踩坑与纠偏记录](docs/pitfalls-and-corrections.md)
5. [Agent 经验与环境约束](docs/agent-experience.md)
6. [Git 与工作树说明](docs/git-and-worktree-guide.md)

另外，根目录的 `.agent` 是未来 agent 的控制入口和文档索引。

## 目录结构

- `frontend/`
  - Vite + React + TypeScript
  - 纯前端网页工作台
  - 图像编辑器、浏览器本地保存、AnkiConnect 直连
- `backend/`
  - 历史本地版原型后端
  - 当前这条网页线不依赖它运行
- `docs/`
  - 项目文档、架构说明、工作流、踩坑记录

## 快速启动

### 前端

```powershell
cd frontend
npm install
npm run dev
```

默认地址：

- `http://127.0.0.1:5173`

这条网页线默认不需要启动后端。

## Anki 连接说明

- 导入会直接尝试连接本机 `http://127.0.0.1:8765`
- 请先打开 Anki，并安装 / 启用 AnkiConnect
- 如果你是从远端网页访问本站，需要在 AnkiConnect 里允许来自当前网页的访问
- 当前首发重点支持桌面浏览器

## 部署建议

- 当前前端适合直接部署到 Vercel
- 部署根目录指向 `frontend/`
- 这条网页线不依赖自建服务或 Vercel Functions
