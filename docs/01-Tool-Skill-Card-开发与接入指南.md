# CSAgent Tool / Skill / Card 开发与接入指南

本文档面向两类角色：

- **能力开发者**：负责开发业务服务、Tool、Skill、Card 输出能力
- **平台管理员 / 平台使用者**：负责把开发者交付的能力接入 CSAgent 平台，并绑定到 Agent 使用

目标是形成一条稳定链路：

1. 开发者只需要按统一契约开发服务与输出
2. 平台管理员只需要在平台里配置 Tool / Skill / Card Template / Agent
3. 最终业务方不用改前端代码，就能接入并使用新能力

---

# 1. 平台里的 4 个核心对象

## 1.1 Tool

`Tool` 是**可执行能力**，可以是：

- 本地 Python Tool
- MCP 外部服务暴露出来的 Tool

Tool 负责：

- 接收结构化参数
- 执行业务动作或查询
- 返回文本结果
- 按统一契约返回结构化数据或卡片

## 1.2 Skill

`Skill` 是**场景能力包**，不是一个服务接口。

Skill 负责：

- 描述“什么场景下应该这样做”
- 约束模型在该场景下的决策方式
- 绑定一组 Tool
- 声明可能输出的卡片类型

在当前 CSAgent 中：

- Skill 摘要会进入系统提示词
- Skill 正文不会默认塞进系统提示
- 模型需要时，会调用全局工具 `load_skills` 加载完整 Skill 正文

这意味着：

- **Skill summary 要短**
- **Skill document_md 要完整可执行**

## 1.3 Card

`Card` 是**前端可渲染结果**。

Tool 的业务结果最终如果希望以卡片展示，就要进入统一卡片协议。

当前支持两类方式：

- **直接卡片**：Tool 直接返回最终 `card` / `cards`
- **模板卡片**：Tool 返回 `card_source` / `card_sources`，平台根据 Tool 绑定的 `card_binding + card_template` 自动生成卡片

对于 MCP Tool，当前还支持一条更推荐的协议直连链路：

- Tool 定义侧通过 `_meta` 声明卡片绑定规则
- Tool 调用结果通过 `structuredContent` 返回卡片 JSON 数据
- 平台在 `/api/platform/tools/sync/mcp` 时自动把 `_meta` 映射进 Tool 的 `supports_card / card_binding / output_schema / metadata.icons`
- Agent 运行时会优先用这些同步后的绑定规则自动出卡

## 1.4 Card Template

`Card Template` 是**低代码卡片模板**，由平台维护，不需要每次都写 React。

Card Template 负责：

- 定义模板类型
- 定义 `renderer_key`
- 定义 `data_schema`
- 定义 `ui_schema`
- 定义 `action_schema`
- 提供 `sample_payload`

当前前端已支持以下 block：

- `hero`
- `metric_grid`
- `kv_list`
- `item_list`

只有当这些 block 不够用时，才建议写新的定制 React 渲染器。

---

# 2. 推荐的接入模式

## 2.1 模式 A：MCP 外部服务接入（推荐）

适用场景：

- 业务系统已有独立服务
- 能力团队不想改 CSAgent 后端代码
- 希望平台使用者自己接服务

推荐链路：

1. 开发者交付一个 MCP Server
2. 平台管理员在 `/api/framework/mcp-config` 或平台控制台里配置该 Server
3. 平台管理员执行 `/api/platform/tools/sync/mcp` 同步工具
4. 平台管理员在 Tools / Skills / Cards / Agents 页面完成绑定与发布

这是**最符合平台化、服务化交付**的模式。

## 2.2 模式 B：本地 Python Tool 接入

适用场景：

- 能力就是平台内置能力
- 需要直接访问平台本地代码与状态
- 不打算独立部署成外部服务

做法：

1. 在 `backend/tool/` 下实现本地 Tool
2. 用 `@tool(...)` 注册
3. 文件名不要以下划线开头，且不要命名为 `base.py` / `registry.py`
4. 启动时 `tool.registry` 会自动导入 `backend/tool/` 下的本地 Tool 模块
5. 启动后同步到平台注册中心
6. 平台管理员再做 Tool / Skill / Card / Agent 配置

补充说明：

- 当前本地 Tool 自动发现会扫描 `backend/tool/` 下的模块
- 会跳过 `base.py`、`registry.py` 和以下划线开头的模块
- 因此开发者通常只需要新建一个独立模块并使用 `@tool(...)` 注册即可

