from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data
from tool.order_shared import summarize_restrictions


@tool(
    name="preview_order",
    description="预览指定产品的下单确认信息，在正式提交订单前用于确认资费、支付方式和生效规则。需要用户手机号和产品ID。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "product_id": {"type": "string", "description": "产品ID，例如 plan_fusion_229、flow_20g_month、benefit_video_29"},
            "pay_mode": {"type": "string", "description": "支付方式，默认在线支付", "enum": ["在线支付", "话费账户支付"]},
        },
        "required": ["phone", "product_id"],
    },
    policy={
        "risk_level": "medium",
        "confirm_policy": "never",
        "allowed_scenarios": ["recommend", "order"],
        "allowed_phases": ["products_recommended", "products_compared", "product_selected", "intent_collected", "preview_ready", "existing_order_found"],
        "required_entities": ["selected_product_id"],
        "idempotency_key_fields": ["phone", "product_id", "pay_mode"],
        "phase_guidance": "先展示预览确认卡，再进入正式下单",
    },
)
async def preview_order(phone: str, product_id: str, pay_mode: str = "在线支付") -> ToolResult:
    phone = str(phone).strip()
    product_id = str(product_id).strip()
    pay_mode = str(pay_mode or "在线支付").strip() or "在线支付"

    resp = await post_eop(
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

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") == "2":
        summary = summarize_restrictions(eop)
        lines = [f"手机号: {phone}"]
        lines.append(f"  限制结论: {summary}")
        return ToolResult(
            text="\n".join(lines),
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
                    "next_actions": ["当前设备存在订购限制，暂不继续下单"],
                },
                "workflow_history": {
                    "kind": "preview_order",
                    "summary": summary,
                },
            },
        )
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "下单预览失败"))

    product = eop.get("product", {})
    duplicate = eop.get("duplicateOrder") or {}
    lines = [f"手机号: {phone}  产品: {product.get('productName', product_id)}"]
    lines.append(f"  资费: {product.get('priceText', '')}")
    lines.append(f"  支付方式: {eop.get('payMode', pay_mode)}")
    if eop.get("summary"):
        lines.append(f"  说明: {eop.get('summary')}")
    if eop.get("restrictionSummary"):
        lines.append(f"  限制校验: {eop.get('restrictionSummary')}")
    if duplicate:
        lines.append(f"  已存在订单: {duplicate.get('orderId', '')}（{duplicate.get('statusText', '')}/{duplicate.get('payStatusText', '')}）")
    else:
        lines.append("  如确认无误，请先获取验证码，再在卡片中确认下单。")

    card = {
        "type": "order_preview",
        "title": "下单确认",
        "phone": phone,
        "previewId": eop.get("previewId", ""),
        "payMode": eop.get("payMode", pay_mode),
        "payModeOptions": eop.get("payModeOptions", []),
        "summary": eop.get("summary", ""),
        "tips": eop.get("tips", []),
        "product": product,
        "duplicateOrder": duplicate,
        "restrictionSummary": eop.get("restrictionSummary", ""),
        "restrictionItems": eop.get("restrictionItems", []),
    }
    workflow_patch = {
        "scenario": "order",
        "phase": "preview_ready" if not duplicate else "existing_order_found",
        "entities": {
            "selected_product_id": product.get("productId", product_id),
            "selected_product_name": product.get("productName", ""),
            "preview_id": eop.get("previewId", ""),
            "pay_mode": eop.get("payMode", pay_mode),
            "restriction_summary": eop.get("restrictionSummary", ""),
            "duplicate_order_id": duplicate.get("orderId", ""),
            "order_id": duplicate.get("orderId", ""),
            "order_status": duplicate.get("status", "") or duplicate.get("statusText", ""),
            "pay_status": duplicate.get("payStatus", "") or duplicate.get("payStatusText", ""),
        },
        "flags": {
            "preview_ready": True,
            "sms_code_ready": False,
            "awaiting_confirmation": False,
        },
    }
    history_entry = {
        "kind": "preview_order",
        "summary": f"已生成产品 {product.get('productName', product_id)} 的下单预览",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
