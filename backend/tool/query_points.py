"""积分查询工具
接口链路: eop.CapAccountHttps（手机号→custNumber）+ eop.userBasicInfo（custNumber→积分）
"""
from tool.base import tool, ToolResult
from api.eop import post_eop, get_cap_account_eop, extract_eop_data, response_root


@tool(
    name="query_points",
    description="查询用户积分信息，包括总积分、可用积分、已用积分、即将清零积分、本月新增积分、客户状态。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
        },
        "required": ["phone"],
    },
)
async def query_points(phone: str) -> ToolResult:
    phone = str(phone).strip()

    cap = await get_cap_account_eop(phone)
    cust_number = cap.get("custNumber", "")
    cust_name = cap.get("custName", "")
    if not cust_number:
        return ToolResult(error=f"未查到手机号 {phone} 对应的客户编码")

    resp = await post_eop(
        "/api/eop/eop.userBasicInfo/requestEop",
        {
            "custId": cust_number,
            "channelId": "WT",
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    if eop.get("code") != "00000":
        return ToolResult(error=eop.get("message", "查询失败"))

    body = eop.get("body", {})
    sum_points = body.get("sumPoints", 0)
    useable = body.get("useablePoints", 0)
    used = body.get("usedPoints", 0)
    expiring = body.get("score", 0)
    expire_year = body.get("year", 0)
    month_new = body.get("currMonthPoints", 0)
    status_cd = body.get("statusCd", "1000")
    available_hubei = body.get("availableHuBei", 0)
    available_hubei_text = body.get("availableHuBeiText", "")
    display_expire_year = 2026 if expiring > 0 else expire_year

    status_map = {"1000": "正常", "1100": "冻结", "1300": "部分冻结（仅限实体营业厅兑换）"}
    status_text = status_map.get(status_cd, f"未知({status_cd})")

    lines = [f"手机号: {phone}"]
    if cust_name:
        lines[0] += f"  姓名: {cust_name}"
    lines.append(f"  总积分: {sum_points}")
    lines.append(f"  可用积分: {useable}")
    lines.append(f"  已用积分: {used}")
    lines.append(f"  本月新增: {month_new}")
    if available_hubei:
        lines.append(f"  可用沪呗: {available_hubei}")
    if expiring > 0:
        lines.append(f"  即将清零: {expiring}（{display_expire_year}年底到期）")
    lines.append(f"  账户状态: {status_text}")

    card = {
        "type": "points",
        "title": "积分信息",
        "phone": phone,
        "custName": cust_name,
        "sumPoints": sum_points,
        "useablePoints": useable,
        "usedPoints": used,
        "expiringPoints": expiring,
        "expireYear": display_expire_year,
        "currMonthPoints": month_new,
        "statusCd": status_cd,
        "statusText": status_text,
        "availableHuBei": available_hubei,
        "availableHuBeiText": available_hubei_text,
    }
    return ToolResult(text="\n".join(lines), metadata={"card": card})
