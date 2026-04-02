# CSAgent

CSAgent 是一个面向客服与服务场景的通用智能体框架。

当前仓库的目标不是绑定某个单一行业，而是提供一套可复用的 agent harness：

- 对话主循环
- 工具 / 技能 / 卡片承载
- 平台注册中心
- 长期记忆与上下文压缩
- MCP 工具接入
- 可编辑提示词与前端工作台

当前仓库已经移除了旧示例业务插件、业务工具、EOP / mock 适配层与插件扫描逻辑，聚焦平台注册中心、Agent / Skill / Tool 管理、MCP 接入与通用卡片协议。

## 当前能力

当前版本已经具备完整的可运行链路：

- FastAPI 原生后端，默认端口 `8200`
- React + Vite 前端，默认端口 `3000`
- 原生 `/api/chat`、`/api/chat/sse`、`/api/sessions`、`/api/framework/*`、`/api/platform/*`、`/ws/chat`、`/health` 接口
- `backend/framework_profile.py` + `backend/framework_profile.yaml` 驱动的动态提示词与 UI 文案
- `backend/platform_registry.py` 驱动的平台 Tool / Skill / Agent 注册表，负责本地基础工具与 MCP 工具快照同步
- 长期记忆注入与摘要压缩
- MCP 工具运行时接入
- 前端 `FrameworkStudioPanel` 配置台，可编辑提示词、长期记忆和界面文案

## 当前目录结构

```text
CSAgent/
  backend/
    agent/                 # 主循环、上下文治理、工具策略、摘要压缩
    api/
    card/
    db/
    provider/
    routes/                # chat / session / framework 路由
    skill/                 # skill 载入与调度
    tool/                  # tool 注册、运行与平台基础工具
    config.py              # 主配置加载
    config.yaml            # 运行配置
    framework_profile.py   # 框架配置读写
    framework_profile.yaml # 提示词 / UI / 长期记忆默认配置
    main.py                # FastAPI 入口
    mcp_runtime.py         # MCP 运行时
    requirements.txt
  frontend/
    src/
      components/
        ChatPanel.tsx
        FrameworkStudioPanel.tsx
        MessageBubble.tsx
      hooks/
        useChat.ts
        useFrameworkProfile.ts
```

## 核心设计原则

### 1. 模型负责决策，框架负责 Harness

CSAgent 倾向于把“智能体”理解为**模型 + 可操作环境**。

框架侧主要提供：

- 工具与动作接口
- 领域知识入口
- 会话与上下文治理
- 持久化与日志
- 权限边界与运行约束

### 2. 配置外置，而不是写死在代码里

当前有两类关键配置：

- `backend/config.yaml`
  - 模型、数据库、MCP、上下文预算等运行参数
- `backend/framework_profile.yaml`
  - 系统提示词、技能提示词、压缩提示词、长期记忆提示词、UI 文案

### 3. 平台注册中心优先

运行时优先从平台注册中心读取 Agent、Skill、Tool 配置；当前仓库只保留平台基础工具，并支持把 MCP 工具同步为平台 Tool 记录：

- 加载平台基础工具
- 同步 MCP 工具为平台 Tool
- 由 Agent 配置控制工具与技能可见性

### 4. 长期记忆和摘要压缩属于平台能力

长期记忆、上下文瘦身、摘要压缩不属于某个业务插件，而属于框架底层能力：

- 长期记忆由 `framework_profile` 配置并注入系统提示
- 上下文压缩由 `agent/compaction.py` 统一处理
- 前端配置台可直接编辑长期记忆条目与相关提示词

### 5. 平台与行业解耦

当前仓库不再内置旧示例业务域、EOP / mock 适配层或插件扫描机制。

如果后续需要接入真实业务能力，建议通过平台注册中心和标准 Tool / Skill / Card 契约接入，例如：

- FAQ / 知识答疑
- 工单查询
- 产品推荐
- 订单处理

## 对外接口

当前主接口如下：

- `POST /api/chat`
- `POST /api/chat/sse`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{sid}`
- `GET /api/sessions/{sid}/messages`
- `GET /api/framework/info`
- `GET /api/framework/profile`
- `PUT /api/framework/profile`
- `GET /health`
- `GET /ws/chat`

## 快速启动

## 1. 启动后端

```powershell
conda run -n app_service python -m pip install -r backend/requirements.txt
conda run -n app_service python backend/main.py
```

启动前建议先检查 `backend/config.yaml`：

- `api_key`
- `chat_model`
- `database_url`
- `mcp_enabled` 与 `mcp_servers`
- 如需真实业务接口，再配置相应外部网关地址

## 2. 启动前端

```powershell
cd frontend
npm install
npm run dev
```

前端默认代理到 `http://127.0.0.1:8200`。

## 3. 编辑框架配置

前端右侧 `Framework Studio` 面板可直接编辑：

- 系统提示词
- 技能引导提示词
- 摘要压缩提示词
- 长期记忆提示词
- 长期记忆条目
- 聊天壳 UI 文案
- 演示身份提示文案

## 平台默认能力

当前纯平台底座默认提供：

- `list_tools`
- `list_skills`
- `load_skills`
- MCP 动态工具接入与平台注册同步
- `Framework Studio` 驱动的提示词、长期记忆与前端文案配置

新增业务能力建议通过平台注册中心配置 Agent、Skill、Tool 可见性，并使用统一卡片协议接入前端，而不是回到文件系统插件扫描模式。

## 从 learn-claude-code 可以继续借鉴什么

`learn-claude-code` 提供了一套很清晰的 harness 视角。对 CSAgent 来说，最值得借鉴的是下面几类思路：

### 1. 更彻底的 Harness 视角

把框架重点放在：

- tools
- knowledge
- observation
- action interface
- permissions

而不是继续堆很多硬编码流程分支。

### 2. 按需加载技能正文

当前 CSAgent 已经支持技能发现，但后续可以进一步借鉴两层技能加载：

- Layer 1：系统提示只放技能摘要
- Layer 2：模型真正需要时，再加载完整技能正文

这样能进一步减少系统提示膨胀。

### 3. 把“任务状态”从对话里抽出来

`learn-claude-code` 的持久化任务系统值得借鉴。

对客服场景来说，可以演化为：

- case 级任务清单
- 待补资料项
- 待用户确认动作
- 外部回调 / 审批 / 支付等待项

这样状态可以在摘要压缩之后继续保留，而不依赖长对话历史。

### 4. 子 Agent 的新鲜上下文委派

复杂场景下，可以把部分任务拆给独立上下文执行，例如：

- 知识检索与归纳
- 规则校验
- 订单可办理性分析
- 推荐理由整理

子 agent 只回传摘要，避免污染主对话上下文。

### 5. 后台任务与异步通知

客服场景很适合借鉴后台任务机制，例如：

- 长耗时订单查询
- 外部接口轮询
- 支付状态回查
- 知识库同步

框架可把结果以状态事件或通知消息回注给主循环，而不是阻塞整轮对话。

## 当前不建议急着照搬的部分

以下能力有启发，但不建议现在马上全量引入：

- 多 agent 团队邮箱协作
- worktree 级并行隔离
- 复杂自治组织协议

对当前客服框架来说，优先级更高的是：

1. 稳定单主循环
2. 清晰插件边界
3. 长期记忆 / 任务状态外置
4. 按需技能加载
5. 后台任务与通知机制

## 文档索引

- `docs/01-整体架构说明.md`
- `docs/02-迁移策略.md`
- `docs/03-开发计划.md`
- `docs/04-插件化开发标准.md`
- `docs/05-当前能力映射.md`
