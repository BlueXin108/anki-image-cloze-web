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
- 启动时只探测可恢复项目，并通过右上角提示交给用户手动恢复
- 浏览器内本地处理图片与导出，不把图片上传到服务端
- 裁切与遮罩编辑
- 卡片分组预览
- 全屏导出确认流
- 左下状态胶囊与右下导出入口
- 顶部端模式提示与右上帮助入口
- 顶部设置入口
- PWA 安装清单、离线应用壳与更新提示
- Vercel Analytics 基础访问统计
- AnkiConnect 直连
- APKG 卡包导出
- 纯图像组导出
- 本地牌组池
- 移动端布局分流与设备判断
- 流水线占位 UI
- 导入预处理
- 大体积辅助面板与导出能力的按需加载，降低首屏包体积

重要区域：

- `frontend/src/App.tsx`
  - 只保留顶层装配职责
  - 负责把首页、头部、工作区、状态胶囊、导出视窗拼起来
- `frontend/src/components/workbench/`
  - 手动工作区、牌组浏览器、状态胶囊、导出流程视窗、顶部工作台外壳
  - `anki-connect-help-popover.tsx` 负责右上帮助说明
  - `inline-emphasis.tsx` 负责文本流里的轻量强调和说明提示
  - `focus-editor-dialog.tsx` 负责聚焦编辑弹层
    - 手机端每次重新打开时都会重建内部编辑实例
    - 只保留已经提交过的裁切和遮罩结果，不保留上一次打开过程里的临时状态
- `frontend/src/hooks/`
  - 承接导出流程这类状态机和动作推进
- `frontend/src/hooks/use-device-profile.ts`
  - 判断当前是否走移动端布局、是否允许直连本机 Anki
- `frontend/src/lib/workbench-state.ts`
  - 前端工作台共享的状态辅助函数与常量
  - 当前状态胶囊只保留 Anki、恢复、本地保存三类核心状态
- `frontend/src/lib/project-store.ts`
  - 负责浏览器本地项目的保存、读取与“只探测不恢复”的摘要检查
  - 图片资源与编辑元数据分开落盘，避免每次改遮罩都整项目重存
  - 同时保存每张图片的来源状态，导出时据此判断能否继续开放 PNG / JPG
- `frontend/src/lib/deck-pool.ts`
  - 维护当前设备自己的本地牌组池
- `frontend/src/lib/apkg-export.ts`
  - 统一按当前导出格式重新生成 APKG 卡包内的图片
  - 在“整张图一张卡，点遮罩切换”模式下，直接生成可点击的卡面
- `frontend/src/lib/image-group-export.ts`
  - 生成纯图像组压缩包
  - 支持 `WebP / JPG / PNG`
  - 当当前制卡模式是交互单卡时，自动退成最接近的静态前后图
- `frontend/src/lib/image-processing.ts`
  - 在图片进入工作台时统一做压缩与最大分辨率校正
- `frontend/src/lib/manual-preview.ts`
  - 负责手动模式下方预览的原图解码缓存与结果缓存
  - 当前预览缓存采用有上限的 LRU 风格策略，避免无限增长
- `frontend/src/lib/workbench-settings.ts`
  - 统一管理导入预处理设置、制卡模式与导出格式开放规则
- `frontend/src/lib/card-generation.ts`
  - 统一定义“这批遮罩最终生成几张卡”的规则
- `frontend/src/components/editor/image-editor.tsx`
  - 共享的裁切 / 遮罩编辑核心
- `frontend/src/components/ui/sonner.tsx`
  - 统一管理右上角消息提示的层级与关闭样式
- `frontend/src/lib/pwa.ts`
  - 负责注册 Service Worker，并在新版本可用时提示刷新
- `frontend/src/components/landing/`
  - 负责首页内容与背景层
  - 当前首页与工作台之间采用分阶段切换，而不是整页硬切
- `frontend/public/manifest.webmanifest`
  - 提供安装到桌面或主屏所需的应用清单
- `frontend/vite.config.ts`
  - 构建时生成 Service Worker
  - 只缓存网页壳和静态资源，不接管用户导入的图片项目数据

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
- `card generation mode` 决定：
  - 每个分组是单独成卡，还是整张图只做一张交互卡
  - 题面默认盖住全部，还是只盖住当前考察点
  - 预览、Anki、APKG、纯图像组分别该怎样落地

也就是说：

- 一个 `card group` 可以只包含一个 `mask`
- 也可以包含多个 `mask`

## 重要提醒

如果聚焦模式与普通编辑模式开始表现不一致，优先检查：

1. 覆盖层是否仍然锚定在真实图片盒子上
2. 是否无意中让聚焦模式重新走了一套不同的布局或尺寸逻辑

### Web 版新增的重要边界

- 浏览器本地保存与运行时对象地址不是一回事
- PWA 的离线缓存只服务于网页壳和静态资源，不能把它误当成项目数据持久化
- 用户导入的图片、浏览器本地项目、AnkiConnect 连接状态都不能交给 Service Worker 接管
- 若启动阶段只探测到旧项目、却没有真正恢复，就不能立刻让自动保存把这份旧记录覆盖掉
- 浏览器本地保存如果把整批图片 blob 跟着每次编辑一起重写，遮罩拖动会明显变卡
- 导入预处理会改变图片的真实体积与最大尺寸，因此必须继续记录“当前是否还是原图链路”
- `PNG / JPG` 导出只能在明确仍持有原图链路时开放，不能把已经压缩过的图重新包装成“高质量导出”
- 导入 Anki 时依赖的是用户本机 `127.0.0.1:8765`
- 远端网页能否成功连到本机 Anki，取决于用户环境和 AnkiConnect 放行设置
- 导出视窗里的只读预览复用了共享编辑器，因此只读与可编辑模式必须继续共用同一套图片尺寸逻辑
- 移动端常规工作区默认只读，真正可编辑态被限制在聚焦编辑里
- 移动端聚焦编辑关闭后会重建内部编辑实例，作为本地交互异常时的兜底复位
- 移动端不会运行本机 Anki 检测，也不会展示相关入口
- PWA 安装兼容性以 Chromium 桌面端与 Android 为主；iPhone / iPad 仍以“添加到主屏幕”为主，能力边界更保守
- 顶部帮助与正文里的 `AnkiConnect` / `APKG` 强调提示，要继续与真实能力保持一致，避免文案暗示和实际行为脱节
- 导出页里的压缩质量与图片格式，要继续和最终生成逻辑保持一致
- `AnkiConnect`、`APKG`、纯图像组三条导出路径现在共用同一套图片格式开放规则
- 制卡模式也必须继续在预览、Anki、APKG、纯图像组三条线上保持一致
- 若用户关闭动画，首页背景粒子必须彻底卸载，而不是只停住视觉效果继续留在页面里

详细规则见：

- `docs/performance-and-export-policy.md`