## 2.3 模式选择建议

优先级建议：

- **优先选 MCP**：适合跨团队交付、外部服务接入、平台管理员自助接入
- **再选本地 Tool**：适合平台基础能力或必须内嵌在仓库中的能力

---

# 3. Tool 开发规范

如果你开发的是本地 Tool，推荐每个业务能力单独一个文件，例如：

```text
backend/tool/query_account_balance.py
backend/tool/query_order_detail.py
backend/tool/submit_refund_request.py
```

# 3.1 Tool 的职责边界

Tool 只负责：

- 执行一件明确的事
- 返回清晰、可消费的结果
- 尽量提供结构化输出

Tool 不应承担：

- 大段场景决策逻辑
- 多轮对话管理
- 前端渲染逻辑
- 整体业务编排

这些应该分别由：

- Skill
- Agent
- Card Template
- 平台配置

来承担。

# 3.2 Tool 命名规范

建议统一使用小写 snake_case：

```text
query_account_balance
query_order_detail
recommend_products
submit_refund_request
```

要求：

- 名称稳定，不要频繁改名
- 一眼能看出动作含义
- 不要掺杂环境名、测试名、版本号

不推荐：

```text
balanceTool
query_v2_prod
final_query_order_2026
```

# 3.3 Tool 参数规范

当前 Tool 参数使用 JSON Schema 表达。

最低要求：

- `type: object`
- `properties`
- 每个字段有清晰 `type`
- 每个关键字段写 `description`
- 必填参数放进 `required`

示例：

```python
from tool.base import tool, ToolResult

@tool(
    name="query_account_balance",
    description="查询用户账户余额与可用积分。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {
                "type": "string",
                "description": "用户手机号或账户标识"
            }
        },
        "required": ["phone"]
    },
    scope="skill",
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "external_side_effect": False,
        "phase_guidance": "适合在查询类场景下调用"
    },
)
async def query_account_balance(phone: str) -> ToolResult:
    payload = {
        "title": "账户余额",
        "summary": f"号码 {phone} 的当前余额信息",
        "metrics": [
            {"label": "余额", "value": "86.00 元", "hint": "当前可用余额"},
            {"label": "积分", "value": 2480, "hint": "可兑换积分"},
        ],
    }
    return ToolResult(
        text="已查询到账户余额与积分。",
        metadata={
            "card_source": payload,
        },
    )
```

# 3.4 Tool scope 规范

当前支持两种：

- `global`
- `skill`

含义：

- **global**：始终可见，例如 `load_skills`
- **skill**：只有该 Skill 被加载后才可见

建议：

- 基础平台能力放 `global`
- 业务 Tool 放 `skill`

# 3.5 Tool policy 规范

`ToolPolicy` 当前支持的关键字段：

- `risk_level`
- `confirm_policy`
- `allowed_scenarios`
- `allowed_phases`
- `required_entities`
- `required_flags`
- `idempotency_key_fields`
- `conflict_keys`
- `external_side_effect`
- `fallback_to_knowledge`
- `phase_guidance`

建议：

- 查询类 Tool：`risk_level=low`，`confirm_policy=never`
- 提交、下单、变更类 Tool：至少 `risk_level=medium`，通常需要确认
- 会产生外部副作用的 Tool：`external_side_effect=True`

# 3.6 Tool 返回规范

当前统一返回 `ToolResult`：

```python
class ToolResult(BaseModel):
    text: str = ""
    error: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
```

开发要求：

- **`text` 必须有**：给模型与日志看的摘要
- **`error` 只在失败时使用**
- **结构化数据尽量放 `metadata`**

推荐遵循下面 3 层返回规范。

## 层 1：文本摘要

```python
return ToolResult(text="已查询到账户余额。")
```

适合：

- 纯文本说明能力
- 不需要卡片

## 层 2：结构化业务结果

```python
return ToolResult(
    text="已查询到账户余额。",
    metadata={
        "card_source": {
            "title": "账户余额",
            "summary": "当前余额与积分情况",
            "metrics": [
                {"label": "余额", "value": "86.00 元"},
                {"label": "积分", "value": 2480},
            ],
        }
    }
)
```

适合：

- 希望把渲染逻辑交给平台模板
- 开发者只交付结构化数据

## 层 3：直接返回最终卡片

