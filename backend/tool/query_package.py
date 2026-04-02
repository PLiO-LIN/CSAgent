"""套餐用量查询工具
接口: eop.ZwzxPackageRecord（通过手机号+月份查询套餐用量）
"""
from datetime import datetime
import json
from tool.base import tool, ToolResult
from api.eop import post_eop, extract_eop_data, response_root


@tool(
    name="query_package",
    description="查询用户的套餐使用情况，包括流量、通话、短信剩余量。需要用户手机号和账期月份。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号，如 18018609133"},
            "month": {"type": "string", "description": "账期月份，格式 YYYYMM，如 202501"},
        },
        "required": ["phone"],
    },
)
async def query_package(phone: str, month: str = "") -> ToolResult:
    phone = str(phone).strip()
    month = str(month).strip() or datetime.now().strftime("%Y%m")

    resp = await post_eop(
        "/api/eop/eop.ZwzxPackageRecord/requestEop",
        {
            "params": {
                "deviceNo": phone,
                "month": month,
                "destinationAttr": "0",
            },
            "business": "zwzx_PackageRecord",
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    result = eop.get("result", {})
    if result.get("resultCode") != "0":
        return ToolResult(error=result.get("resultMsg", "查询失败"))

    result_list = result.get("resultList", [])
    info_list = eop.get("info", [])
    carry_over = eop.get("carryOverFlow") or {}
    shared_usage = eop.get("sharedUsage") or {}
    login_role = eop.get("loginRole", "")
    offer_inst_rows = eop.get("records", {}).get("offerInstInfo", []) if isinstance(eop.get("records"), dict) else []
    offer_inst_map = {str(row.get("offerInstId", "") or ""): row for row in offer_inst_rows if isinstance(row, dict)}

    lines = [f"手机号: {phone}  账期: {month}"]
    items = []
    for grp in result_list:
        name = grp.get("grounName", "")
        total = f"{grp['show_all_value']}{grp['show_all_unit']}"
        used = f"{grp['show_used_value']}{grp['show_used_unit']}"
        left = f"{grp['show_left_value']}{grp['show_left_unit']}"
        pct = grp.get("percent", "")
        lines.append(f"  {name}: 总量{total} 已用{used} 剩余{left} (剩余{pct})")
        detail_rows = []
        for detail in grp.get("resultList", []):
            offer_inst_id = str(detail.get("offerInstId", "") or "")
            member_details = _parse_embedded_detail_rows(detail.get("obj_AccuUseDetailQry", ""))
            if not member_details:
                offer_inst = offer_inst_map.get(offer_inst_id, {})
                accu_qry_list = offer_inst.get("accuQryList", []) if isinstance(offer_inst.get("accuQryList"), list) else []
                accu_row = next((row for row in accu_qry_list if str(row.get("accuId", "") or "") == str(detail.get("accuId", "") or "")), accu_qry_list[0] if accu_qry_list else {})
                member_details = await _load_accu_use_detail(
                    phone=phone,
                    month=month,
                    detail=detail,
                    accu_row=accu_row if isinstance(accu_row, dict) else {},
                )
            detail_row = {
                "offerName": detail.get("offerName", ""),
                "show_all_value": detail.get("show_all_value", ""),
                "show_used_value": detail.get("show_used_value", ""),
                "show_left_value": detail.get("show_left_value", ""),
                "shareFlag": detail.get("shareFlag", "0"),
                "unitTypeId": detail.get("unitTypeId", ""),
                "offerInstId": offer_inst_id,
                "accuId": detail.get("accuId", ""),
                "detailList": member_details,
            }
            detail_rows.append(detail_row)
            if len(member_details) > 1:
                lines.append(f"    {detail.get('offerName', name)} 明细: {_format_member_detail_summary(member_details)}")
            elif member_details and str(detail.get("shareFlag", "0") or "0") == "1":
                lines.append(f"    {detail.get('offerName', name)} 当前视图: {_format_member_detail_summary(member_details)}")
        items.append({
            "name": name, "total": total, "used": used, "left": left, "percent": pct,
            "details": detail_rows,
        })

    if info_list:
        excess = [f"{i['show_name']}{i['show_value']}{i['show_unit']}" for i in info_list if int(i.get("show_value", 0)) > 0]
        if excess:
            lines.append(f"  套餐外: {', '.join(excess)}")
    if carry_over.get("supported"):
        lines.append(f"  可结转流量: {carry_over.get('left', '0')}{carry_over.get('unit', '')}")
    if login_role == "master_card" and shared_usage.get("subCards"):
        lines.append(f"  共享副卡用量: 已用{shared_usage.get('sharedUsed', '0')}{shared_usage.get('unit', '')} 剩余{shared_usage.get('sharedLeft', '0')}{shared_usage.get('unit', '')}")
    elif login_role == "sub_card" and shared_usage.get("loginView"):
        login_view = shared_usage.get("loginView") or {}
        lines.append(f"  当前副卡共享用量: 已用{login_view.get('dataUsed', '0')}{login_view.get('unit', '')} 剩余{login_view.get('dataLeft', '0')}{login_view.get('unit', '')}")

    card = {
        "type": "package",
        "title": "套餐用量",
        "phone": phone,
        "month": month,
        "loginRole": login_role,
        "items": items,
        "excess": info_list,
        "carryOverFlow": carry_over,
        "sharedUsage": shared_usage,
    }
    return ToolResult(text="\n".join(lines), metadata={"card": card})


def _parse_embedded_detail_rows(raw_value) -> list[dict]:
    if isinstance(raw_value, list):
        rows = raw_value
    else:
        text = str(raw_value or "").strip()
        if not text:
            return []
        try:
            rows = json.loads(text)
        except json.JSONDecodeError:
            return []
    if not isinstance(rows, list):
        return []
    result = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        result.append(
            {
                "memberAccNum": str(row.get("memberAccNum", "") or "").strip(),
                "memberRole": str(row.get("memberRole", "") or "").strip(),
                "usedValue": str(row.get("usedValue", "") or "").strip(),
                "leftValue": str(row.get("leftValue", "") or "").strip(),
                "totalValue": str(row.get("totalValue", "") or "").strip(),
                "unit": str(row.get("unit", "") or "").strip(),
                "isCurrentLogin": bool(row.get("isCurrentLogin")),
            }
        )
    return result


async def _load_accu_use_detail(phone: str, month: str, detail: dict, accu_row: dict) -> list[dict]:
    resp = await post_eop(
        "/api/eop/eop.AccuUseDetailQry/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "accNum": phone,
                "billingCycle": month,
                "offerInstId": str(detail.get("offerInstId", "") or ""),
                "accuId": str(detail.get("accuId", "") or ""),
                "unitTypeId": str(detail.get("unitTypeId", accu_row.get("unitTypeId", "")) or ""),
                "shareFlag": str(detail.get("shareFlag", "0") or "0"),
                "offerName": str(detail.get("offerName", "") or ""),
            },
        },
    )
    root = response_root(resp)
    if root.get("resCode") != "0000":
        return []
    eop = extract_eop_data(resp)
    if str(eop.get("code", "0") or "0") != "0":
        return []
    return _parse_embedded_detail_rows(eop.get("detailList", []))


def _format_member_detail_summary(rows: list[dict]) -> str:
    parts = []
    for row in rows:
        phone = _mask_phone(str(row.get("memberAccNum", "") or ""))
        used = str(row.get("usedValue", "") or "0")
        left = str(row.get("leftValue", "") or "0")
        unit = str(row.get("unit", "") or "")
        role = "当前号码" if row.get("isCurrentLogin") else ("主卡" if str(row.get("memberRole", "") or "") == "master_card" else "副卡")
        parts.append(f"{role}{phone} 已用{used}{unit} 剩余{left}{unit}")
    return "；".join(parts)


def _mask_phone(value: str) -> str:
    text = str(value or "").strip()
    if text.isdigit() and len(text) == 11:
        return f"{text[:3]}****{text[-4:]}"
    return text
