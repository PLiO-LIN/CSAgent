from tool.base import tool, ToolResult
from api.eop import post_eop, response_root, extract_eop_data
from tool.recharge_shared import amount_text, load_balance_snapshot, normalize_amount_yuan


@tool(
    name="create_recharge_link",
    description="根据确认后的充值金额生成充值链接，并返回当前付费方式信息。预付费用户不支持通过该链路继续充值。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "amount_yuan": {"type": "number", "description": "充值金额（元）"},
        },
        "required": ["phone", "amount_yuan"],
    },
    policy={
        "risk_level": "medium",
        "confirm_policy": "never",
        "allowed_scenarios": ["recharge", "query"],
        "allowed_phases": ["intent_collected", "amount_ready"],
        "phase_guidance": "仅在用户已经确认充值金额后再生成充值链接。",
    },
)
async def create_recharge_link(phone: str, amount_yuan: float) -> ToolResult:
    phone = str(phone).strip()
    amount = normalize_amount_yuan(amount_yuan)
    if amount <= 0:
        return ToolResult(error="充值金额需大于 0")

    snapshot, error = await load_balance_snapshot(phone)
    if error:
        return ToolResult(error=error)

    resp = await post_eop(
        "/api/eop/requestOpenApiAes",
        {
            "type": "ssl",
            "key": "eop.RechargeLinkHttps",
            "param": {
                "headers": {"opt_tye": "01"},
                "spiParam": {
                    "deviceNo": phone,
                    "amountYuan": amount,
                },
            },
        },
    )
    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")
    eop = extract_eop_data(resp)

    billing_type = str(eop.get("billingType", snapshot.get("billing_type", "")) or "").strip()
    fee_cycle_type = str(eop.get("feeCycleType", snapshot.get("fee_cycle_type", "")) or "").strip()
    payment_mode = str(eop.get("paymentMode", "") or "").strip()
    link = str(eop.get("rechargeUrl", "") or "").strip()
    mall_path = str(eop.get("mallPath", "") or "").strip()
    sso_token = str(eop.get("ssoToken", "") or "").strip()
    amount_text_value = amount_text(amount)

    if eop.get("code") != "0":
        text = f"手机号: {phone}\n  付费方式: {billing_type or '-'} / {fee_cycle_type or '-'}\n  说明: {eop.get('message', '当前链路暂不支持生成充值链接')}"
        return ToolResult(
            text=text,
            metadata={
                "workflow_patch": {
                    "scenario": "recharge",
                    "phase": "blocked",
                    "entities": {
                        "recharge_amount": amount_text_value,
                        "recharge_amount_yuan": amount_text_value,
                        "recharge_billing_mode": billing_type,
                    },
                    "next_actions": ["当前链路不支持充值，请改走其他渠道或继续查询账户状态"],
                },
                "workflow_history": {
                    "kind": "create_recharge_link",
                    "summary": eop.get("message", "充值链接生成失败"),
                },
            },
        )

    if mall_path or sso_token:
        emall_resp = await post_eop(
            "/api/sso/emall",
            {
                "phone": phone,
                "token": sso_token,
                "path": mall_path,
                "amountYuan": amount,
            },
        )
        link = _extract_emall_link(emall_resp) or link

    lines = [f"手机号: {phone}"]
    lines.append(f"  充值金额: {amount_text_value}元")
    lines.append(f"  付费方式: {billing_type or '-'} / {fee_cycle_type or '-'}")
    if payment_mode:
        lines.append(f"  支付渠道: {payment_mode}")
    if link:
        lines.append(f"  充值链接: {link}")
    lines.append("  请点击链接后在外部页面完成充值。")

    workflow_patch = {
        "scenario": "recharge",
        "phase": "link_ready",
        "entities": {
            "recharge_amount": amount_text_value,
            "recharge_amount_yuan": amount_text_value,
            "recharge_link": link,
            "recharge_billing_mode": billing_type,
        },
        "flags": {
            "recharge_ready": True,
        },
        "next_actions": ["提醒用户点击充值链接", "完成充值后如有需要可继续查询余额"],
    }
    history_entry = {
        "kind": "create_recharge_link",
        "summary": f"已生成 {amount_text_value} 元充值链接",
    }
    return ToolResult(
        text="\n".join(lines),
        metadata={
            "workflow_patch": workflow_patch,
            "workflow_history": history_entry,
        },
    )


def _extract_emall_link(payload: dict) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return str(payload.get("loginUrl", "") or data.get("loginUrl", "") or "").strip()