```python
return ToolResult(
    text="已生成推荐结果。",
    metadata={
        "card": {
            "type": "recommendation_list",
            "template_id": "recommendation_list_default",
            "renderer_key": "template::recommendation_list",
            "title": "套餐推荐",
            "summary": "根据当前画像推荐以下方案",
            "payload": {
                "title": "套餐推荐",
                "summary": "根据当前画像推荐以下方案",
                "items": [
                    {
                        "title": "5G 畅享 129",
                        "summary": "适合重度流量用户",
                        "badges": ["129 元/月", "100GB"]
                    }
                ]
            },
            "ui_schema": {
                "blocks": [
                    {"type": "hero", "title": "$.title", "summary": "$.summary"},
                    {"type": "item_list", "path": "$.items"}
                ]
            },
            "actions": [
                {"label": "继续推荐", "contentTemplate": "继续基于 {{title}} 给我推荐"}
            ]
        }
    }
)
```

适合：

- 需要由开发者完全控制最终卡片结构
- 平台不再做二次绑定

# 3.7 多卡返回规范

如果一次 Tool 需要返回多个卡片，建议用：

```python
return ToolResult(
    text="已生成多个推荐卡片。",
    metadata={
        "card_sources": [
            {
                "source_payload": {"title": "推荐 A", "summary": "说明 A", "items": []},
                "suffix": "offer_a"
            },
            {
                "source_payload": {"title": "推荐 B", "summary": "说明 B", "items": []},
                "suffix": "offer_b"
            }
        ]
    }
)
```

说明：

- `suffix` 用于生成稳定卡片 ID
- 如果你直接返回最终卡片，也可以使用 `cards`

例如：

```python
metadata={
    "cards": [
        {"card": {...}, "suffix": "offer_a"},
        {"card": {...}, "suffix": "offer_b"},
    ]
}
```

# 3.8 当前推荐的 Tool 输出策略

推荐优先级：

- **推荐 1**：返回 `card_source` / `card_sources`，把渲染交给平台模板
- **推荐 2**：复杂场景返回最终 `card` / `cards`
- **不推荐**：只返回一大段自然语言，完全不给结构化信息

---

# 4. MCP 外部服务开发规范

如果你希望平台使用者直接接服务，推荐开发 MCP Server。

# 4.1 MCP 服务开发要求

至少满足：

- Tool 名称稳定
- 入参清晰
- 能返回结构化对象或数组
- 查询类与动作类明确区分
- 风险级别可由平台侧配置

# 4.2 当前平台对 MCP 返回值的处理方式

当前 `backend/mcp_runtime.py` 会把 MCP Tool 结果适配为 `ToolResult`：

- 文本内容进入 `text`
- `structuredContent` 会进入 `metadata.mcp_structured_content`
- 结果 `_meta` 会进入 `metadata.mcp_meta`

当前运行时已经补齐了自动绑定逻辑：

- 如果 MCP Tool 在定义侧 `_meta` 中声明了卡片绑定协议
- 平台在同步 MCP Tool 时会自动生成 `supports_card` 与 `card_binding`
- 如果 MCP Tool 返回了对象 / 数组形式的 `structuredContent`
- 运行时会把它当成 `card_source` / `card_sources`
- 自动根据模板生成前端卡片
- 如果 MCP Tool 在结果 `_meta` 中直接返回 `card` / `cards`
- 则运行时会直接渲染这些卡片

这意味着：

- **MCP 开发者可以把绑卡信息直接下发给平台，不必在平台里手填一遍**
- **平台管理员主要负责模板库、技能、智能体编排，不再手工维护大段 MCP Tool 元数据**

# 4.3 MCP 示例：FastMCP

仓库里已有一个最小 smoke server：

- `backend/smoke_fastmcp_server.py`

开发者可以参考如下方式编写：

```python
from mcp.server.fastmcp import FastMCP

app = FastMCP("account-service")

@app.tool(
    title="余额查询",
    meta={
        "io.github.pliolin.csagent/card": {
            "version": 1,
            "mode": "template_payload",
            "templateId": "metric_summary_default",
            "cardType": "metric_summary_default",
            "source": "structuredContent"
        },
        "io.github.pliolin.csagent/icons": [
            {
                "src": "data:image/svg+xml;base64,...",
                "mimeType": "image/svg+xml",
                "sizes": ["any"]
            }
        ]
    },
    structured_output=True,
)
def query_account_balance(phone: str) -> dict:
    return {
        "title": "账户余额",
        "summary": f"号码 {phone} 的账户信息",
        "metrics": [
            {"label": "余额", "value": "86.00 元", "hint": "当前可用余额"},
            {"label": "积分", "value": 2480, "hint": "可兑换积分"},
        ],
    }

if __name__ == "__main__":
    app.run()
```

