# Anki Image Cloze Prototype

这是一个 Anki 图像挖空工作台原型，目标是把“知识点截图 -> OCR / 路由 / LLM 建议 -> 人工确认 -> 导出到 Anki”这条链路跑顺。

当前有两条主使用路径：

- `流水线模式`
  - 适合批量扫描、OCR、路由、LLM 建议、审核后导出
- `手动模式`
  - 适合直接裁剪、画遮罩、分组遮罩、预览并导出

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
  - 主工作台 UI、编辑器、手动模式、审核工作区
- `backend/`
  - FastAPI + 本地存储
  - OCR、LLM、渲染、Anki 导出/导入
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

如果后端端口不一样，可复制 `frontend/.env.example` 为 `frontend/.env`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 后端

```powershell
cd backend
python -m venv .venv
```

安装核心依赖：

```powershell
.venv\Scripts\python.exe -m pip install fastapi uvicorn[standard] pydantic-settings pillow httpx python-multipart
```

安装 OCR：

```powershell
.venv\Scripts\python.exe -m pip install rapidocr_onnxruntime
```

启动：

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 当前建议

- 大改之前，先把此项目整理成独立 Git 仓库
- 再做一个基线提交
- 然后再考虑新工作树 / web-server 版本分线
