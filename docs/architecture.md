# 架构说明

## 高层拆分

- `frontend/`
  - 工作台界面
- `backend/`
  - OCR、LLM、渲染、存储和 Anki 集成

## 前端职责

前端主要负责：

- 列表与审核界面
- 裁切与遮罩编辑
- 预览展示
- 模式切换
- 队列可视化

重要区域：

- `frontend/src/App.tsx`
  - 顶层编排
- `frontend/src/components/workbench/`
  - 工作区级别界面
- `frontend/src/components/editor/image-editor.tsx`
  - 共享的裁切 / 遮罩编辑核心

## 后端职责

后端主要负责：

- 文件夹扫描
- 图片与草稿持久化
- OCR
- LLM 请求
- 遮罩渲染
- Anki 模板、导出与导入

重要区域：

- `backend/app/main.py`
- `backend/app/services.py`
- `backend/app/models.py`

## 重要边界

### mask 与 card group 的区别

- `mask` 是一个矩形遮罩块。
- `card group` 是手动模式下的最终导出单位。

也就是说：

- 一个 `card group` 可以只包含一个 `mask`
- 也可以包含多个 `mask`

## 重要提醒

如果聚焦模式与普通编辑模式开始表现不一致，优先检查：

1. 覆盖层是否仍然锚定在真实图片盒子上
2. 是否无意中让聚焦模式重新走了一套不同的布局或尺寸逻辑