推荐约定：

- Tool 定义 `_meta["io.github.pliolin.csagent/card"]`：声明卡片绑定
- Tool 定义 `icons`：声明官方 MCP 图标
- Tool 调用返回 `structuredContent`：返回结构化卡片数据
- Tool 调用返回 `_meta["io.github.pliolin.csagent/card-result"]`：只在需要动态覆写卡片时使用

兼容性说明：

- 当 MCP client / server 双方版本都支持官方 `icons` 字段时，平台会直接读取它
- 当前仓库后端依赖 `mcp==1.12.4`，该版本客户端侧 `Tool` 尚未暴露 `icons`
- 因此当前实现同时支持 `_meta["io.github.pliolin.csagent/icons"]` 作为图标镜像字段

平台管理员随后：

1. 配置 MCP Server
2. 同步工具
3. 检查同步后的 `supports_card / card_binding / output_schema / metadata.icons`
4. 在平台里补充 Skill / Agent 绑定
5. 只有当需要覆盖协议默认值时，才手工修改 Tool 配置

---

# 5. Skill 开发规范

# 5.1 Skill 的角色

Skill 不是工具集合的简单别名，而是：

- 场景说明
- 决策约束
- 工具使用准则
- 输出要求
- 异常处理规则

Skill 应该回答的问题：

- 什么时候进入这个场景
- 先收集什么信息
- 哪些 Tool 可以用
- 哪些 Tool 不能乱用
- 遇到失败时怎么解释
- 输出应该偏解释、偏表格、还是偏推荐卡片

# 5.2 Skill 字段建议

当前 Skill 记录的关键字段：

- `skill_name`
- `display_name`
- `summary`
- `document_md`
- `tool_names`
- `global_tool_names`
- `card_types`
- `entry_intents`
- `phases`
- `source_type`
- `source_ref`
- `metadata`

当前前端主配置重点通常是：

- 名称
- 摘要
- 绑定工具
- 正文 Markdown

# 5.3 summary 编写规范

`summary` 会进入系统提示词中的技能摘要区，因此必须：

- 短
- 准
- 可判定

推荐格式：

```text
用于处理账户余额、积分、账单概览查询，优先调用 query_account_balance，不做任何外部变更操作。
```

不推荐：

- 写成长文
- 写操作细节
- 重复 Tool 参数说明

# 5.4 document_md 编写规范

`document_md` 是完整 Skill 正文，建议至少包含以下章节：

```markdown
# 适用场景

- 用户询问账户余额、积分、账单概览
- 用户希望快速查看关键指标

# 进入条件

- 用户表达查询诉求
- 已知 phone 或可从上下文推断到账户标识

# 执行步骤

1. 确认用户要查询的对象
2. 调用 `query_account_balance`
3. 先用一句话概括结果，再结合卡片说明重点

# 工具使用规则

- 仅使用 `query_account_balance`
- 不要调用任何会修改账户状态的工具
- 工具失败时说明失败原因并给出补救建议

# 输出要求

- 先给一句人类可读的结论
- 如果有卡片，优先引用卡片中的关键字段
- 不要机械重复全部字段

# 禁止事项

- 不要编造余额
- 不要在 Tool 失败时假装成功
```

# 5.5 Skill 与 Tool 的关系

建议一个 Skill 只绑定**完成该场景真正需要的工具**。

不要把所有工具都挂进一个 Skill。

建议：

- 查询 Skill：只挂查询工具
- 推荐 Skill：挂画像、推荐、解释类工具
- 办理 Skill：挂校验、预检查、提交、确认类工具

# 5.6 Skill 与 Card 的关系

Skill 本身不渲染卡片，但可以通过 `card_types` 声明该场景常见卡片类型。

例如：

```json
[
  "metric_summary",
  "info_detail",
  "recommendation_list"
]
```

这更像是场景声明，而不是渲染实现。

---

# 6. Card 与 Card Template 开发规范

# 6.1 什么时候用 Card Template

满足下列条件时，优先用模板：

- 信息结构稳定
- 多个 Tool 会复用同类展示方式
- 不想写新的 React 渲染组件
- 希望平台管理员能通过配置调整展示

只有下列情况才考虑定制 React：

