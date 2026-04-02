"""电信业务伪数据：套餐、余额、账单（稳定可复现）
套餐信息参考 klg.xlsx 知识库中的云宽带美好家5G融合套餐、5G畅享、星卡系列真实资费。
"""
import random
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# 云宽带美好家5G融合套餐（来源：klg.xlsx 知识库）
# 含宽带+IPTV+手机流量+通话，5G后付费
# bandwidth   宽带下行速率
# iptv        免费IPTV路数
# ---------------------------------------------------------------------------
PLANS = {
    "云宽带美好家129档": {
        "fee": 129, "data_gb": 30, "call_min": 300, "sms": 0,
        "bandwidth": "下行300M/上行40M", "iptv": 1,
        "extras": "5G后付费;1路4K IPTV;300M宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选1;千兆组网尊享包优惠10元;家庭数字尊享包优惠10元",
    },
    "云宽带美好家159档": {
        "fee": 159, "data_gb": 40, "call_min": 500, "sms": 0,
        "bandwidth": "下行500M/上行50M", "iptv": 1,
        "extras": "5G后付费;1路4K IPTV;500M宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选1;千兆组网尊享包优惠10元;家庭数字尊享包优惠10元",
    },
    "云宽带美好家199档": {
        "fee": 199, "data_gb": 60, "call_min": 800, "sms": 0,
        "bandwidth": "下行1000M/上行100M", "iptv": 1,
        "extras": "5G后付费;1路4K IPTV;千兆宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选1;千兆组网尊享包优惠20元;家庭数字尊享包优惠20元;满5张号卡流量翻倍至120GB",
    },
    "云宽带美好家229档": {
        "fee": 229, "data_gb": 100, "call_min": 1000, "sms": 0,
        "bandwidth": "下行1000M/上行100M", "iptv": 2,
        "extras": "5G后付费;2路4K IPTV;千兆宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选2;千兆组网尊享包优惠50元;家庭数字尊享包优惠30元;满5张号卡流量翻倍至200GB",
    },
    "云宽带美好家299档": {
        "fee": 299, "data_gb": 120, "call_min": 1500, "sms": 0,
        "bandwidth": "下行1000M/上行100M", "iptv": 2,
        "extras": "5G后付费;2路4K IPTV;千兆宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选2;千兆组网尊享包优惠50元;家庭数字尊享包优惠30元;满5张号卡流量翻倍至240GB",
    },
    "云宽带美好家399档": {
        "fee": 399, "data_gb": 150, "call_min": 2000, "sms": 0,
        "bandwidth": "下行1000M/上行100M", "iptv": 3,
        "extras": "5G后付费;3路4K IPTV;千兆宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选2;千兆组网尊享包优惠80元;家庭数字尊享包优惠50元;满5张号卡流量翻倍至300GB",
    },
    "云宽带美好家599档": {
        "fee": 599, "data_gb": 300, "call_min": 3000, "sms": 0,
        "bandwidth": "下行1000M/上行100M", "iptv": 4,
        "extras": "5G后付费;4路4K IPTV;千兆宽带;来电显示;189邮箱;天翼云盘黄金版;视频会员权益N选2;千兆组网尊享包优惠80元;家庭数字尊享包优惠50元;满5张号卡流量翻倍至600GB",
    },
    # ---- 5G 畅享系列（纯手机卡，无宽带）----
    "5G畅享59元套餐": {
        "fee": 59, "data_gb": 5, "call_min": 150, "sms": 0,
        "extras": "5G网络接入;来电显示",
    },
    "5G畅享129元套餐": {
        "fee": 129, "data_gb": 30, "call_min": 500, "sms": 0,
        "extras": "5G网络优享;来电显示;天翼超高清",
    },
    "5G畅享199元套餐": {
        "fee": 199, "data_gb": 60, "call_min": 1000, "sms": 0,
        "extras": "5G网络极速;来电显示;天翼超高清;天翼云盘;视频彩铃",
    },
    # ---- 星卡系列 ----
    "星卡29元套餐": {
        "fee": 29, "data_gb": 15, "call_min": 100, "sms": 0,
        "extras": "定向流量30GB(抖音/头条/西瓜等);来电显示",
    },
    "星卡39元套餐": {
        "fee": 39, "data_gb": 20, "call_min": 150, "sms": 0,
        "extras": "定向流量40GB(抖音/头条/西瓜等);来电显示",
    },
}


