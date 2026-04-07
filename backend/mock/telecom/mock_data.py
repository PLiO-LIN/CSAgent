"""
电信客服模拟数据 — 基于接口文档中的真实响应样例构造。
所有手机号默认映射到同一个模拟用户，方便演示。
"""
from __future__ import annotations
import uuid, random
from datetime import datetime, timedelta

# ── 用户映射 ─────────────────────────────────────────────
MOCK_USERS = {
    "19921199563": {
        "custId": "229036863693",
        "custNumber": "202147958329",
        "custName": "谭志松",
        "acctCd": "23017525004",
        "acctId": 400039637807,
        "contactAddr": "上海市嘉定区嘉定工业区秋竹路1001弄5号12层1202室",
        "addressDesc": "上海市青浦区赵巷镇镇泽路518弄62号3层302室",
        "email": "1132058431@qq.com",
        "paymentMode": "现金",
        "billingType": "后付费|1200",
        "statusCd": "在用|100000",
        "prodName": "移动电话",
        "subBureau": "赵巷",
        "prodDevices": [
            {"accNum": "19921199563"},
            {"accNum": "KD2008028855"},
            {"accNum": "17317482517"},
            {"accNum": "17317643517"},
        ],
    },
}

# 默认回退：任意号码返回演示用户
_DEFAULT_PHONE = "19921199563"

def get_user(phone: str) -> dict | None:
    return MOCK_USERS.get(phone) or MOCK_USERS.get(_DEFAULT_PHONE)


# ── 余额 ─────────────────────────────────────────────────
def get_balance(phone: str) -> dict:
    user = get_user(phone)
    return {
        "phone": phone,
        "custName": user["custName"],
        "acctCd": user["acctCd"],
        "show_ye": "80198",
        "show_ye_zy": "44200",
        "show_ye_ty": "35998",
        "show_ye_unit": "分",
        "shouldCharge": "0",
        "resultMsg": "操作成功",
        "_summary": f"话费余额 ¥{80198/100:.2f}（专用 ¥{44200/100:.2f} + 通用 ¥{35998/100:.2f}），无欠费",
    }


# ── 套餐用量 ─────────────────────────────────────────────
def get_package_usage(phone: str, month: str | None = None) -> dict:
    if not month:
        month = datetime.now().strftime("%Y%m")
    return {
        "phone": phone,
        "month": month,
        "usageSummary": [
            {
                "grounName": "国内通用流量",
                "show_all_value": "523.48",
                "show_used_value": "122.55",
                "show_left_value": "400.94",
                "unit": "GB",
                "percent": "23%",
            },
            {
                "grounName": "国内通用语音",
                "show_all_value": "100",
                "show_used_value": "0",
                "show_left_value": "100",
                "unit": "分钟",
                "percent": "0%",
            },
            {
                "grounName": "专用语音",
                "show_all_value": "2437",
                "show_used_value": "1",
                "show_left_value": "2436",
                "unit": "分钟",
                "percent": "0%",
            },
            {
                "grounName": "国内通用短信",
                "show_all_value": "20",
                "show_used_value": "0",
                "show_left_value": "20",
                "unit": "条",
                "percent": "0%",
            },
        ],
        "outOfPlanUsage": [
            {"show_name": "套餐外短信", "show_value": "2", "show_unit": "条"},
            {"show_name": "套餐外语音", "show_value": "0", "show_unit": "分钟"},
            {"show_name": "套餐外流量", "show_value": "0", "show_unit": "KB"},
        ],
        "_summary": (
            f"{month} 套餐用量：流量已用 122.55/523.48 GB (23%)，"
            "通用语音 0/100 分钟，专用语音 1/2437 分钟，短信 0/20 条"
        ),
    }


# ── 账单 ─────────────────────────────────────────────────
def get_bill(phone: str, from_month: str | None = None, to_month: str | None = None) -> dict:
    user = get_user(phone)
    if not from_month:
        now = datetime.now()
        prev = now.replace(day=1) - timedelta(days=1)
        from_month = prev.strftime("%Y-%m")
    if not to_month:
        to_month = from_month
    return {
        "phone": phone,
        "custName": user["custName"],
        "acctCd": user["acctCd"],
        "paymentMode": user["paymentMode"],
        "bills": [
            {
                "billDate": f"{from_month}-01",
                "fromDate": f"{from_month}-01",
                "toDate": f"{from_month}-28",
                "newCharge": 2900,
                "newCharge_yuan": "29.00",
                "totalPaid": -2900,
                "balanceDue": 0,
                "lateFeeAmount": 0,
                "invoceNo": "303173229640",
                "status": "2",
                "status_text": "已支付",
            }
        ],
        "_summary": f"{from_month} 账单：消费 ¥29.00，已支付，无欠费",
    }


