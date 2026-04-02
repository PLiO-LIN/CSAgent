from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data
from tool.order_shared import build_order_verification_card, summarize_restrictions


@tool(
    name="request_order_sms_code",
    description="为当前待订购产品获取短信验证码，并返回验证码输入确认卡。仅在下单预览后使用。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "product_id": {"type": "string", "description": "产品ID"},
            "preview_id": {"type": "string", "description": "下单预览ID"},
            "pay_mode": {"type": "string", "description": "支付方式", "enum": ["在线支付", "话费账户支付"]},
            "sms_code": {"type": "string", "description": "可选，用户已在对话中提供的验证码，用于预填卡片"},
        },
        "required": ["phone", "product_id"],
    },
    policy={
        "risk_level": "medium",
        "confirm_policy": "never",
        "allowed_scenarios": ["order"],
        "allowed_phases": ["preview_ready", "existing_order_found", "orders_queried"],
        "required_entities": ["selected_product_id"],
        "idempotency_key_fields": ["phone", "product_id", "pay_mode"],
        "phase_guidance": "先完成下单预览，再获取验证码并返回验证码确认卡。",
    },
)
async def request_order_sms_code(
    phone: str,
    product_id: str,
    preview_id: str = "",
    pay_mode: str = "在线支付",
    sms_code: str = "",
) -> ToolResult:
    phone = str(phone).strip()
    product_id = str(product_id).strip()
    preview_id = str(preview_id).strip()
    pay_mode = str(pay_mode or "在线支付").strip() or "在线支付"
    sms_code = str(sms_code or "").strip()

    preview_resp = await post_eop(
        "/api/eop/eop.OrderPreviewHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "productId": product_id,
                "payMode": pay_mode,
            },
        },
    )
    preview_root = response_root(preview_resp)
    if preview_root.get("resCode") != "0000":
        return ToolResult(error=preview_root.get("resMsg") or "接口请求失败")
    preview_eop = extract_eop_data(preview_resp)
    if preview_eop.get("code") == "2":
        summary = summarize_restrictions(preview_eop)
        return ToolResult(
            text=f"手机号: {phone}\n  限制结论: {summary}",
            metadata={
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "blocked",
                    "entities": {"restriction_summary": summary},
                    "constraints": [str(item.get("label", "")).strip() for item in preview_eop.get("restrictionItems", []) if item.get("blocked")],
                    "next_actions": ["当前设备受限，暂不继续下单"],
                    "requires_human_handoff": True,
                    "service_channel": "营业厅/客户经理",
                },
                "workflow_history": {
                    "kind": "request_order_sms_code",
                    "summary": summary,
                },
            },
        )
    if preview_eop.get("code") != "0":
        return ToolResult(error=preview_eop.get("message", "下单预览失败"))

    product = preview_eop.get("product", {})

    resp = await post_eop(
        "/api/eop/eop.OrderSmsCodeHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "productId": product_id,
                "previewId": preview_id or preview_eop.get("previewId", ""),
                "payMode": pay_mode,
            },
        },
    )
    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")
    eop = extract_eop_data(resp)

    if eop.get("code") == "3":
        duplicate = eop.get("duplicateOrder") or {}
        order_id = duplicate.get("orderId", "")
        lines = [f"手机号: {phone}"]
        lines.append(f"  已存在待支付订单: {order_id}")
        lines.append("  当前无需重新获取验证码，请优先继续处理已有订单支付。")
        card = {
            "type": "payment",
            "title": "继续已有支付",
            "phone": phone,
            "duplicate": True,
            "order": duplicate,
            "payment": {
                "payMode": pay_mode,
                "payUrl": f"https://pay.mock.189.cn/order/{order_id}",
                "payBefore": duplicate.get("payBefore", ""),
            },
            "actions": [
                {"label": "我已完成支付", "message": f"我已经完成订单 {order_id} 的支付，请帮我确认支付结果"},
                {"label": "查询订单状态", "message": f"请查询订单 {order_id} 的状态"},
            ],
        }
        return ToolResult(
            text="\n".join(lines),
            metadata={
                "card": card,
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "awaiting_payment",
                    "entities": {
                        "order_id": order_id,
                        "selected_product_id": duplicate.get("productId", product_id),
                        "selected_product_name": duplicate.get("productName", product.get("productName", "")),
                        "pay_mode": pay_mode,
                        "order_status": duplicate.get("status", "") or duplicate.get("statusText", ""),
                        "pay_status": duplicate.get("payStatus", "") or duplicate.get("payStatusText", ""),
                    },
                    "flags": {
                        "preview_ready": True,
                        "sms_code_ready": False,
                    },
                },
                "workflow_history": {
                    "kind": "request_order_sms_code",
                    "summary": f"发现待支付订单 {order_id}，转为继续支付",
                },
            },
        )

    if eop.get("code") == "6":
        duplicate = eop.get("duplicateOrder") or {}
        order_id = duplicate.get("orderId", "")
        lines = [f"手机号: {phone}"]
        lines.append(f"  当前产品已有生效订单: {order_id}")
        lines.append("  无需重复获取验证码或再次下单，如需核对状态可直接查询订单。")
        return ToolResult(
            text="\n".join(lines),
            metadata={
                "workflow_patch": {
                    "scenario": "order",
                    "phase": "completed",
                    "entities": {
                        "order_id": order_id,
                        "selected_product_id": duplicate.get("productId", product_id),
                        "selected_product_name": duplicate.get("productName", product.get("productName", "")),
                        "order_status": duplicate.get("status", "") or duplicate.get("statusText", ""),
                        "pay_status": duplicate.get("payStatus", "") or duplicate.get("payStatusText", ""),
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
                    "kind": "request_order_sms_code",
                    "summary": f"产品 {product.get('productName', product_id)} 已存在生效订单",
                },
            },
        )

    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "验证码发送失败"))

    verification_seq = eop.get("verificationSeq", "")
    preview_id_value = eop.get("previewId", preview_id or preview_eop.get("previewId", ""))
    debug_sms_code = str(eop.get("debugSmsCode", "") or "").strip()
    tips = [
        "请输入短信验证码后，再点击卡片上的确认按钮。",
        "最终提交订单仅接受卡片按钮确认，不接受自然语言直接确认。",
    ]
    if debug_sms_code:
        tips.append(f"当前为 mock 环境，调试验证码：{debug_sms_code}")
    card = build_order_verification_card(
        phone=phone,
        product=product,
        preview_id=preview_id_value,
        verification_seq=verification_seq,
        pay_mode=eop.get("payMode", pay_mode),
        masked_target=str(eop.get("maskedTarget", "") or "").strip(),
        sms_code=sms_code,
        summary="验证码已发送，请在卡片中填写并确认下单。",
        tips=tips,
    )

    product_name = product.get("productName", product_id)
    lines = [f"手机号: {phone}  产品: {product_name}"]
    if eop.get("maskedTarget"):
        lines.append(f"  验证码发送至: {eop.get('maskedTarget')}")
    lines.append("  请在卡片中填写验证码后，点击确认下单。")

    workflow_patch = {
        "scenario": "order",
        "phase": "sms_code_ready",
        "entities": {
            "selected_product_id": product.get("productId", product_id),
            "selected_product_name": product.get("productName", ""),
            "preview_id": preview_id_value,
            "pay_mode": eop.get("payMode", pay_mode),
            "verification_seq": verification_seq,
        },
        "flags": {
            "preview_ready": True,
            "sms_code_ready": True,
            "awaiting_confirmation": False,
        },
        "next_actions": ["等待用户在验证码卡片中点击确认下单"],
    }
    history_entry = {
        "kind": "request_order_sms_code",
        "summary": f"已为产品 {product_name} 获取下单验证码",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