USERS = {
    # ---- 云宽带美好家5G融合套餐系列 ----
    "18018609133": {
        "name": "张三", "acct_id": "20004225889",
        "plan": "云宽带美好家129档", "status": "正常",
        "fee": 129, "data_gb": 30, "call_min": 300, "sms": 0,
        "income": 22.1, "expense": 11.5,
    },
    "15088889999": {
        "name": "孙悦", "acct_id": "20004225895",
        "plan": "云宽带美好家159档", "status": "正常",
        "fee": 159, "data_gb": 40, "call_min": 500, "sms": 0,
        "income": 26.6, "expense": 15.3,
    },
    "17700003333": {
        "name": "周宁", "acct_id": "20004225896",
        "plan": "云宽带美好家199档", "status": "正常",
        "fee": 199, "data_gb": 60, "call_min": 800, "sms": 0,
        "income": 30.2, "expense": 19.8,
    },
    "13800138000": {
        "name": "赵敏", "acct_id": "20004225893",
        "plan": "云宽带美好家229档", "status": "正常",
        "fee": 229, "data_gb": 100, "call_min": 1000, "sms": 0,
        "income": 35.4, "expense": 22.9,
    },
    "15800001111": {
        "name": "王五", "acct_id": "20004225891",
        "plan": "云宽带美好家299档", "status": "正常",
        "fee": 299, "data_gb": 120, "call_min": 1500, "sms": 0,
        "income": 41.3, "expense": 28.7,
    },
    "13100004444": {
        "name": "吴峰", "acct_id": "20004225897",
        "plan": "云宽带美好家399档", "status": "正常",
        "fee": 399, "data_gb": 150, "call_min": 2000, "sms": 0,
        "income": 55.0, "expense": 40.2,
    },
    "13817778888": {
        "name": "曹洋", "acct_id": "20004225902",
        "plan": "云宽带美好家599档", "status": "正常",
        "fee": 599, "data_gb": 300, "call_min": 3000, "sms": 0,
        "income": 78.5, "expense": 61.3,
    },
    # ---- 5G 畅享系列（纯手机卡） ----
    "13912345678": {
        "name": "李四", "acct_id": "20004225890",
        "plan": "5G畅享129元套餐", "status": "正常",
        "fee": 129, "data_gb": 30, "call_min": 500, "sms": 0,
        "income": 22.1, "expense": 16.2,
    },
    "18621001234": {
        "name": "林涛", "acct_id": "20004225899",
        "plan": "5G畅享199元套餐", "status": "正常",
        "fee": 199, "data_gb": 60, "call_min": 1000, "sms": 0,
        "income": 30.2, "expense": 20.1,
    },
    "15000005555": {
        "name": "冯洁", "acct_id": "20004225903",
        "plan": "5G畅享59元套餐", "status": "正常",
        "fee": 59, "data_gb": 5, "call_min": 150, "sms": 0,
        "income": 8.5, "expense": 5.9,
    },
    # ---- 星卡系列 ----
    "19916970157": {
        "name": "陈晨", "acct_id": "20004225892",
        "plan": "星卡29元套餐", "status": "正常",
        "fee": 29, "data_gb": 15, "call_min": 100, "sms": 0,
        "income": 10.5, "expense": 4.2,
    },
    "13600002222": {
        "name": "钱程", "acct_id": "20004225894",
        "plan": "星卡39元套餐", "status": "正常",
        "fee": 39, "data_gb": 20, "call_min": 150, "sms": 0,
        "income": 12.4, "expense": 7.2,
    },
}

DEFAULT_USER = "18018609133"


def _rng(*vals: str) -> random.Random:
    key = "|".join([str(v) for v in vals])
    return random.Random(key)


def _find_by_acct(acct: str) -> dict:
    for u in USERS.values():
        if u["acct_id"] == acct:
            return u
    return USERS[DEFAULT_USER]


def _next_month(dt: datetime) -> datetime:
    return (dt.replace(day=28) + timedelta(days=4)).replace(day=1)


