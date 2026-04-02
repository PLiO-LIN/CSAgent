from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data


@tool(
    name="confirm_order_payment",
    description="在用户完成外部支付后确认订单支付状态，并返回订单是否已生效。需要用户手机号和订单号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "order_id": {"type": "string", "description": "订单号，例如 OD202603301230000123"},
        },
        "required": ["phone", "order_id"],
    },
    policy={
        "risk_level": "medium",
        "confirm_policy": "never",
        "allowed_scenarios": ["order"],
        "allowed_phases": ["awaiting_payment", "order_submitted", "payment_confirmed", "orders_queried", "intent_collected"],
        "required_entities": ["order_id"],
        "idempotency_key_fields": ["phone", "order_id"],
        "phase_guidance": "仅在已有订单且用户已支付或需要核验支付结果时使用",
    },
)
async def confirm_order_payment(phone: str, order_id: str) -> ToolResult:
    phone = str(phone).strip()
    order_id = str(order_id).strip()

    resp = await post_eop(
        "/api/eop/eop.OrderPayConfirmHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "orderId": order_id,
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "支付确认失败"))

    order = eop.get("order", {})
    result = eop.get("paymentResult", {})
    lines = [f"手机号: {phone}  订单号: {order.get('orderId', order_id)}"]
    lines.append(f"  产品: {order.get('productName', '')}")
    lines.append(f"  支付状态: {result.get('payStatusText', order.get('payStatusText', ''))}")
    lines.append(f"  订单状态: {order.get('statusText', '')}")
    if result.get("paidAt"):
        lines.append(f"  支付时间: {result.get('paidAt')}")
    if order.get("effectiveTime"):
        lines.append(f"  生效时间: {order.get('effectiveTime')}")

    card = {
        "type": "payment_result",
        "title": "支付结果",
        "phone": phone,
        "order": order,
        "paymentResult": result,
        "actions": [
            {"label": "查询订单状态", "message": f"请查询订单 {order.get('orderId', order_id)} 的状态"},
        ],
    }
    workflow_patch = {
        "scenario": "order",
        "phase": "payment_confirmed" if (result.get("payStatus") or order.get("payStatus")) == "PAID" else "awaiting_payment",
        "entities": {
            "order_id": order.get("orderId", order_id),
            "selected_product_id": order.get("productId", ""),
            "selected_product_name": order.get("productName", ""),
            "order_status": order.get("status", "") or order.get("statusText", ""),
            "pay_status": result.get("payStatus", "") or order.get("payStatus", "") or result.get("payStatusText", ""),
        },
        "flags": {
            "payment_confirmed": (result.get("payStatus") or order.get("payStatus")) == "PAID",
        },
    }
    history_entry = {
        "kind": "confirm_order_payment",
        "summary": f"已确认订单 {order.get('orderId', order_id)} 支付状态",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