- 交互极复杂
- 现有 block 无法表达
- 布局明显超出模板 DSL 能力

# 6.2 当前模板卡片结构

运行时发到前端的模板卡片结构建议如下：

```json
{
  "type": "metric_summary",
  "template_id": "metric_summary_default",
  "renderer_key": "template::metric_summary",
  "title": "账户余额",
  "summary": "当前余额与积分情况",
  "payload": {
    "title": "账户余额",
    "summary": "当前余额与积分情况",
    "metrics": [
      {"label": "余额", "value": "86.00 元", "hint": "当前可用余额"},
      {"label": "积分", "value": 2480, "hint": "可兑换积分"}
    ]
  },
  "ui_schema": {
    "blocks": [
      {"type": "hero", "title": "$.title", "summary": "$.summary"},
      {"type": "metric_grid", "path": "$.metrics"}
    ]
  },
  "actions": []
}
```

# 6.3 当前支持的 block

## `hero`

用于头部标题和摘要。

示例：

```json
{"type": "hero", "title": "$.title", "summary": "$.summary"}
```

## `metric_grid`

用于指标概览。

推荐 payload 结构：

```json
{
  "metrics": [
    {"label": "余额", "value": "86.00 元", "hint": "当前可用余额"}
  ]
}
```

## `kv_list`

用于字段列表。

推荐 payload 结构：

```json
{
  "fields": [
    {"label": "账户名", "value": "张三"},
    {"label": "状态", "value": "正常"}
  ]
}
```

## `item_list`

用于推荐项或项目列表。

推荐 payload 结构：

```json
{
  "items": [
    {
      "title": "5G 畅享 129",
      "summary": "适合重度流量用户",
      "badges": ["129 元/月", "100GB"],
      "actions": [
        {"label": "继续了解", "contentTemplate": "继续介绍 {{title}}"}
      ]
    }
  ]
}
```

# 6.4 路径表达式规范

当前模板路径支持：

- `$`
- `$.field`
- `$.field.subfield`
- `$.items[0]`
- `$.items[0].title`

例如：

```json
{"title": "$.title", "summary": "$.summary"}
```

# 6.5 动作规范

当前前端动作协议支持：

- `label`
- `content`
- `displayContent`
- `contentTemplate`
- `displayTemplate`
- `clientMeta`
- `variables`

示例：

```json
{
  "label": "继续推荐",
  "contentTemplate": "继续基于 {{title}} 给我推荐",
  "displayTemplate": "继续推荐：{{title}}"
}
```

说明：

- `contentTemplate` 会在前端根据 `variables` 或当前 item payload 填充
- 动作点击后会变成新的聊天输入

# 6.6 Card Template 定义字段

当前平台 Card Template 关键字段：

- `template_id`
- `display_name`
- `summary`
- `enabled`
- `template_type`
- `renderer_key`
- `data_schema`
- `ui_schema`
- `action_schema`
- `sample_payload`
- `metadata`

建议：

- `template_id` 稳定、可复用
- `template_type` 体现语义而不是来源系统
- `renderer_key` 建议使用 `template::<template_type>`

# 6.7 推荐的模板示例

```json
{
  "template_id": "metric_summary_default",
  "display_name": "指标汇总卡",
  "summary": "适合余额、积分、账单指标等概览型卡片。",
  "enabled": true,
  "template_type": "metric_summary",
  "renderer_key": "template::metric_summary",
  "data_schema": {
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "summary": {"type": "string"},
      "metrics": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "label": {"type": "string"},
            "value": {},
            "hint": {"type": "string"}
          }
        }
      }
    }
  },
  "ui_schema": {
    "blocks": [
      {"type": "hero", "title": "$.title", "summary": "$.summary"},
      {"type": "metric_grid", "path": "$.metrics"}
    ]
  },
  "action_schema": {"actions": []},
  "sample_payload": {
    "title": "账户余额",
    "summary": "适合展示几个重要数字。",
    "metrics": [
      {"label": "余额", "value": "86.00 元", "hint": "账户可用余额"}
    ]
  },
  "metadata": {}
}
```

---

# 7. Tool 与 Template 的绑定规范

这是当前最关键的低代码接入点。

# 7.1 平台 Tool 侧的 `card_binding`

平台管理员可以在 Tool 配置里维护 `card_binding`。

但对 **MCP 同步工具**，更推荐的做法是：