def build_package(phone: str, month: str) -> dict:
    phone = str(phone).strip()
    month = str(month).strip()
    user = USERS.get(phone, USERS[DEFAULT_USER])
    plan = PLANS.get(user["plan"], {})
    r = _rng("pkg", phone, month)

    data_total = float(user["data_gb"])
    data_used = round(data_total * (0.28 + r.random() * 0.62), 2)
    data_left = max(0.0, round(data_total - data_used, 2))
    data_pct = int(100 * data_used / data_total) if data_total else 0

    call_total = int(user["call_min"])
    call_used = int(call_total * (0.2 + r.random() * 0.65))
    call_left = max(0, call_total - call_used)
    call_pct = int(100 * call_used / call_total) if call_total else 0

    items = [
        {
            "grounName": "全国通用流量",
            "show_all_value": f"{data_total:.2f}",
            "show_all_unit": "GB",
            "show_used_value": f"{data_used:.2f}",
            "show_used_unit": "GB",
            "show_left_value": f"{data_left:.2f}",
            "show_left_unit": "GB",
            "percent": f"{data_pct}%",
            "resultList": [],
        },
        {
            "grounName": "国内通话",
            "show_all_value": f"{call_total}",
            "show_all_unit": "分钟",
            "show_used_value": f"{call_used}",
            "show_used_unit": "分钟",
            "show_left_value": f"{call_left}",
            "show_left_unit": "分钟",
            "percent": f"{call_pct}%",
            "resultList": [],
        },
    ]

    sms_total = int(user.get("sms", 0))
    if sms_total > 0:
        sms_used = int(sms_total * (0.1 + r.random() * 0.6))
        sms_left = max(0, sms_total - sms_used)
        sms_pct = int(100 * sms_used / sms_total)
        items.append({
            "grounName": "国内短信",
            "show_all_value": f"{sms_total}",
            "show_all_unit": "条",
            "show_used_value": f"{sms_used}",
            "show_used_unit": "条",
            "show_left_value": f"{sms_left}",
            "show_left_unit": "条",
            "percent": f"{sms_pct}%",
            "resultList": [],
        })

    result = {
        "resultCode": "0",
        "resultMsg": "操作成功",
        "userName": user["name"],
        "planName": user["plan"],
        "planFee": f"{user['fee']}元/月",
        "month": month,
        "resultList": items,
    }
    extras = plan.get("extras", "")
    if extras:
        result["extras"] = extras
    return result


def build_balance(acct: str, month: str) -> dict:
    acct = str(acct).strip()
    month = str(month).strip()
    user = _find_by_acct(acct)
    r = _rng("bal", acct, month)

    income = int(max(100, (user["income"] + r.uniform(-4.5, 7.0)) * 100))
    expense = int(max(50, (user["expense"] + r.uniform(-3.5, 5.5)) * 100))

    return {
        "result": {
            "resultMsg": "操作成功",
            "resultCode": "0",
            "resultList": [{"balanceAllIn": str(income), "balanceAllOut": str(expense)}],
        },
        "code": "0",
    }


def build_bill(acct: str, from_date: str, to_date: str) -> dict:
    acct = str(acct).strip()
    from_date = str(from_date).strip()
    to_date = str(to_date).strip()
    user = _find_by_acct(acct)
    r = _rng("bill", acct, from_date, to_date)

    try:
        start = datetime.strptime(from_date, "%Y-%m")
        end = datetime.strptime(to_date, "%Y-%m")
    except ValueError:
        start = datetime.now().replace(day=1) - timedelta(days=180)
        end = datetime.now().replace(day=1)

    if start > end:
        start, end = end, start

    bills = []
    cur = start
    i = 0
    while cur <= end:
        fee = int(user["fee"])
        charge = int(max(1000, (fee + r.uniform(-22, 45)) * 100))
        is_latest = cur.year == end.year and cur.month == end.month
        paid = (not is_latest and r.random() > 0.08) or (is_latest and r.random() > 0.55)
        paid_amt = charge if paid else int(charge * r.uniform(0.0, 0.6))
        due = max(0, charge - paid_amt)

        bills.append({
            "invoceNo": f"188{(int(acct[-6:]) + i * 7919) % 900000000 + 100000000}",
            "billDate": cur.replace(day=28).strftime("%Y-%m-%d"),
            "fromDate": cur.replace(day=1).strftime("%Y-%m-%d"),
            "toDate": cur.replace(day=28).strftime("%Y-%m-%d"),
            "newCharge": charge,
            "totalAdj": 0,
            "totalPaid": paid_amt,
            "balanceDue": due,
            "status": "2" if due == 0 else "0",
            "billType": "01",
        })
        i += 1
        cur = _next_month(cur)

    return {
        "count": len(bills),
        "paymentMode": "现金",
        "acctName": user["name"],
        "invoiceBalanceList": bills,
    }
