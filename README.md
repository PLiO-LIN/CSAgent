# CSAgent
 
 CSAgent 是一个面向客服场景的通用智能体框架目录，同时也是当前电信客服智能体能力的承接仓库。
 
 当前版本已经不只是一个空骨架：`telecom-agent` 中已经验证有效的对话主循环、工具体系、技能体系、上下文治理、模型对接、日志持久化、卡片联动和前端聊天壳，已经整体接入到 `CSAgent` 中并以 `native_core` 方式运行。
 
 当前仓库同时保留两层能力：
 
 - 一套已经可运行的原生客服智能体运行时
 - 一套继续向 Tool / Card / Skill / Plugin Manifest 标准演进的插件化目录
 - 一份便于后续继续重构、拆分和平台化的文档与映射基线

 ## 当前状态
 
 当前仓库已经包含：
 
 - 原生 FastAPI 后端入口，默认端口 `8200`
 - 与当前版本兼容的 `/api/chat`、`/api/chat/sse`、`/api/sessions`、`/health`、`/ws/chat` 接口
 - 已迁入的 `agent / tool / skill / provider / db / mock / routes / card / api / mcp_runtime` 运行时实现
 - 已迁入的 React + Vite 前端聊天壳、工具状态渲染、卡片渲染和手机号入口
 - 保留中的插件 Manifest 扫描器与 `plugins/` 插件目录
 - 架构、迁移、插件标准和能力映射文档
 
 当前这版的重点不是“继续空谈框架”，而是：
 
 - 先把当前电信客服智能体能力在 `CSAgent` 中原生跑通
 - 再按插件标准逐步把后端工具、技能和前端卡片抽回 `plugins/`
 - 最终让 `CSAgent` 成为长期维护主仓库

## 目录结构

 ```text
 CSAgent/
   backend/
     agent/
     api/
     app/
     card/
     db/
     mock/
     provider/
     routes/
     skill/
     tool/
     config.yaml
     main.py
     mcp_runtime.py
     requirements.txt
   frontend/
     postcss.config.js
     src/
     tailwind.config.js
   plugins/
     global.base/
     global.knowledge/
     telecom.query/
     telecom.recommend/
     telecom.order/
     telecom.recharge/
   docs/
     01-整体架构说明.md
     02-迁移策略.md
     03-开发计划.md
     04-插件化开发标准.md
     05-当前能力映射.md
```

## 设计原则

 ### 1. 核心与业务分层
 
 - `backend/agent + tool + skill + routes + db` 当前承载已经可运行的原生客服运行时
 - `backend/app` 继续承载插件化、框架化的未来演进方向
 - `frontend` 当前承载可运行的聊天壳与业务卡片渲染，后续再按插件拆卡片

### 2. 保持接口兼容

当前框架继续沿用以下对外接口约定：

- `POST /api/chat`
- `POST /api/chat/sse`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{sid}`
- `GET /api/sessions/{sid}/messages`
- `GET /health`

 ### 3. 插件化优先
 
 当前已经保留插件化目录，但运行时仍以“先对齐能力、再逐步抽象”的方式推进。后续所有新增或重构能力建议优先按插件包组织：

- Tool
- Card
- Skill
- Plugin Manifest

### 4. 单配置入口

当前后端仍保持单一配置入口：

- `backend/config.yaml`

 ## 快速启动
 
 ## 1. 后端
 
 ```powershell
 conda run -n app_service python -m pip install -r backend/requirements.txt
 conda run -n app_service python backend/main.py
 ```
 
 默认端口为 `8200`。
 
 启动前请先在 `backend/config.yaml` 中配置：
 
 - `llm.api_key`
 - 可选的 `llm.chat_model`
 - 如需真实业务接口，再配置 `eop.base_url`

 ## 2. 前端
 
 ```powershell
npm install
npm run dev
```
 
 前端默认端口为 `3000`，并代理到 `http://127.0.0.1:8200`。
 
 ## 3. 当前验证情况
 
 当前已完成的基础验证包括：
 
 - `backend` 侧 `python -m compileall .` 通过
 - 使用 `app_service` 环境完成 `main` 导入级检查
 - `/api/framework/info`、`/api/chat`、`/api/chat/sse`、`/api/sessions` 等路由已挂载
 - 知识库路径已校验可正确解析到 `telecom-agent/klg.xlsx`
 
 说明：
 
 - 前端工程已经切到 `CSAgent/frontend`，但第一次运行前仍需在该目录执行 `npm install`
 - 当前 IDE 中与 `vite` / `@vitejs/plugin-react` 相关的报错，属于前端依赖尚未在 `CSAgent/frontend` 安装完成
 - 实际对话链路运行仍依赖有效的大模型 API Key

## 文档索引

- `docs/01-整体架构说明.md`
- `docs/02-迁移策略.md`
- `docs/03-开发计划.md`
- `docs/04-插件化开发标准.md`
- `docs/05-当前能力映射.md`

 ## 建议的下一步
 
 建议你接下来在 `CSAgent` 中按这个顺序推进：
 
 1. 保持当前 `native_core` 版本持续可运行
 2. 从 `telecom.query` 开始，把工具 / 技能 / 卡片逐步抽回 `plugins/`
 3. 再迁移推荐、下单、充值三类插件闭环
 4. 最后把当前 `backend` 中的业务实现沉淀为真正的框架核心 + 插件边界
