from api.eop import extract_eop_data, post_eop, response_root


async def load_order_restrictions(phone: str) -> tuple[dict, str]:
    phone = str(phone or "").strip()
    wrapped_body = {
        "type": "ssl",
        "key": "eop.AssetInfoByServiceIdSalHttps",
        "param": {
            "headers": {"opt_tye": "01"},
            "spiParam": {"serviceId": phone, "deviceNo": phone, "accNum": phone},
        },
    }
    resp = await post_eop("/api/eop/requestOpenApi", wrapped_body)
    root = response_root(resp)
    if root.get("resCode") != "0000":
        return {}, root.get("resMsg") or "接口请求失败"
    eop = extract_eop_data(resp)
    if not eop:
        direct_resp = await post_eop(
            "/api/eop/eop.AssetInfoByServiceIdSalHttps/requestEop",
            {
                "headers": {"opt_tye": "01"},
                "spiParam": {"serviceId": phone, "deviceNo": phone, "accNum": phone},
            },
        )
        direct_root = response_root(direct_resp)
        if direct_root.get("resCode") != "0000":
            return {}, direct_root.get("resMsg") or "接口请求失败"
        eop = extract_eop_data(direct_resp)
    if str(eop.get("code", "0") or "0") != "0":
        return {}, eop.get("message", "限制校验失败")
    return _normalize_restriction_payload(eop), ""


def _normalize_restriction_payload(payload: dict) -> dict:
    items = payload.get("restrictionItems", []) if isinstance(payload.get("restrictionItems"), list) else []
    normalized_items = []
    if items:
        for item in items:
            normalized_items.append(
                {
                    "code": str(item.get("code", "") or "").strip(),
                    "label": str(item.get("label", "") or item.get("assetName", "") or "").strip(),
                    "blocked": bool(item.get("blocked")),
                    "warning": bool(item.get("warning")) or bool(item.get("blocked")),
                    "detail": str(item.get("detail", "") or item.get("resultMsg", "") or "").strip(),
                }
            )
    else:
        for item in payload.get("assetInfoList", []) if isinstance(payload.get("assetInfoList"), list) else []:
            result_flag = str(item.get("resultFlag", "") or "").strip()
            blocked = bool(item.get("blocked")) or result_flag == "1"
            warning = bool(item.get("warning")) or blocked or result_flag == "2"
            normalized_items.append(
                {
                    "code": str(item.get("assetCode", "") or item.get("code", "") or "").strip(),
                    "label": str(item.get("assetName", "") or item.get("label", "") or "").strip(),
                    "blocked": blocked,
                    "warning": warning,
                    "detail": str(item.get("resultMsg", "") or item.get("detail", "") or "").strip(),
                }
            )
    blocked_labels = [str(item.get("label", "")).strip() for item in normalized_items if item.get("blocked")]
    summary = str(payload.get("summary", "") or "").strip()
    can_order = payload.get("canOrder")
    if can_order is None:
        can_order = not blocked_labels
    if not summary:
        summary = "当前设备未命中订购限制，可继续办理。" if can_order else f"当前设备存在订购限制：{'、'.join(item for item in blocked_labels if item)}"
    return {
        "code": str(payload.get("code", "0") or "0"),
        "message": str(payload.get("message", "成功") or "成功"),
        "billingType": str(payload.get("billingType", "") or "").strip(),
        "feeCycleType": str(payload.get("feeCycleType", "") or "").strip(),
        "customerType": str(payload.get("customerType", "") or "").strip(),
        "canOrder": bool(can_order),
        "summary": summary,
        "restrictionItems": normalized_items,
        "assetInfoList": payload.get("assetInfoList", []) if isinstance(payload.get("assetInfoList"), list) else [],
    }


def summarize_restrictions(payload: dict) -> str:
    items = payload.get("restrictionItems", []) if isinstance(payload.get("restrictionItems"), list) else []
    blocked = [str(item.get("label", "")).strip() for item in items if item.get("blocked")]
    warnings = [str(item.get("label", "")).strip() for item in items if item.get("warning") and not item.get("blocked")]
    if blocked:
        return f"当前设备存在订购限制：{'、'.join(item for item in blocked if item)}，暂不支持继续在线订购。"
    if warnings:
        return f"当前设备存在限制提醒：{'、'.join(item for item in warnings if item)}，下单前请先确认业务规则。"
    return str(payload.get("summary", "") or "当前设备未命中订购限制，可继续办理。")


def build_order_verification_card(
    *,
    phone: str,
    product: dict,
    preview_id: str,
    verification_seq: str,
    pay_mode: str,
    masked_target: str = "",
    sms_code: str = "",
    summary: str = "",
    tips: list[str] | None = None,
) -> dict:
    return {
        "type": "order_verify",
        "title": "验证码确认下单",
        "phone": phone,
        "previewId": preview_id,
        "verificationSeq": verification_seq,
        "payMode": pay_mode,
        "maskedTarget": masked_target,
        "summary": summary,
        "tips": list(tips or []),
        "product": dict(product or {}),
        "smsCode": str(sms_code or "").strip(),
    }
