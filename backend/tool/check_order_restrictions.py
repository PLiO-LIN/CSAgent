from tool.base import tool, ToolResult
from tool.order_shared import load_order_restrictions, summarize_restrictions


@tool(
    name="check_order_restrictions",
    description="校验当前设备号是否存在冻结、黑名单、风险套餐、合约未到期、非公客等订购限制。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号或设备号"},
        },
        "required": ["phone"],
    },
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "allowed_scenarios": ["order", "recommend", "query"],
        "phase_guidance": "在正式订购前可先校验设备限制，若受限应先解释原因并停止继续下单。",
    },
)
async def check_order_restrictions(phone: str) -> ToolResult:
    phone = str(phone).strip()
    eop, error = await load_order_restrictions(phone)
    if error:
        return ToolResult(error=error)

    summary = summarize_restrictions(eop)
    billing_type = str(eop.get("billingType", "") or "").strip()
    fee_cycle_type = str(eop.get("feeCycleType", "") or "").strip()
    customer_type = str(eop.get("customerType", "") or "").strip()
    items = eop.get("restrictionItems", []) if isinstance(eop.get("restrictionItems"), list) else []

    lines = [f"手机号: {phone}"]
    if billing_type or fee_cycle_type:
        lines.append(f"  付费类型: {billing_type or '-'} / {fee_cycle_type or '-'}")
    if customer_type:
        lines.append(f"  客户类型: {customer_type}")
    lines.append(f"  限制结论: {summary}")
    hit_items = [str(item.get("label", "")).strip() for item in items if item.get("blocked")]
    if hit_items:
        lines.append(f"  命中限制: {'、'.join(item for item in hit_items if item)}")

    workflow_patch = {
        "scenario": "order",
        "phase": "intent_collected" if eop.get("canOrder") else "blocked",
        "entities": {
            "restriction_summary": summary,
        },
        "constraints": [str(item.get("label", "")).strip() for item in items if item.get("blocked")],
        "flags": {
            "preview_ready": False,
        },
        "requires_human_handoff": not bool(eop.get("canOrder")),
        "service_channel": "线上客服" if eop.get("canOrder") else "营业厅/客户经理",
    }
    history_entry = {
        "kind": "check_order_restrictions",
        "summary": summary,
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