- 由 MCP Tool 定义 `_meta` 直接下发 `card_binding`
- 平台在 sync 时自动入库
- 平台侧 `card_binding` 主要作为覆盖、排障、临时修正使用

当前推荐字段如下：

- `template_id`
- `mode`
- `title`
- `summary`
- `payload_path`
- `payload_map`
- `actions_path`
- `actions`
- `metadata`
- `card_path`

# 7.2 当前支持的绑定模式

## `template_payload`

默认模式。

含义：

- `card_source` 已经基本符合模板 payload 结构
- 平台只需要把它交给模板渲染

适合：

- 开发者愿意按模板 payload 直接返回结构化数据

## `field_map`

含义：

- 源数据与模板 payload 结构不同
- 平台通过路径映射 / payload_map 完成转换

示例：

```json
{
  "mode": "field_map",
  "template_id": "metric_summary_default",
  "title": "$.account_name",
  "summary": "$.status_text",
  "payload_map": {
    "title": "$.account_name",
    "summary": "$.status_text",
    "metrics": "$.metrics"
  },
  "actions_path": "$.actions"
}
```

## `direct_card`

含义：

- 源数据里本身已经嵌了完整 card
- 平台只负责取出它

示例：

```json
{
  "mode": "direct_card",
  "card_path": "$.card"
}
```

## `tool_metadata`

含义：

- Tool 已经返回最终 card 结构
- 平台不再做模板映射

适合：

- 非模板卡
- 已由开发者完全生成好的卡片

# 7.3 当前运行时自动绑定规则

当前运行时顺序如下：

1. 如果 ToolResult 里已经有 `metadata.card` / `metadata.cards`
   - 直接渲染这些卡片
2. 否则，如果 MCP Tool 返回结果 `_meta["io.github.pliolin.csagent/card-result"]` 中带有 `card` / `cards`
   - 直接渲染这些卡片
3. 否则，如果平台 Tool 配置了 `card_binding.template_id`
   - 运行时会优先取 `metadata.card_source` / `metadata.card_sources`
   - 如果是 MCP Tool，且没有显式 `card_source`，会回退使用 `structuredContent`
   - 再按模板生成卡片
4. 否则，如果 `card_binding.mode == tool_metadata`
   - 会把 `card_source` / `card_sources` 当最终卡片使用

因此对 MCP 开发者来说，最推荐的输出协议是：

- Tool 定义 `_meta["io.github.pliolin.csagent/card"] = {...}`
- 单卡：返回对象形式 `structuredContent`
- 多卡：返回数组形式 `structuredContent`
- 只有需要动态覆写卡片时，再使用 `_meta["io.github.pliolin.csagent/card-result"]`

---

# 8. 平台管理员接入步骤

这一节是“平台使用者直接接开发服务”的标准流程。

# 8.1 接入外部 MCP 服务

## 第一步：配置 MCP Server

接口：

- `GET /api/framework/mcp-config`
- `PUT /api/framework/mcp-config`

关键字段：

- `enabled`
- `tool_timeout_seconds`
- `servers`

单个 Server 支持：

- `transport`
- `command`
- `args`
- `cwd`
- `url`
- `headers`
- `scope`
- `tool_name_prefix`
- `include_tools`
- `exclude_tools`
- `risk_level`
- `confirm_policy`

示例：

```json
{
  "enabled": true,
  "tool_timeout_seconds": 60,
  "servers": {
    "account_service": {
      "enabled": true,
      "transport": "stdio",
      "command": "python",
      "args": ["backend/smoke_fastmcp_server.py"],
      "cwd": "",
      "scope": "skill",
      "tool_name_prefix": "mcp__account__",
      "include_tools": [],
      "exclude_tools": [],
      "risk_level": "auto",
      "confirm_policy": "auto"
    }
  }
}
```

## 第二步：同步工具

接口：

- `POST /api/platform/tools/sync/mcp`

同步后，MCP Tool 会进入平台注册中心。

## 第三步：在 Tools 页面完善工具元数据

建议配置：

- `summary`
- `scope`
- `supports_card`
- `card_type`
- `card_binding`
- `policy`

## 第四步：在 Cards > 模板库配置模板

建议完成：

- 创建或选择模板
- 配置 `data_schema`
- 配置 `ui_schema`
- 配置 `sample_payload`

## 第五步：在 Cards > 绑定协议里绑定 Tool

至少确认：

- Tool 是否 `supports_card=true`
- `card_binding.template_id` 是否正确
- `mode` 是否正确
- Playground 预览是否通过

