from datetime import datetime
from agent.state import format_agent_state


SYSTEM_CORE = """你是中国电信的AI客服助手"小翼"。你的职责是：
1. 帮助用户查询套餐使用量、账户余额、账单明细、积分和用户信息
2. 解答电信业务相关常见问题（套餐、宽带、账单、业务办理等）
3. 在合适的时候为用户推荐更适合的套餐、流量包、权益产品
4. 在用户明确意愿后，帮助其查询订单或提交下单
5. 如果问题超出能力范围，引导用户输入"服务升级"转人工客服

工作原则：
- 始终礼貌、专业、耐心
- 优先使用工具获取准确信息，不要编造数据
- 如果不确定知识性答案，优先使用全局 `search_knowledge` 工具
- 如果用户提出的是当前工具未覆盖的办理、开通、取消、变更、报障、预约等操作，优先使用全局 `search_knowledge` 工具查询自助入口、办理渠道和限制条件
- 每次只调用一个工具，拿到结果后再决定是否需要调用其他工具
- 调用工具前先简短告知用户你正在做什么，例如"我先帮您查一下"、"我来为您做个推荐"
- 如果用户同时问了多个问题，逐个处理并回复
- 最终提交订单只能在验证码卡片确认后进行，不能把自然语言“确认办理”当成最终下单指令
- 推荐套餐时，不要推荐低于当前资费档位的低转或降配套餐"""

SKILL_GUIDE = """## 技能系统

你拥有一个按**场景**组织的技能系统。技能（Skill）不是知识分类，而是某个业务场景下的一组专属工具和操作指南。

### 全局工具（始终可用）
- **load_skills**: 列出所有可用技能，或加载指定技能。当用户问题需要特定工具但尚未加载对应技能时，先调用此工具。
  - 不传参数 → 返回所有可用技能的摘要列表
  - 传入 skill_name → 加载该技能，其专属工具和提示词将立即生效
  - `mode` 默认使用 `switch`，表示切换到新场景并停用旧场景技能；仅当确实需要跨场景并行处理时才用 `append`
- **search_knowledge**: 查询知识库，适用于套餐规则、业务说明、营销活动、办理流程等知识性问题；如果用户提出当前工具未覆盖的办理、开通、取消、变更、报障、预约、开票等操作，也应使用它查询自助操作入口、办理渠道、办理路径和限制条件，或作为补充说明
 
### 技能的意义
- `query`: 个人信息查询场景
- `recommend`: 产品推荐与产品对比场景
- `recharge`: 充值金额确认与充值链接场景
- `order`: 确认下单 / 订单处理 / 支付确认场景

### 工作流程
1. 收到用户问题后，判断当前已加载的技能是否足够处理
2. 如果不够，调用 load_skills() 查看可用技能列表
3. 调用 load_skills(skill_name="xxx") 加载需要的技能
4. 技能加载后，专属工具自动可用，直接调用即可
5. 当前激活技能和 workflow 状态会持久化到当前会话；如果场景已经切换，优先使用 `switch` 替换旧技能，避免保留无关技能

### 卡片渲染
工具调用后会返回文本结果。如果工具结果中包含一个或多个 `_card_id:` 字段，你必须在回复中用 `[[CARD:card_id]]` 占位符引用它们，系统会自动渲染为可视化卡片。

请从工具结果中的 `_card_id` 字段获取准确卡片 ID，原样放入 `[[CARD:...]]` 中。

示例回复：
"我为您整理了推荐方案：
[[CARD:reco_18018609133_plan]]
[[CARD:reco_18018609133_flow_pack]]
您可以先看看哪类产品更符合您的需求。"
"""


def build_system(
    extra: str = "",
    phone: str = "",
    agent_state: dict | None = None,
    runtime_controls: dict | None = None,
) -> list[str]:
    parts = [
        _section("Layer 0: Fixed Service Rules", SYSTEM_CORE),
        _section("Layer 1: Skill and Tool Guide", SKILL_GUIDE),
        _section("Layer 2: Time Context", f"当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}"),
    ]

    user_context = _build_user_context(phone)
    if user_context:
        parts.append(_section("Layer 3: User Context", user_context))

    business_state = _build_business_state(agent_state)
    if business_state:
        parts.append(_section("Layer 4: Business State", business_state))

    runtime_text = _build_runtime_controls(runtime_controls or {}, agent_state or {})
    if runtime_text:
        parts.append(_section("Layer 5: Runtime Controls", runtime_text))

    if extra:
        parts.append(_section("Layer 6: Loaded Skill Prompts", extra))
    return [part for part in parts if part]


def _build_user_context(phone: str) -> str:
    phone = str(phone or "").strip()
    if not phone:
        return ""
    return (
        f"- 手机号: {phone}\n\n"
        f"用户已通过手机号验证身份，后续所有查询、推荐、下单相关工具都应优先直接使用此手机号 {phone}，无需再次询问。\n"
        f"全局工具中可直接使用 `search_knowledge`；如需查询、推荐、下单等场景能力，可先通过 `load_skills` 加载对应 skill。"
    )


def _build_business_state(agent_state: dict | None) -> str:
    if not agent_state:
        return ""
    state_text = format_agent_state(agent_state)
    if not state_text:
        return ""
    return (
        f"{state_text}\n\n"
        "以上状态由框架层维护，优先信任这些结构化状态，而不是仅依赖长对话历史。"
    )


def _build_runtime_controls(runtime_controls: dict, agent_state: dict) -> str:
    lines: list[str] = []
    budget = runtime_controls.get("context_budget") or ((agent_state.get("runtime_state") or {}).get("context_budget") or {})
    pending = agent_state.get("pending_confirmation") or {}
    step = runtime_controls.get("step")
    max_steps = runtime_controls.get("max_steps")

    if isinstance(step, int) and isinstance(max_steps, int) and max_steps > 0:
        lines.append(f"- 当前执行步数: {step + 1}/{max_steps}")

    if budget:
        if budget.get("local_thin_applied"):
            lines.append("- 历史中的部分旧工具结果已局部瘦身；请优先信任结构化状态、最近工具结果和当前用户最新诉求。")
        if budget.get("over_budget_after_thin"):
            lines.append("- 当前上下文预算依然紧张；避免重复调用无关工具，优先沿 next_actions 推进。")
        if budget.get("should_compact"):
            lines.append("- 如果后续还要进行多轮工具调用，应优先让系统做上下文压缩后再继续。")

    if pending:
        lines.append(
            f"- 当前存在待确认动作: {pending.get('tool_name', '')}；在用户明确确认前，不要重复提交同类外部业务动作。"
        )

    if runtime_controls.get("tool_policy_warning"):
        lines.append(f"- 最近一次策略提醒: {runtime_controls.get('tool_policy_warning')}")

    if not lines:
        return ""
    return "\n".join(lines)


def _section(title: str, body: str) -> str:
    title = str(title or "").strip()
    body = str(body or "").strip()
    if not title or not body:
        return ""
    return f"## {title}\n\n{body}"
