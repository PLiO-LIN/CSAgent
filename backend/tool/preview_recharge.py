from tool.base import tool, ToolResult
from tool.recharge_shared import load_balance_snapshot, build_recharge_card, recharge_prefill, amount_text


@tool(
    name="preview_recharge",
    description="生成话费充值确认卡。可传入充值金额用于预填，也可在未知金额时先返回推荐金额和可编辑卡片。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "amount_yuan": {"type": "number", "description": "可选，充值金额（元）。当用户已明确说出充值金额时应直接传入，例如 50、100、200。"},
        },
        "required": ["phone"],
    },
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "allowed_scenarios": ["recharge", "query"],
        "phase_guidance": "先展示可编辑的充值确认卡，让用户核对或修改充值金额，再继续下一步。",
    },
)
async def preview_recharge(phone: str, amount_yuan: float = 0) -> ToolResult:
    phone = str(phone).strip()
    snapshot, error = await load_balance_snapshot(phone)
    if error:
        return ToolResult(error=error)

    draft_amount_yuan, source_label, summary = recharge_prefill(snapshot, amount_yuan)
    amount = amount_text(draft_amount_yuan)
    lines = [f"手机号: {phone}"]
    if snapshot.get("account_name"):
        lines[0] += f"  姓名: {snapshot.get('account_name', '')}"
    lines.append(f"  当前话费余额: {snapshot.get('balance', '0.00')}元")
    if snapshot.get("billing_type") or snapshot.get("fee_cycle_type"):
        lines.append(f"  付费方式: {snapshot.get('billing_type', '-')}/{snapshot.get('fee_cycle_type', '-')}")
    if float(snapshot.get("arrears_yuan", 0) or 0) > 0:
        lines.append(f"  当前欠费金额: {snapshot.get('arrears', '0.00')}元")
    lines.append(f"  预填充值金额: {amount}元（{source_label}）")
    lines.append(f"  说明: {summary}")
    if snapshot.get("can_recharge"):
        lines.append("  您可以直接在卡片上修改充值金额，并继续获取充值链接。")
    else:
        lines.append("  当前付费方式不支持通过该链路生成充值链接。")

    card = build_recharge_card(snapshot, amount_yuan, title="话费充值")
    workflow_patch = {
        "scenario": "recharge",
        "phase": "amount_ready" if snapshot.get("can_recharge") else "blocked",
        "entities": {
            "recharge_amount": amount,
            "recharge_amount_yuan": amount,
            "recharge_billing_mode": snapshot.get("billing_type", ""),
        },
        "flags": {
            "preview_ready": bool(snapshot.get("can_recharge")),
            "recharge_ready": bool(snapshot.get("can_recharge")),
        },
        "next_actions": ["等待用户确认或修改充值金额"] if snapshot.get("can_recharge") else ["当前链路不支持充值，请先查询账户状态或改走其他渠道"],
    }
    history_entry = {
        "kind": "preview_recharge",
        "summary": f"已生成可编辑的话费充值卡，预填金额 {amount} 元",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