## 第六步：创建或更新 Skill

接口：

- `POST /api/platform/skills`
- `PUT /api/platform/skills/{skill_name}`

在 Skill 里绑定：

- 该 MCP Tool
- Skill 摘要
- Skill 正文

## 第七步：绑定到 Agent

接口：

- `POST /api/platform/agents`
- `PUT /api/platform/agents/{agent_id}`
- `POST /api/platform/agents/{agent_id}/publish`

Agent 里配置：

- `model_config`
- `skill_names`
- `global_tool_names`
- `persona_prompt`

## 第八步：发布并验证

验证项：

- Agent 能否正确调用工具
- ToolResult 是否正常回流
- 卡片是否成功渲染
- 动作按钮是否能回填聊天输入

# 8.2 接入本地 Tool

本地 Tool 的接入流程与上面类似，只是少了 MCP Server 配置和同步步骤。

开发者提交代码后，平台管理员主要做：

- Tool 元数据补全
- Skill 绑定
- Card Template 与 card_binding 配置
- Agent 绑定与发布

如果需要手动刷新本地 Tool 到平台注册中心，可调用：

- `POST /api/platform/tools/sync/local`

---

# 8.3 平台 API 速查表

## 平台注册中心

- `GET /api/platform/snapshot`
- `GET /api/platform/tools`
- `POST /api/platform/tools`
- `PUT /api/platform/tools/{tool_name}`
- `POST /api/platform/tools/sync/local`
- `POST /api/platform/tools/sync/mcp`
- `GET /api/platform/skills`
- `POST /api/platform/skills`
- `PUT /api/platform/skills/{skill_name}`
- `GET /api/platform/card-templates`
- `GET /api/platform/card-templates/{template_id}`
- `POST /api/platform/card-templates`
- `PUT /api/platform/card-templates/{template_id}`
- `POST /api/platform/cards/preview`
- `GET /api/platform/agents`
- `GET /api/platform/agents/{agent_id}`
- `POST /api/platform/agents`
- `PUT /api/platform/agents/{agent_id}`
- `POST /api/platform/agents/{agent_id}/publish`

## 框架配置

- `GET /api/framework/model-config`
- `PUT /api/framework/model-config`
- `GET /api/framework/mcp-config`
- `PUT /api/framework/mcp-config`

用途建议：

- 开发者联调时优先验证 `cards/preview`
- 平台管理员接服务时优先使用 `mcp-config` + `tools/sync/mcp`
- 批量初始化时优先调用 `tools` / `skills` / `card-templates` / `agents` CRUD 接口

---

# 9. Playground 使用方法

当前平台已提供：

- `POST /api/platform/cards/preview`
- 前端 Cards 页面里的 `Card Playground`

用途：

- 用样例 payload 验证模板是否能渲染
- 验证 `card_binding` 映射是否正确
- 验证动作按钮是否生成预期聊天输入

请求示例：

```json
{
  "template": {
    "template_id": "metric_summary_default",
    "display_name": "指标汇总卡",
    "summary": "适合余额、积分、账单指标等概览型卡片。",
    "enabled": true,
    "template_type": "metric_summary",
    "renderer_key": "template::metric_summary",
    "data_schema": {"type": "object", "properties": {}},
    "ui_schema": {
      "blocks": [
        {"type": "hero", "title": "$.title", "summary": "$.summary"},
        {"type": "metric_grid", "path": "$.metrics"}
      ]
    },
    "action_schema": {"actions": []},
    "sample_payload": {},
    "metadata": {}
  },
  "source_payload": {
    "account_name": "张三账户",
    "status_text": "账户正常",
    "metrics": [
      {"label": "余额", "value": "86.00 元"},
      {"label": "积分", "value": 2480}
    ]
  },
  "binding": {
    "mode": "field_map",
    "template_id": "metric_summary_default",
    "title": "$.account_name",
    "summary": "$.status_text",
    "payload_map": {
      "title": "$.account_name",
      "summary": "$.status_text",
      "metrics": "$.metrics"
    }
  }
}
```

---

# 10. 开发者交付清单

开发者向平台管理员交付能力时，至少应提供以下内容。

# 10.1 Tool 交付物

- Tool 名称清单
- 每个 Tool 的参数 Schema
- Tool 描述
- 风险级别建议
- 查询类 / 动作类说明
- 成功返回样例
- 失败返回样例

# 10.2 Skill 交付物

