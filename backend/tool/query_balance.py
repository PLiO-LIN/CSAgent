"""余额查询工具
接口链路: eop.BpnbrListBySerialnbr（手机号→分账序号）+ eop.ZwzxBalanceRecord（分账序号→余额）
"""
from tool.base import tool, ToolResult
from tool.recharge_shared import load_balance_snapshot, build_recharge_card


@tool(
    name="query_balance",
    description="查询用户账户余额，包括话费余额、通用余额、专用余额、欠费金额。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
        },
        "required": ["phone"],
    },
)
async def query_balance(phone: str) -> ToolResult:
    phone = str(phone).strip()
    snapshot, error = await load_balance_snapshot(phone)
    if error:
        return ToolResult(error=error)

    lines = [f"手机号: {phone}"]
    if snapshot.get("account_name"):
        lines[0] += f"  姓名: {snapshot.get('account_name', '')}"
    lines.append(
        f"  话费余额: {snapshot.get('balance', '0.00')}元"
        + ("（欠费）" if snapshot.get("is_arrears") else "")
    )
    if snapshot.get("billing_type") or snapshot.get("fee_cycle_type"):
        lines.append(f"  付费方式: {snapshot.get('billing_type', '-')} / {snapshot.get('fee_cycle_type', '-')}")
    lines.append(f"  通用余额: {snapshot.get('balance_ty', '0.00')}元")
    lines.append(f"  专用余额: {snapshot.get('balance_zy', '0.00')}元")
    if float(snapshot.get("arrears_yuan", 0) or 0) > 0:
        lines.append(f"  欠费金额: {snapshot.get('arrears', '0.00')}元")
        if snapshot.get("can_recharge"):
            lines.append("  已为您准备可编辑的充值卡，您可以直接修改金额后继续办理。")
        else:
            lines.append("  当前付费方式不支持通过该链路继续充值，已为您展示当前账户与金额信息。")

    card = {
        "type": "balance",
        "title": "账户余额",
        "phone": phone,
        "accountName": snapshot.get("account_name", ""),
        "balance": snapshot.get("balance", "0.00"),
        "balanceTY": snapshot.get("balance_ty", "0.00"),
        "balanceZY": snapshot.get("balance_zy", "0.00"),
        "arrears": snapshot.get("arrears", "0.00"),
        "isArrears": bool(snapshot.get("is_arrears")),
        "billingType": snapshot.get("billing_type", ""),
        "feeCycleType": snapshot.get("fee_cycle_type", ""),
    }
    metadata = {"card": card}
    if float(snapshot.get("arrears_yuan", 0) or 0) > 0:
        metadata["cards"] = [build_recharge_card(snapshot)]
    return ToolResult(text="\n".join(lines), metadata=metadata)
