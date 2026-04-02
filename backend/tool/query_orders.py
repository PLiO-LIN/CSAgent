from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data


@tool(
    name="query_orders",
    description="查询用户当前订单，包括待支付、已生效、已取消等订单状态。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "order_id": {"type": "string", "description": "可选，指定订单号后只查询该订单"},
            "status": {
                "type": "string",
                "description": "订单状态筛选：all/PENDING_PAYMENT/ACTIVE/CANCELLED",
                "enum": ["all", "PENDING_PAYMENT", "ACTIVE", "CANCELLED"],
            },
        },
        "required": ["phone"],
    },
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "allowed_scenarios": ["order"],
        "allowed_phases": ["intent_collected", "existing_order_found", "order_submitted", "awaiting_payment", "payment_confirmed", "orders_queried", "completed"],
        "phase_guidance": "优先用于查询当前订单闭环状态，再决定继续支付、确认支付或结束",
    },
)
async def query_orders(phone: str, status: str = "all", order_id: str = "") -> ToolResult:
    phone = str(phone).strip()
    status = str(status or "all").strip() or "all"
    order_id = str(order_id or "").strip()

    resp = await post_eop(
        "/api/eop/eop.OrderListHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "status": status,
                "orderId": order_id,
                "pageNo": 1,
                "pageSize": 10,
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "查询订单失败"))

    orders = eop.get("orders", [])
    card_items = []
    for item in orders:
        row = dict(item)
        order_no = row.get("orderId", "")
        product_id = row.get("productId", "")
        row["queryMessage"] = f"请查询订单 {order_no} 的状态"
        if row.get("payStatus") == "PENDING":
            row["confirmPayMessage"] = f"我已经完成订单 {order_no} 的支付，请帮我确认支付结果"
            row["continuePayMessage"] = f"请为我继续支付产品 {product_id}，如果已存在待支付订单请直接返回该订单的支付信息"
        card_items.append(row)
    summary = eop.get("summary", {})
    headline = f"手机号: {phone}  当前订单共{summary.get('total', len(orders))}笔"
    if order_id:
        headline = f"手机号: {phone}  订单 {order_id} 查询结果共{summary.get('total', len(orders))}笔"
    lines = [headline]
    if summary:
        lines.append(
            f"  待支付{summary.get('pendingPayment', 0)}笔 / 已生效{summary.get('active', 0)}笔 / 已取消{summary.get('cancelled', 0)}笔"
        )
    if not orders:
        lines.append("  当前没有相关订单记录。")
    else:
        for item in orders[:5]:
            amount = item.get("amountFen", 0) / 100
            lines.append(
                f"  {item.get('orderId', '')}: {item.get('productName', '')}  {amount:.2f}元  {item.get('statusText', '')}/{item.get('payStatusText', '')}"
            )

    card = {
        "type": "order_list",
        "title": "当前订单",
        "phone": phone,
        "summary": summary,
        "items": card_items,
    }
    primary = orders[0] if orders else {}
    workflow_patch = {
        "scenario": "order",
        "phase": "orders_queried",
        "entities": {
            "order_id": primary.get("orderId", order_id),
            "selected_product_id": primary.get("productId", ""),
            "selected_product_name": primary.get("productName", ""),
            "order_status": primary.get("status", "") or primary.get("statusText", ""),
            "pay_status": primary.get("payStatus", "") or primary.get("payStatusText", ""),
        },
    }
    history_target = order_id or primary.get("orderId", "") or "当前订单"
    history_entry = {
        "kind": "query_orders",
        "summary": f"已查询{history_target}",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
