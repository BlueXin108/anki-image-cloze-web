# 架构说明

## 高层拆分

- `frontend/`
  - 当前主产品
  - 纯前端网页工作台
- `backend/`
  - 历史本地版原型
  - 当前网页线不依赖它运行

## 前端职责

前端主要负责：

- 图片导入
- 浏览器本地持久化
- 裁切与遮罩编辑
- 卡片分组预览
- 全屏导出确认流
- 左下状态胶囊与右下导出入口
- 顶部端模式提示与右上帮助入口
- 顶部设置入口
- Vercel Analytics 基础访问统计
- AnkiConnect 直连
- APKG 卡包导出
- 纯图像组导出
- 本地牌组池
- 移动端布局分流与设备判断
- 流水线占位 UI
- 导入预处理

重要区域：

- `frontend/src/App.tsx`
  - 只保留顶层装配职责
  - 负责把头部、工作区、状态胶囊、导出视窗拼起来
- `frontend/src/components/workbench/`
  - 手动工作区、牌组浏览器、状态胶囊、导出流程视窗、顶部工作台外壳
  - `anki-connect-help-popover.tsx` 负责右上帮助说明
  - `inline-emphasis.tsx` 负责文本流里的轻量强调和说明提示
- `frontend/src/hooks/`
  - 承接导出流程这类状态机和动作推进
- `frontend/src/hooks/use-device-profile.ts`
  - 判断当前是否走移动端布局、是否允许直连本机 Anki
- `frontend/src/lib/workbench-state.ts`
  - 前端工作台共享的状态辅助函数与常量
  - 当前状态胶囊只保留 Anki、恢复、本地保存三类核心状态
- `frontend/src/lib/deck-pool.ts`
  - 维护当前设备自己的本地牌组池
- `frontend/src/lib/apkg-export.ts`
  - 复用现有预览结果生成 APKG 卡包
- `frontend/src/lib/image-group-export.ts`
  - 生成纯图像组压缩包
  - 支持 `WebP / JPG / PNG`
- `frontend/src/lib/image-processing.ts`
  - 在图片进入工作台时统一做压缩与最大分辨率校正
- `frontend/src/lib/workbench-settings.ts`
  - 统一管理导入预处理设置
- `frontend/src/components/editor/image-editor.tsx`
  - 共享的裁切 / 遮罩编辑核心
- `frontend/src/components/ui/sonner.tsx`
  - 统一管理右上角消息提示的层级与关闭样式

## 后端职责

当前这条网页线里，后端不承担运行时职责。它更多是保留旧原型，供后续复用思路或回看实现。

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

### Web 版新增的重要边界

- 浏览器本地保存与运行时对象地址不是一回事
- 导入预处理会改变图片的真实体积与最大尺寸，因此预览、编辑和最终导出都要继续共用同一张处理后的图
- 导入 Anki 时依赖的是用户本机 `127.0.0.1:8765`
- 远端网页能否成功连到本机 Anki，取决于用户环境和 AnkiConnect 放行设置
- 导出视窗里的只读预览复用了共享编辑器，因此只读与可编辑模式必须继续共用同一套图片尺寸逻辑
- 移动端常规工作区默认只读，真正可编辑态被限制在聚焦编辑里
- 移动端不会运行本机 Anki 检测，也不会展示相关入口
- 顶部帮助与正文里的 `AnkiConnect` / `APKG` 强调提示，要继续与真实能力保持一致，避免文案暗示和实际行为脱节
- 导出页里的压缩质量、图像组格式和图像组质量，要继续和最终生成逻辑保持一致
- 只有“纯图像组”这条导出路径允许切换图片格式，设置页不要再和导出页重复提供同一组出口控制
