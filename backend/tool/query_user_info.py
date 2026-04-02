"""用户信息查询工具
接口: eop.CapAccountHttps（获取设备号的客户标识）
"""
from tool.base import tool, ToolResult
from api.eop import get_cap_account_eop


@tool(
    name="query_user_info",
    description="查询用户基本信息，包括姓名、分账序号、关联设备号列表、付费类型等。需要用户手机号。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
        },
        "required": ["phone"],
    },
)
async def query_user_info(phone: str) -> ToolResult:
    phone = str(phone).strip()

    eop = await get_cap_account_eop(phone)
    if not eop:
        return ToolResult(error="接口请求失败")

    cust_name = eop.get("custName", "")
    cust_id = eop.get("custId", "")
    cust_number = eop.get("custNumber", "")
    accounts = eop.get("account", [])

    lines = [f"手机号: {phone}  姓名: {cust_name}"]
    lines.append(f"  客户标识: {cust_id}")
    lines.append(f"  客户编码: {cust_number}")

    prod_inst_list = []
    acct_cd = ""
    billing_type = ""
    fee_cycle_type = ""
    customer_type = ""
    if accounts:
        acct = accounts[0]
        acct_cd = acct.get("acctCd", "")
        billing_type = acct.get("acctBillingType", "")
        fee_cycle_type = acct.get("feeCycleTypeText", "") or acct.get("feeCycleType", "")
        customer_type = acct.get("customerType", "")
        billing_type_display = str(billing_type or '').split('|', 1)[0].strip() if billing_type else ''
        lines.append(f"  分账序号: {acct_cd}")
        lines.append(f"  付费类型: {billing_type_display or '-'}")
        if fee_cycle_type:
            lines.append(f"  付费周期: {fee_cycle_type}")
        if customer_type:
            lines.append(f"  客户类型: {customer_type}")
        prod_inst_list = [p.get("accNum", "") for p in acct.get("prodInst", [])]
        if prod_inst_list:
            lines.append(f"  关联设备: {', '.join(prod_inst_list)}")

    card = {
        "type": "user_info",
        "title": "用户信息",
        "phone": phone,
        "custName": cust_name,
        "custId": cust_id,
        "custNumber": cust_number,
        "acctCd": acct_cd,
        "billingType": billing_type,
        "billingTypeText": str(billing_type or '').split('|', 1)[0].strip() if billing_type else '',
        "feeCycleType": fee_cycle_type,
        "customerType": customer_type,
        "prodInst": prod_inst_list,
    }
    return ToolResult(text="\n".join(lines), metadata={"card": card})
