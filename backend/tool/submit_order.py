from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data
from tool.order_shared import summarize_restrictions


@tool(
    name="submit_order",
    description="为用户正式提交产品订单。仅能在验证码卡片确认后使用，需要手机号、产品ID、验证码会话和验证码。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "product_id": {"type": "string", "description": "产品ID，例如 plan_fusion_229、flow_20g_month、benefit_video_29"},
            "pay_mode": {"type": "string", "description": "支付方式，默认在线支付", "enum": ["在线支付", "话费账户支付"]},
            "preview_id": {"type": "string", "description": "下单预览ID"},
            "verification_seq": {"type": "string", "description": "验证码会话ID"},
            "sms_code": {"type": "string", "description": "短信验证码"},
        },
        "required": ["phone", "product_id"],
    },
    policy={
        "risk_level": "high",
        "confirm_policy": "never",
        "allowed_scenarios": ["order"],
        "allowed_phases": ["sms_code_ready", "orders_queried", "existing_order_found"],
        "required_entities": ["selected_product_id", "verification_seq"],
        "idempotency_key_fields": ["phone", "product_id", "pay_mode", "verification_seq"],
        "external_side_effect": True,
        "phase_guidance": "只有在验证码卡片确认后才能正式提交订单",
    },
)
async def submit_order(
    phone: str,
    product_id: str,
    pay_mode: str = "在线支付",
    preview_id: str = "",
    verification_seq: str = "",
    sms_code: str = "",
) -> ToolResult:
    phone = str(phone).strip()
    product_id = str(product_id).strip()
    pay_mode = str(pay_mode or "在线支付").strip() or "在线支付"
    preview_id = str(preview_id or "").strip()
    verification_seq = str(verification_seq or "").strip()
    sms_code = str(sms_code or "").strip()

    resp = await post_eop(
        "/api/eop/eop.OrderSubmitHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "productId": product_id,
                "payMode": pay_mode,
                "previewId": preview_id,
                "verificationSeq": verification_seq,
                "smsCode": sms_code,
                "sourceScene": "AI下单",
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") == "2":
        summary = summarize_restrictions(eop)
        return ToolResult(
            text=f"手机号: {phone}\n  限制结论: {summary}",
            metadata={
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "blocked",
                    "entities": {
                        "selected_product_id": product_id,
                        "restriction_summary": summary,
                    },
                    "constraints": [str(item.get("label", "")).strip() for item in eop.get("restrictionItems", []) if item.get("blocked")],
                    "requires_human_handoff": True,
                    "service_channel": "营业厅/客户经理",
                },
                "workflow_history": {
                    "kind": "submit_order",
                    "summary": summary,
                },
            },
        )
    if eop.get("code") in {"4", "5"}:
        message = eop.get("message", "下单失败")
        return ToolResult(
            text=f"手机号: {phone}\n  说明: {message}",
            metadata={
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "sms_code_ready",
                    "entities": {
                        "selected_product_id": product_id,
                        "preview_id": preview_id,
                        "pay_mode": pay_mode,
                        "verification_seq": verification_seq,
                    },
                    "flags": {
                        "preview_ready": True,
                        "sms_code_ready": True,
                    },
                    "next_actions": ["请重新核对验证码后，再点击卡片确认下单"],
                },
                "workflow_history": {
                    "kind": "submit_order",
                    "summary": message,
                },
            },
        )
    if eop.get("code") == "6":
        order = eop.get("order", {})
        message = eop.get("message", "该产品已有已生效订单")
        return ToolResult(
            text=f"手机号: {phone}\n  说明: {message}\n  订单号: {order.get('orderId', '')}",
            metadata={
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "completed",
                    "entities": {
                        "selected_product_id": product_id,
                        "selected_product_name": order.get("productName", product_id),
                        "order_id": order.get("orderId", ""),
                        "order_status": order.get("status", "") or order.get("statusText", ""),
                        "pay_status": order.get("payStatus", "") or order.get("payStatusText", ""),
                    },
                    "flags": {
                        "preview_ready": True,
                        "sms_code_ready": False,
                        "order_submitted": True,
                        "payment_confirmed": True,
                    },
                    "next_actions": ["如有需要可继续查询这笔已生效订单"],
                },
                "workflow_history": {
                    "kind": "submit_order",
                    "summary": message,
                },
            },
        )
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "下单失败"))

    order = eop.get("order", {})
    payment = eop.get("payment", {})
    duplicate = bool(eop.get("duplicate", False))
    amount = order.get("amountFen", 0) / 100

    lines = [f"手机号: {phone}  产品: {order.get('productName', product_id)}"]
    lines.append(f"  订单号: {order.get('orderId', '')}")
    lines.append(f"  金额: {amount:.2f}元")
    lines.append(f"  状态: {order.get('statusText', '')} / {order.get('payStatusText', '')}")
    if order.get("payBefore"):
        lines.append(f"  支付截止: {order.get('payBefore', '')}")
    if duplicate:
        lines.append("  系统检测到该产品已有可继续处理的订单，已为您返回现有支付信息。")
    else:
        lines.append("  订单已创建，请尽快完成支付，支付成功后将按产品规则生效。")

    card = {
        "type": "payment",
        "title": "下单支付",
        "phone": phone,
        "duplicate": duplicate,
        "order": order,
        "payment": payment,
        "actions": [
            {"label": "我已完成支付", "message": f"我已经完成订单 {order.get('orderId', '')} 的支付，请帮我确认支付结果"},
            {"label": "查询订单状态", "message": f"请查询订单 {order.get('orderId', '')} 的状态"},
        ],
    }
    workflow_patch = {
        "scenario": "order",
        "phase": "awaiting_payment" if order.get("payStatus") == "PENDING" else "order_submitted",
        "entities": {
            "selected_product_id": product_id,
            "selected_product_name": order.get("productName", product_id),
            "pay_mode": pay_mode,
            "preview_id": preview_id,
            "verification_seq": eop.get("verificationSeq", verification_seq),
            "order_id": order.get("orderId", ""),
            "order_status": order.get("status", "") or order.get("statusText", ""),
            "pay_status": order.get("payStatus", "") or order.get("payStatusText", ""),
            "duplicate_order_id": order.get("orderId", "") if duplicate else "",
        },
        "flags": {
            "preview_ready": True,
            "awaiting_confirmation": False,
            "sms_code_ready": False,
            "order_submitted": True,
            "payment_confirmed": order.get("payStatus") == "PAID",
        },
    }
    history_entry = {
        "kind": "submit_order",
        "summary": f"已提交产品 {order.get('productName', product_id)} 订单 {order.get('orderId', '')}",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
