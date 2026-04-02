from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data


_CARD_TYPE_MAP = {
    "plan": "recommend_plan",
    "flow_pack": "recommend_flow_pack",
    "benefit": "recommend_benefit",
}


@tool(
    name="recommend_products",
    description="获取适合当前用户的统一推荐结果。支持按设备号和推荐模式查询套餐、流量、积分可兑、沪呗可兑产品，并返回指定排名区间的候选结果。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "device_no": {"type": "string", "description": "设备号，优先与手机号保持一致"},
            "intent": {"type": "string", "description": "用户当前意图或诉求，例如：流量不够、想升级套餐、想要权益优惠、综合推荐"},
            "recommend_mode": {"type": "string", "description": "推荐模式：套餐/流量/积分/沪呗", "enum": ["套餐", "流量", "积分", "沪呗", "plan", "flow_pack", "points", "hubei"]},
            "start_index": {"type": "integer", "description": "推荐序号起点，默认 1"},
            "count": {"type": "integer", "description": "返回数量，默认 3"},
            "product_type": {"type": "string", "description": "兼容旧参数，等价于 recommend_mode", "enum": ["all", "plan", "flow_pack", "benefit"]},
        },
        "required": ["phone"],
    },
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "allowed_scenarios": ["recommend"],
        "allowed_phases": ["intent_collected", "products_recommended", "products_compared", "completed"],
        "phase_guidance": "先做推荐，再做比较或引导预览下单",
    },
)
async def recommend_products(
    phone: str,
    device_no: str = "",
    intent: str = "",
    recommend_mode: str = "套餐",
    start_index: int = 1,
    count: int = 3,
    product_type: str = "all",
) -> ToolResult:
    phone = str(phone or device_no).strip()
    intent = str(intent).strip()
    recommend_mode = str(recommend_mode or "").strip() or str(product_type or "套餐").strip() or "套餐"
    start_index = max(int(start_index or 1), 1)
    count = max(int(count or 3), 1)

    resp = await post_eop(
        "/api/eop/eop.ProductUnifiedRecommendHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "deviceNo": phone,
                "intent": intent,
                "recommendMode": recommend_mode,
                "startIndex": start_index,
                "count": count,
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "推荐失败"))

    profile = eop.get("profile", {})
    groups = eop.get("recommendationGroups", [])
    if not groups:
        return ToolResult(text="当前没有可推荐的产品。")

    lines = [f"手机号: {phone}  当前套餐: {profile.get('currentPlan', '未知')}"]
    if intent:
        lines.append(f"  推荐意图: {intent}")
    if profile.get("recommendMode"):
        lines.append(f"  推荐模式: {profile.get('recommendMode')}")
    summary = eop.get("summary", "")
    if summary:
        lines.append(f"  推荐摘要: {summary}")

    cards = []
    candidate_product_ids = []
    for group in groups:
        group_name = group.get("groupName", "产品推荐")
        reason = group.get("recommendReason", "")
        products = group.get("products", [])
        if not products:
            continue
        enriched_products = []
        group_type = group.get("groupType", "")
        type_name = {"plan": "套餐", "flow_pack": "流量包", "benefit": "权益产品"}.get(group_type, "产品")
        for product in products:
            row = dict(product)
            product_id = row.get("productId", "")
            product_name = row.get("productName", "")
            if product_id and product_id not in candidate_product_ids:
                candidate_product_ids.append(product_id)
            row["previewMessage"] = f"我想办理产品 {product_id}（{product_name}），请先展示确认下单卡"
            row["compareMessage"] = f"请帮我对比一下{type_name} {product_id} 的同类方案"
            row["detailsMessage"] = f"请详细介绍一下产品 {product_id}（{product_name}）的资费和规则"
            enriched_products.append(row)
        product_preview = "、".join(f"{p.get('productName', '')}（{p.get('priceText', '')}）" for p in enriched_products[:3])
        lines.append(f"  {group_name}: {product_preview}")
        card = {
            "type": _CARD_TYPE_MAP.get(group.get("groupType", ""), "recommend_plan"),
            "title": group_name,
            "phone": phone,
            "reason": reason,
            "currentPlan": profile.get("currentPlan", ""),
            "currentPlanFee": profile.get("currentPlanFee", 0),
            "recommendMode": group.get("recommendMode", profile.get("recommendMode", "")),
            "rankStart": group.get("rankStart", start_index),
            "rankEnd": group.get("rankEnd", start_index + max(len(enriched_products) - 1, 0)),
            "totalAvailable": group.get("totalAvailable", len(enriched_products)),
            "items": enriched_products,
        }
        cards.append({"suffix": group.get("groupType", "group"), "card": card})

    lines.append("  如需办理其中某个产品，可直接点击卡片按钮，或直接告诉我产品名称。")
    workflow_patch = {
        "scenario": "recommend",
        "phase": "products_recommended",
        "goal": intent or "产品推荐",
        "entities": {
            "base_product_id": "",
            "candidate_product_ids": candidate_product_ids,
            "compare_product_ids": [],
            "recommend_mode": profile.get("recommendMode", recommend_mode),
            "selected_product_id": "",
            "selected_product_name": "",
            "preview_id": "",
            "duplicate_order_id": "",
            "order_id": "",
            "order_status": "",
            "pay_status": "",
        },
        "constraints": ["推荐套餐时不得推荐低于当前资费档位的低转产品"],
        "flags": {
            "has_recommendation": True,
            "has_comparison": False,
            "preview_ready": False,
            "awaiting_confirmation": False,
            "sms_code_ready": False,
            "order_submitted": False,
            "payment_confirmed": False,
        },
    }
    history_entry = {
        "kind": "recommend_products",
        "summary": f"已按{profile.get('recommendMode', recommend_mode)}模式返回{len(candidate_product_ids)}个推荐产品",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "cards": cards,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
