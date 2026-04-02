from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data


@tool(
    name="compare_products",
    description="对推荐产品做横向对比，适用于用户想比较同类套餐、流量包或权益产品差异时。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "base_product_id": {"type": "string", "description": "当前重点关注的产品ID，例如 plan_fusion_229"},
            "product_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "需要一起对比的产品ID列表，可留空让系统自动补齐同类产品",
            },
            "product_type": {
                "type": "string",
                "description": "产品类型：plan/flow_pack/benefit",
                "enum": ["plan", "flow_pack", "benefit"],
            },
        },
        "required": ["phone"],
    },
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "allowed_scenarios": ["recommend"],
        "allowed_phases": ["products_recommended", "products_compared", "intent_collected"],
        "phase_guidance": "仅在已有推荐候选集后再对比，避免无目标比较",
    },
)
async def compare_products(phone: str, base_product_id: str = "", product_ids: list[str] | None = None, product_type: str = "") -> ToolResult:
    phone = str(phone).strip()
    base_product_id = str(base_product_id or "").strip()
    product_type = str(product_type or "").strip()
    product_ids = [str(p).strip() for p in (product_ids or []) if str(p).strip()]

    resp = await post_eop(
        "/api/eop/eop.ProductCompareHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "baseProductId": base_product_id,
                "productIds": product_ids,
                "productType": product_type,
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") != "0":
        return ToolResult(error=eop.get("message", "产品对比失败"))

    compare_type = eop.get("compareType", "plan")
    type_name = {"plan": "套餐", "flow_pack": "流量包", "benefit": "权益产品"}.get(compare_type, "产品")
    items = []
    compare_product_ids = []
    for item in eop.get("compareItems", []):
        row = dict(item)
        product_id = row.get("productId", "")
        product_name = row.get("productName", "")
        if product_id and product_id not in compare_product_ids:
            compare_product_ids.append(product_id)
        row["previewMessage"] = f"我想办理产品 {product_id}（{product_name}），请先展示确认下单卡"
        row["detailsMessage"] = f"请详细介绍一下产品 {product_id}（{product_name}）的资费和规则"
        row["compareMessage"] = f"请继续帮我比较这个{type_name}与当前其他推荐的差异"
        items.append(row)
    if not items:
        return ToolResult(text="当前没有可对比的产品。")

    lines = [f"手机号: {phone}  已为您整理{len(items)}个产品的横向对比"]
    if eop.get("summary"):
        lines.append(f"  对比摘要: {eop.get('summary')}")
    for item in items:
        marker = "[当前关注]" if item.get("selected") else ""
        lines.append(f"  {marker}{item.get('productName', '')}  {item.get('priceText', '')}")
    lines.append("  您可以直接在对比卡片里选择想办理的产品。")

    card = {
        "type": "product_compare",
        "title": "产品对比",
        "phone": phone,
        "compareType": compare_type,
        "summary": eop.get("summary", ""),
        "currentPlan": eop.get("profile", {}).get("currentPlan", ""),
        "currentPlanFee": eop.get("profile", {}).get("currentPlanFee", 0),
        "baseProductId": eop.get("baseProductId", ""),
        "items": items,
    }
    workflow_patch = {
        "scenario": "recommend",
        "phase": "products_compared",
        "entities": {
            "base_product_id": eop.get("baseProductId", "") or base_product_id,
            "compare_product_ids": compare_product_ids,
            "candidate_product_ids": compare_product_ids,
        },
        "flags": {
            "has_comparison": True,
        },
    }
    history_entry = {
        "kind": "compare_products",
        "summary": f"已对比{len(compare_product_ids)}个{type_name}",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "card": card,
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )
