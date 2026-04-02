"""账单查询工具
接口链路: eop.BpnbrListBySerialnbr（手机号→分账序号）+ eop.InvoiceBalanceListInfo（分账序号→账单）
"""
from datetime import datetime, timedelta
from random import randint
from tool.base import tool, ToolResult
from api.eop import post_eop, get_acct_cd, extract_eop_data, response_root


def _month_index(value: str) -> int:
    dt = datetime.strptime(value, "%Y-%m")
    return dt.year * 12 + dt.month


@tool(
    name="query_bill",
    description="查询用户的账单列表，可按时间范围查询每月账单明细（金额、支付状态等）。需要用户手机号、起止月份。",
    parameters={
        "type": "object",
        "properties": {
            "phone": {"type": "string", "description": "用户手机号"},
            "from_date": {"type": "string", "description": "起始月份，格式 YYYY-MM，如 2025-01"},
            "to_date": {"type": "string", "description": "截止月份，格式 YYYY-MM，如 2025-06"},
        },
        "required": ["phone"],
    },
)
async def query_bill(phone: str, from_date: str = "", to_date: str = "") -> ToolResult:
    phone = str(phone).strip()
    from_date = str(from_date).strip()
    to_date = str(to_date).strip()
    if not to_date:
        to_date = datetime.now().strftime("%Y-%m")
    if not from_date:
        d = datetime.now().replace(day=1) - timedelta(days=180)
        from_date = d.strftime("%Y-%m")

    try:
        start_idx = _month_index(from_date)
        end_idx = _month_index(to_date)
    except ValueError:
        return ToolResult(error="账单月份格式应为 YYYY-MM")

    if start_idx > end_idx:
        from_date, to_date = to_date, from_date
        start_idx, end_idx = end_idx, start_idx

    current_idx = datetime.now().year * 12 + datetime.now().month
    if start_idx < current_idx - 11 or end_idx > current_idx:
        return ToolResult(text="仅支持查询近12个月账单，如需更早账单请联系客服或前往营业厅查询。")

    acct_cd = await get_acct_cd(phone)
    if not acct_cd:
        return ToolResult(error=f"未查到手机号 {phone} 对应的分账序号")

    now = datetime.now()
    request_time = now.strftime("%Y%m%d%H%M%S%f")[:17]
    request_seq = request_time + str(randint(0, 999999)).zfill(6)

    resp = await post_eop(
        "/api/eop/eop.InvoiceBalanceListInfoHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {
                "requestSeq": request_seq,
                "fromDate": from_date,
                "requestTime": request_time,
                "status": "0",
                "acctId": acct_cd,
                "toDate": to_date,
            },
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return ToolResult(error=root.get("resMsg") or "接口请求失败")

    eop = extract_eop_data(resp)
    acct_name = eop.get("acctName", "")
    bills = eop.get("invoiceBalanceList", [])
    billing_type = str(eop.get("billingType", "") or "").strip()
    fee_cycle_type = str(eop.get("feeCycleType", "") or "").strip()
    billing_judge = eop.get("billingJudge") or {}

    lines = [f"手机号: {phone}"]
    if acct_name:
        lines[0] += f"  姓名: {acct_name}"
    lines[0] += f"  查询范围: {from_date} ~ {to_date}  共{len(bills)}笔"
    if billing_type or fee_cycle_type:
        lines.append(f"  付费类型: {billing_type or '-'} / {fee_cycle_type or '-'}")

    items = []
    total_unpaid = 0
    for b in bills:
        charge_fen = b.get("newCharge", 0)
        charge_yuan = charge_fen / 100
        due_fen = b.get("balanceDue", 0)
        status = b.get("status", "1")
        paid = status == "2"
        bill_date = b.get("billDate", "")
        lines.append(f"  {bill_date}: 应缴{charge_yuan:.2f}元  状态:{'已缴' if paid else '未缴'}")
        if not paid:
            total_unpaid += due_fen
        items.append({
            "invoceNo": b.get("invoceNo", ""),
            "billDate": bill_date,
            "fromDate": b.get("fromDate", ""),
            "toDate": b.get("toDate", ""),
            "charge": f"{charge_yuan:.2f}",
            "balanceDue": f"{due_fen / 100:.2f}",
            "paid": paid,
        })

    if total_unpaid > 0:
        lines.append(f"  未缴合计: {total_unpaid / 100:.2f}元")

    card = {
        "type": "bill",
        "title": "账单明细",
        "phone": phone,
        "accountName": acct_name,
        "range": f"{from_date} ~ {to_date}",
        "billingType": billing_type,
        "feeCycleType": fee_cycle_type,
        "billingJudge": billing_judge,
        "items": items,
        "totalUnpaid": f"{total_unpaid / 100:.2f}",
    }
    return ToolResult(text="\n".join(lines), metadata={"card": card})