- Skill 名称
- Skill 摘要
- Skill 正文 Markdown
- 绑定 Tool 列表
- 建议的 card_types
- 进入条件与退出条件

# 10.3 Card 交付物

二选一：

- **方案 A**：直接交付最终 `card` / `cards` 结构
- **方案 B**：交付 `card_source` / `card_sources` 样例 + 推荐模板绑定方式

如果希望平台更低代码，推荐方案 B。

# 10.4 平台配置交付物

如果是 MCP 服务，开发者还应提供：

- 启动方式
- transport 类型
- command / url
- args / headers / cwd
- 鉴权方式
- 依赖环境说明

# 10.5 验收样例

建议至少提供 3 类样例：

- 正常成功
- 参数不足 / 业务失败
- 边界数据（空列表、空字段、多项结果）

---

# 11. 一条推荐的端到端开发流程

推荐按以下顺序推进。

## 第 1 步：先定义 Tool Schema

先把 Tool 的：

- 名称
- 参数
- 返回结构
- 风险策略

定义清楚。

## 第 2 步：确定返回的是 `card_source` 还是最终 `card`

建议优先选：

- `card_source`

只有在模板确实表达不了时，再返回最终 `card`。

## 第 3 步：写 Skill 摘要和正文

先想清楚：

- 场景边界
- 决策约束
- 工具使用顺序

不要先堆一堆 Tool，再让模型自己猜。

## 第 4 步：在平台里建立模板

在 Cards > 模板库里建立模板。

## 第 5 步：用 Playground 调通绑定

确保：

- source payload 正确
- 映射路径正确
- 动作按钮正确

## 第 6 步：再把 Tool 绑定到 Skill 和 Agent

只有预览通过后，再挂到 Agent 上。

---

# 12. 反模式与常见错误

## 12.1 Tool 只返回一大段文本

问题：

- 平台无法复用数据
- 卡片无法稳定生成
- 前端只能显示原始文字

正确做法：

- 返回结构化 `card_source`

## 12.2 把整个场景逻辑写死在 Tool 里

问题：

- Tool 不可复用
- Skill 失去意义
- Agent 难以组合

正确做法：

- Tool 只做能力
- Skill 负责场景规则

## 12.3 每种卡片都写一套 React

问题：

- 维护成本高
- 平台管理员无法自助调整
- 后续扩展慢

正确做法：

- 优先模板化
- 只有极少数复杂交互才定制组件

## 12.4 Skill summary 写成长文

问题：

- 系统提示膨胀
- 模型难以快速识别技能

正确做法：

- summary 简洁
- document_md 完整

## 12.5 让平台管理员改代码才能接服务

问题：

- 平台化失败
- 接入成本高

正确做法：

- 优先 MCP 服务
- 平台管理员通过配置接入

---

# 13. 推荐的最小交付模板

如果你要把一项新能力交给平台管理员，推荐至少交付下面 4 份内容。

## A. Tool 契约

```json
{
  "tool_name": "query_account_balance",
  "description": "查询用户账户余额与积分",
  "parameters": {
    "type": "object",
    "properties": {
      "phone": {"type": "string", "description": "用户手机号"}
    },
    "required": ["phone"]
  },
  "returns": {
    "text": "已查询到账户余额。",
    "card_source": {
      "title": "账户余额",
      "summary": "当前余额与积分情况",
      "metrics": []
    }
  }
}
```

## B. Skill 摘要

```text
用于处理账户余额、积分、账单概览查询，优先调用 query_account_balance，不执行任何外部变更操作。
```

## C. Skill 正文

一份 Markdown 文档，包含：

- 适用场景
- 执行步骤
- 工具使用规则
- 输出要求
- 异常处理

## D. Card 绑定建议

```json
{
  "supports_card": true,
  "card_type": "metric_summary",
  "card_binding": {
    "mode": "template_payload",
    "template_id": "metric_summary_default"
  }
}
```

有了这 4 份内容，平台管理员就可以把能力直接接入平台。

---

# 14. 最终推荐原则

把这三句话当成平台开发默认准则：

- **Tool 提供能力，不提供页面**
- **Skill 提供场景规则，不提供底层执行**
- **Card Template 提供展示协议，不提供业务逻辑**

如果开发团队和平台团队都按这个边界协作，CSAgent 就能真正实现：

- 服务开发独立
- 平台接入标准化
- 卡片展示低代码化
- Agent 组合可配置化