# ── 积分 ─────────────────────────────────────────────────
def get_points(phone: str) -> dict:
    user = get_user(phone)
    return {
        "phone": phone,
        "custName": user["custName"],
        "sumPoints": 15863,
        "useablePoints": 3504,
        "usedPoints": 11450,
        "currMonthPoints": 140,
        "score": 1682,
        "sumscore": 909,
        "clearYear": 2024,
        "statusCd": "1000",
        "status_text": "正常",
        "_summary": "总积分 15863，可用 3504，已用 11450，本月新增 140，2024年即将清零 1682",
    }


# ── 订购关系 ─────────────────────────────────────────────
def get_subscriptions(phone: str) -> dict:
    user = get_user(phone)
    offers = [
        {"offerName": "5G-A融合299元套餐202503", "offerId": "100000279704309", "statusCd": "在用", "effDate": "2026-04-01", "expDate": "2051-01-31", "parentOffer": "—"},
        {"offerName": "安全流量体验包", "offerId": "100000264995689", "statusCd": "在用", "effDate": "2024-11-01", "expDate": "2051-01-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "50GB流量包优惠购，1元/年", "offerId": "100000271677614", "statusCd": "在用", "effDate": "2025-10-17", "expDate": "2026-10-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "焕新流量包，36个月", "offerId": "100000286566902", "statusCd": "在用", "effDate": "2026-03-02", "expDate": "2029-03-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "臻享美好家5G-A融合套餐（299元）流量促销包", "offerId": "100000285308013", "statusCd": "在用", "effDate": "2026-04-01", "expDate": "2051-01-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "营销预存500元担保专用", "offerId": "151571567132", "statusCd": "在用", "effDate": "2026-02-01", "expDate": "2050-12-30", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "云宽带美好家大流量5G融合套餐移动语音促销包（1000分钟）", "offerId": "100000282852502", "statusCd": "在用", "effDate": "2026-03-02", "expDate": "2051-01-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "畅享卡（29元）", "offerId": "100000193602576", "statusCd": "在用", "effDate": "2026-04-01", "expDate": "2051-01-31", "parentOffer": "—"},
        {"offerName": "天翼智能防诈基础版", "offerId": "100000286644652", "statusCd": "在用", "effDate": "2026-03-02", "expDate": "2051-01-31", "parentOffer": "5G-A融合299元套餐202503"},
        {"offerName": "云智手机服务标准版", "offerId": "100000283673232", "statusCd": "在用", "effDate": "2026-03-02", "expDate": "2051-01-31", "parentOffer": "5G-A融合299元套餐202503"},
    ]
    return {
        "phone": phone,
        "custName": user["custName"],
        "paymentModeCd": user["billingType"],
        "statusCd": user["statusCd"],
        "offers": offers,
        "_summary": f"当前主套餐：5G-A融合299元套餐202503，共 {len(offers)} 个在用产品/可选包",
    }


# ── 套餐推荐 ─────────────────────────────────────────────
RECOMMEND_CATALOG = [
    {
        "offerId": "PKG_5G_129",
        "offerName": "5G畅享129元套餐",
        "monthlyFee": "129元/月",
        "data": "30GB国内流量",
        "voice": "500分钟国内通话",
        "sms": "—",
        "highlights": "含来电显示，5G极速体验",
        "suitableFor": "中等流量需求用户",
    },
    {
        "offerId": "PKG_5G_199",
        "offerName": "5G畅享199元套餐",
        "monthlyFee": "199元/月",
        "data": "60GB国内流量",
        "voice": "1000分钟国内通话",
        "sms": "—",
        "highlights": "含来电显示+天翼云盘黄金版，适合高流量用户",
        "suitableFor": "高流量需求用户",
    },
    {
        "offerId": "PKG_FAMILY_299",
        "offerName": "云宽带美好家299元套餐",
        "monthlyFee": "299元/月",
        "data": "150GB国内流量（群组共享）",
        "voice": "1500分钟国内通话（群组共享）",
        "sms": "20条",
        "broadband": "1000M宽带",
        "highlights": "含2张免费副卡、来电显示、189邮箱、天翼云盘黄金版、视频会员N选2",
        "suitableFor": "家庭融合/高流量用户",
    },
    {
        "offerId": "PKG_FAMILY_399",
        "offerName": "云宽带美好家399元套餐",
        "monthlyFee": "399元/月",
        "data": "200GB国内流量（群组共享）",
        "voice": "2000分钟国内通话（群组共享）",
        "sms": "30条",
        "broadband": "2000M宽带",
        "highlights": "含2张免费副卡、千兆组网权益、视频会员N选2",
        "suitableFor": "大家庭/高端融合用户",
    },
    {
        "offerId": "PKG_STUDENT_29",
        "offerName": "畅享卡29元套餐",
        "monthlyFee": "29元/月",
        "data": "10GB国内流量",
        "voice": "100分钟国内通话",
        "sms": "—",
        "highlights": "低月租高性价比",
        "suitableFor": "低用量/学生用户",
    },
    {
        "offerId": "DATA_50GB_1",
        "offerName": "50GB流量包优惠购",
        "monthlyFee": "1元/年",
        "data": "50GB/月",
        "voice": "—",
        "sms": "—",
        "highlights": "超值年包，叠加使用",
        "suitableFor": "流量不够用、需要叠加流量包的用户",
    },
]


def recommend_packages(phone: str, need_type: str | None = None) -> dict:
    """根据需求类型推荐套餐。need_type 可选: 流量, 语音, 家庭, 低价, 全部"""
    filtered = RECOMMEND_CATALOG
    if need_type:
        kw = need_type.lower()
        if "流量" in kw or "data" in kw:
            filtered = [p for p in RECOMMEND_CATALOG if "流量" in p.get("suitableFor", "") or "流量" in p["offerName"]]
        elif "语音" in kw or "voice" in kw:
            filtered = [p for p in RECOMMEND_CATALOG if "通话" in p.get("voice", "")]
        elif "家庭" in kw or "融合" in kw or "宽带" in kw:
            filtered = [p for p in RECOMMEND_CATALOG if "家庭" in p.get("suitableFor", "") or "融合" in p.get("suitableFor", "")]
        elif "低价" in kw or "便宜" in kw or "学生" in kw:
            filtered = [p for p in RECOMMEND_CATALOG if "低" in p.get("suitableFor", "") or "学生" in p.get("suitableFor", "")]
    if not filtered:
        filtered = RECOMMEND_CATALOG
    return {
        "phone": phone,
        "needType": need_type or "全部",
        "recommendations": filtered,
        "_summary": f"为您推荐 {len(filtered)} 款套餐" + (f"（{need_type}方向）" if need_type else ""),
    }


# ── 下单 ─────────────────────────────────────────────────
def submit_order(phone: str, offer_id: str, offer_name: str | None = None) -> dict:
    order_id = f"ORD{datetime.now().strftime('%Y%m%d%H%M%S')}{random.randint(1000,9999)}"
    return {
        "phone": phone,
        "orderId": order_id,
        "offerId": offer_id,
        "offerName": offer_name or offer_id,
        "status": "submitted",
        "status_text": "已提交",
        "createTime": datetime.now().isoformat(timespec="seconds"),
        "_summary": f"订单 {order_id} 已提交，产品: {offer_name or offer_id}",
    }


# ── 知识库搜索（简单关键词匹配，运行时从 xlsx 加载） ────
_KLG_CACHE: list[dict] | None = None


def _load_klg() -> list[dict]:
    global _KLG_CACHE
    if _KLG_CACHE is not None:
        return _KLG_CACHE
    import os, openpyxl
    xlsx_path = os.path.join(os.path.dirname(__file__), "klg.xlsx")
    wb = openpyxl.load_workbook(xlsx_path, read_only=False)
    ws = wb.active
    rows = []
    for i in range(2, (ws.max_row or 1) + 1):
        q = ws.cell(i, 2).value
        if not q:
            continue
        rows.append({
            "id": i,
            "category": str(ws.cell(i, 1).value or ""),
            "question": str(q),
            "answer": str(ws.cell(i, 3).value or ""),
            "answer_id": ws.cell(i, 4).value,
            "cat1": str(ws.cell(i, 5).value or ""),
            "cat2": str(ws.cell(i, 6).value or ""),
        })
    wb.close()
    _KLG_CACHE = rows
    return rows


def search_knowledge(query: str, top_k: int = 5) -> dict:
    """简单关键词匹配知识库。生产环境应使用向量检索。"""
    klg = _load_klg()
    query_lower = query.lower()
    # 对中文查询：既按空格拆词，也用滑动窗口生成 2-4 字子串
    tokens = [t for t in query_lower.split() if t]
    if not tokens or len(tokens) == 1:
        base = tokens[0] if tokens else query_lower
        ngrams = set()
        for n in range(2, min(len(base) + 1, 5)):
            for i in range(len(base) - n + 1):
                ngrams.add(base[i:i + n])
        ngrams.add(base)
        tokens = list(ngrams) if ngrams else [base]
    scored = []
    for item in klg:
        score = 0
        q_text = item["question"].lower()
        a_text = item["answer"].lower()
        for word in tokens:
            if word in q_text:
                score += 3
            if word in a_text:
                score += 1
        if query_lower in q_text:
            score += 5
        if query_lower in a_text:
            score += 2
        if item["cat1"].lower() in query_lower or query_lower in item["cat1"].lower():
            score += 2
        if item["cat2"].lower() in query_lower or query_lower in item["cat2"].lower():
            score += 2
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda x: -x[0])
    results = []
    for score, item in scored[:top_k]:
        results.append({
            "category": item["cat2"] or item["cat1"],
            "question": item["question"][:200],
            "answer": item["answer"][:500],
            "relevance_score": score,
        })
    return {
        "query": query,
        "total_matched": len(scored),
        "results": results,
        "_summary": f"知识库搜索「{query}」命中 {len(scored)} 条，返回 Top-{len(results)}",
    }
