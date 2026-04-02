"""EOP 接口 Mock 响应数据
响应格式严格匹配接口文档，迁移生产环境只需设置 EOP_BASE_URL 即可。
"""
import copy
import json
import random
import uuid
from datetime import datetime, timedelta
from urllib.parse import quote


# ---------------------------------------------------------------------------
# 用户数据池（手机号 -> 用户画像）
# ---------------------------------------------------------------------------
MOCK_USERS = {
    "18018609133": {
        "name": "张三", "acct_cd": "23017525001", "cust_id": "229036863001",
        "cust_number": "202147958001", "status_cd": 1,
        "plan_name": "云宽带美好家5G融合129元", "plan_fee": 129,
        "data_gb": 30, "call_min": 300, "sms": 20,
        "broadband": True, "prod_inst": ["18018609133", "KD2008028801"],
        "email": "zhangsan@qq.com", "addr": "上海市浦东新区XX路100号",
        "points_total": 12500, "points_useable": 4200, "points_used": 8300,
        "points_expiring": 800, "points_expire_year": 2025, "star_level": 3,
    },
    "15088889999": {
        "name": "孙悦", "acct_cd": "23017525002", "cust_id": "229036863002",
        "cust_number": "202147958002", "status_cd": 1,
        "plan_name": "云宽带美好家5G融合159元", "plan_fee": 159,
        "data_gb": 40, "call_min": 500, "sms": 20,
        "broadband": True, "prod_inst": ["15088889999", "KD2008028802"],
        "email": "sunyue@163.com", "addr": "上海市徐汇区XX路200号",
        "points_total": 18000, "points_useable": 6500, "points_used": 11500,
        "points_expiring": 1200, "points_expire_year": 2025, "star_level": 4,
    },
    "13912345678": {
        "name": "李四", "acct_cd": "23017525003", "cust_id": "229036863003",
        "cust_number": "202147958003", "status_cd": 1,
        "plan_name": "5G畅享129元套餐", "plan_fee": 129,
        "data_gb": 30, "call_min": 500, "sms": 0,
        "broadband": False, "prod_inst": ["13912345678"],
        "email": "lisi@qq.com", "addr": "上海市静安区XX路300号",
        "points_total": 9800, "points_useable": 3504, "points_used": 6296,
        "points_expiring": 500, "points_expire_year": 2025, "star_level": 2,
    },
    "19916970157": {
        "name": "陈晨", "acct_cd": "23017525004", "cust_id": "229036863004",
        "cust_number": "202147958004", "status_cd": 1,
        "plan_name": "星卡29元套餐", "plan_fee": 29,
        "data_gb": 15, "call_min": 100, "sms": 0,
        "broadband": False, "prod_inst": ["19916970157"],
        "email": "chenchen@qq.com", "addr": "上海市嘉定区XX路400号",
        "points_total": 3200, "points_useable": 1100, "points_used": 2100,
        "points_expiring": 300, "points_expire_year": 2025, "star_level": 1,
    },
    "13800138000": {
        "name": "赵敏", "acct_cd": "23017525005", "cust_id": "229036863005",
        "cust_number": "202147958005", "status_cd": 1,
        "plan_name": "云宽带美好家5G融合229元", "plan_fee": 229,
        "data_gb": 100, "call_min": 1000, "sms": 20,
        "broadband": True, "prod_inst": ["13800138000", "KD2008028805", "17300001111"],
        "email": "zhaomin@qq.com", "addr": "上海市长宁区XX路500号",
        "points_total": 25000, "points_useable": 9800, "points_used": 15200,
        "points_expiring": 2000, "points_expire_year": 2025, "star_level": 5,
    },
    "15800001111": {
        "name": "王五", "acct_cd": "23017525006", "cust_id": "229036863006",
        "cust_number": "202147958006", "status_cd": 1,
        "plan_name": "臻享美好家5G-A融合299元", "plan_fee": 299,
        "data_gb": 150, "call_min": 2500, "sms": 20,
        "broadband": True, "prod_inst": ["15800001111", "KD2008028806", "17317482517"],
        "email": "wangwu@qq.com", "addr": "上海市杨浦区XX路600号",
        "points_total": 35000, "points_useable": 15863, "points_used": 19137,
        "points_expiring": 3500, "points_expire_year": 2025, "star_level": 5,
    },
}

DEFAULT_PHONE = "18018609133"

MOCK_PRODUCTS = {
    "plan": [
        {
            "productId": "plan_fusion_159",
            "productType": "plan",
            "productName": "云宽带美好家5G融合159元",
            "price": 159,
            "unit": "元/月",
            "tag": "家庭共享",
            "description": "40GB全国流量 + 500分钟 + 300M宽带 + IPTV",
            "highlights": ["40GB全国流量", "500分钟国内语音", "300M家庭宽带", "支持副卡共享"],
            "benefits": ["天翼云盘家庭版", "全屋WiFi优惠", "IPTV基础内容"],
            "effectiveDesc": "次月生效",
        },
        {
            "productId": "plan_fusion_229",
            "productType": "plan",
            "productName": "云宽带美好家5G融合229元",
            "price": 229,
            "unit": "元/月",
            "tag": "高流量家庭",
            "description": "100GB全国流量 + 1000分钟 + 500M宽带 + IPTV",
            "highlights": ["100GB全国流量", "1000分钟国内语音", "500M宽带", "多终端共享更稳"],
            "benefits": ["视频会员月包权益", "云盘家庭扩容", "智家设备折扣"],
            "effectiveDesc": "次月生效",
        },
        {
            "productId": "plan_fusion_299",
            "productType": "plan",
            "productName": "臻享美好家5G-A融合299元",
            "price": 299,
            "unit": "元/月",
            "tag": "旗舰配置",
            "description": "150GB全国流量 + 2500分钟 + 千兆宽带 + 会员权益",
            "highlights": ["150GB高流量", "2500分钟语音", "1000M千兆宽带", "适合重度家庭用网"],
            "benefits": ["影音娱乐会员", "云盘大空间", "上门网络服务"],
            "effectiveDesc": "次月生效",
        },
        {
            "productId": "plan_5g_129",
            "productType": "plan",
            "productName": "5G畅享129元套餐",
            "price": 129,
            "unit": "元/月",
            "tag": "个人升级",
            "description": "30GB全国流量 + 500分钟国内语音",
            "highlights": ["30GB通用流量", "500分钟语音", "适合单卡个人用户"],
            "benefits": ["可叠加流量包", "办理门槛低"],
            "effectiveDesc": "次月生效",
        },
        {
            "productId": "plan_star_39",
            "productType": "plan",
            "productName": "星卡39元升级版",
            "price": 39,
            "unit": "元/月",
            "tag": "轻量实惠",
            "description": "20GB定向流量 + 5GB通用流量 + 热门App权益",
            "highlights": ["门槛低", "适合低预算用户", "热门应用免流"],
            "benefits": ["新用户优惠", "热门APP特权"],
            "effectiveDesc": "次月生效",
        },
    ],
    "flow_pack": [
        {
            "productId": "flow_10g_month",
            "productType": "flow_pack",
            "productName": "10GB全国流量月包",
            "price": 30,
            "unit": "元/次",
            "tag": "当月补量",
            "description": "适合月底流量告急时快速补充",
            "dataAmount": "10GB",
            "validity": "订购后立即生效，当月有效",
            "highlights": ["全国通用", "即时到账", "月底补量更灵活"],
        },
        {
            "productId": "flow_20g_month",
            "productType": "flow_pack",
            "productName": "20GB全国流量加油包",
            "price": 50,
            "unit": "元/次",
            "tag": "高频补充",
            "description": "适合视频、会议、热点分享较多的用户",
            "dataAmount": "20GB",
            "validity": "订购后立即生效，当月有效",
            "highlights": ["全国通用", "支持热点分享", "适合中高流量缺口"],
        },
        {
            "productId": "flow_50g_halfyear",
            "productType": "flow_pack",
            "productName": "50GB畅享半年包",
            "price": 99,
            "unit": "元/次",
            "tag": "长效划算",
            "description": "适合长期流量偏高但暂不想升级主套餐",
            "dataAmount": "50GB",
            "validity": "订购后立即生效，180天有效",
            "highlights": ["折合单GB更低", "有效期长", "适合过渡期用户"],
        },
    ],
    "benefit": [
        {
            "productId": "benefit_video_29",
            "productType": "benefit",
            "productName": "影音娱乐权益包",
            "price": 29,
            "unit": "元/月",
            "tag": "热门会员",
            "description": "覆盖观影、听歌、云盘等高频数字生活场景",
            "rights": ["视频会员月卡", "音乐会员月卡", "天翼云盘扩容"],
            "highlights": ["一包多权益", "适合家庭娱乐", "线上开通方便"],
            "effectiveDesc": "订购成功后立即生效",
        },
        {
            "productId": "benefit_travel_39",
            "productType": "benefit",
            "productName": "出行生活权益包",
            "price": 39,
            "unit": "元/月",
            "tag": "差旅出行",
            "description": "适合经常出差、出行的用户，覆盖出行优惠与保障",
            "rights": ["打车立减券", "机场休息室权益", "酒店折扣权益"],
            "highlights": ["出差通勤更省", "多场景可用", "权益到账快"],
            "effectiveDesc": "订购成功后立即生效",
        },
        {
            "productId": "benefit_cloud_19",
            "productType": "benefit",
            "productName": "家庭云盘权益包",
            "price": 19,
            "unit": "元/月",
            "tag": "家庭共享",
            "description": "适合家庭照片、视频备份与多端共享",
            "rights": ["2TB家庭云盘", "自动备份", "家庭共享相册"],
            "highlights": ["适合家庭长期使用", "多终端同步", "数据更安心"],
            "effectiveDesc": "订购成功后立即生效",
        },
    ],
}

BASE_ORDERS = {
    "18018609133": [
        {
            "orderId": "OD202603280001",
            "productId": "benefit_cloud_19",
            "productType": "benefit",
            "productName": "家庭云盘权益包",
            "amountFen": 1900,
            "status": "ACTIVE",
            "statusText": "已生效",
            "payStatus": "PAID",
            "payStatusText": "已支付",
            "createdAt": "2026-03-28 10:15",
            "effectiveTime": "2026-03-28 10:16",
            "payBefore": "",
            "channel": "AI推荐",
            "description": "家庭云盘扩容与共享权益",
        }
    ],
    "15800001111": [
        {
            "orderId": "OD202603290021",
            "productId": "benefit_video_29",
            "productType": "benefit",
            "productName": "影音娱乐权益包",
            "amountFen": 2900,
            "status": "PENDING_PAYMENT",
            "statusText": "待支付",
            "payStatus": "PENDING",
            "payStatusText": "待支付",
            "createdAt": "2026-03-29 20:40",
            "effectiveTime": "支付成功后立即生效",
            "payBefore": "2026-03-30 23:59",
            "channel": "AI推荐",
            "description": "覆盖视频、音乐、云盘的数字娱乐权益",
        }
    ],
}

ORDER_STORE = copy.deepcopy(BASE_ORDERS)
SMS_CODE_STORE = {}


def _flow_seq() -> str:
    return uuid.uuid4().hex


def _rng(*vals) -> random.Random:
    return random.Random("|".join(str(v) for v in vals))


def _get_user(phone: str) -> dict:
    if phone in MOCK_USERS:
        row = copy.deepcopy(MOCK_USERS[phone])
        row["login_phone"] = phone
        row["owner_phone"] = phone
        row["is_sub_card"] = False
        return row
    for owner_phone, item in MOCK_USERS.items():
        prod_inst = item.get("prod_inst", []) if isinstance(item.get("prod_inst"), list) else []
        if phone in prod_inst:
            row = copy.deepcopy(item)
            row["login_phone"] = phone
            row["owner_phone"] = owner_phone
            row["is_sub_card"] = phone != owner_phone
            return row
    row = copy.deepcopy(MOCK_USERS[DEFAULT_PHONE])
    row["login_phone"] = phone or DEFAULT_PHONE
    row["owner_phone"] = DEFAULT_PHONE
    row["is_sub_card"] = False
    return row


def _billing_profile(user: dict) -> dict:
    owner_phone = str(user.get("owner_phone") or user.get("login_phone") or "").strip()
    plan_name = str(user.get("plan_name", "") or "").strip()
    billing_type = "预付费" if "星卡" in plan_name or owner_phone in {"19916970157"} else "后付费"
    fee_cycle_type = "年付费" if owner_phone in {"13800138000"} else "月付费"
    customer_type = "非公客" if owner_phone in {"15088889999"} else "公客"
    payment_mode = "线上支付" if billing_type != "预付费" else "不支持充值"
    return {
        "billing_type": billing_type,
        "fee_cycle_type": fee_cycle_type,
        "customer_type": customer_type,
        "payment_mode": payment_mode,
    }


def _restriction_profile(phone: str, user: dict) -> dict:
    owner_phone = str(user.get("owner_phone") or phone or "").strip()
    flagged = {
        "freeze": owner_phone in {"15088889999"},
        "not_expired": owner_phone in {"13800138000"},
        "blacklist": owner_phone in {"15800001111"},
        "risky_plan": owner_phone in {"19916970157"},
        "non_public_customer": owner_phone in {"15088889999"},
    }
    labels = {
        "freeze": "账户冻结",
        "not_expired": "合约未到期",
        "blacklist": "黑名单",
        "risky_plan": "风险套餐",
        "non_public_customer": "非公客",
    }
    details = {
        "freeze": "当前账户存在冻结状态，请先解冻后再办理。",
        "not_expired": "当前号码仍在合约期内，部分套餐暂不支持线上订购。",
        "blacklist": "系统识别为黑名单号码，暂不支持线上办理。",
        "risky_plan": "当前在用风险套餐，需先核验套餐规则。",
        "non_public_customer": "当前账号类型为非公客，建议走专属客户经理或政企渠道。",
    }
    items = []
    for code in ["freeze", "not_expired", "blacklist", "risky_plan", "non_public_customer"]:
        hit = bool(flagged.get(code))
        items.append({
            "code": code,
            "label": labels[code],
            "blocked": hit,
            "warning": hit,
            "detail": details[code] if hit else "",
        })
    blocked_items = [item["label"] for item in items if item.get("blocked")]
    return {
        "canOrder": not blocked_items,
        "summary": "当前设备未命中订购限制，可继续办理。" if not blocked_items else f"当前设备存在订购限制：{'、'.join(blocked_items)}",
        "restrictionItems": items,
    }


def _mobile_members(user: dict) -> list[str]:
    mobile_members = []
    for item in [str(user.get("owner_phone") or user.get("login_phone") or "").strip(), *[str(num).strip() for num in user.get("prod_inst", []) if str(num).strip()]]:
        if not item or item in mobile_members or not item.isdigit() or len(item) != 11:
            continue
        mobile_members.append(item)
    return mobile_members


def _shared_usage_profile(user: dict) -> tuple[str, str, list[dict], float, float]:
    mobile_members = _mobile_members(user)
    login_phone = str(user.get("login_phone") or user.get("owner_phone") or DEFAULT_PHONE).strip() or DEFAULT_PHONE
    owner_phone = str(user.get("owner_phone") or login_phone).strip() or login_phone
    data_total_gb = float(user.get("data_gb", 0) or 0)
    sub_cards = []
    shared_used_total = 0.0
    shared_left_total = 0.0
    for idx, sub_phone in enumerate([num for num in mobile_members if num != owner_phone], start=1):
        ratio = 0.12 + idx * 0.08
        sub_used = round(max(0.3, data_total_gb * min(ratio, 0.38)), 2)
        sub_total = round(max(sub_used + 0.5, data_total_gb * min(ratio + 0.06, 0.42)), 2)
        sub_left = round(max(0.0, sub_total - sub_used), 2)
        shared_used_total += sub_used
        shared_left_total += sub_left
        sub_cards.append({
            "phone": sub_phone,
            "dataTotal": f"{sub_total:.2f}",
            "dataUsed": f"{sub_used:.2f}",
            "dataLeft": f"{sub_left:.2f}",
            "unit": "GB",
        })
    return owner_phone, login_phone, sub_cards, round(shared_used_total, 2), round(shared_left_total, 2)


def _accu_member_row(member_phone: str, member_role: str, total: float, used: float, left: float, unit: str, offer_name: str, is_current: bool) -> dict:
    return {
        "memberAccNum": member_phone,
        "memberRole": member_role,
        "offerName": offer_name,
        "totalValue": f"{max(0.0, total):.2f}" if unit == "GB" else str(int(max(0.0, round(total)))),
        "usedValue": f"{max(0.0, used):.2f}" if unit == "GB" else str(int(max(0.0, round(used)))),
        "leftValue": f"{max(0.0, left):.2f}" if unit == "GB" else str(int(max(0.0, round(left)))),
        "unit": unit,
        "isCurrentLogin": is_current,
    }


def _accu_use_detail_rows(phone: str, user: dict, unit_type_id: str, share_flag: str, offer_name: str = "") -> list[dict]:
    owner_phone, login_phone, sub_cards, _, _ = _shared_usage_profile(user)
    current_phone = str(user.get("login_phone") or phone or owner_phone).strip() or owner_phone
    current_role = "sub_card" if bool(user.get("is_sub_card")) else "master_card"
    if unit_type_id == "3":
        if share_flag == "1" and sub_cards:
            owner_total = round(max(1.0, float(user.get("data_gb", 0) or 0)), 2)
            owner_used = round(max(0.3, min(owner_total, owner_total * 0.54)), 2)
            owner_left = round(max(0.0, owner_total - owner_used), 2)
            rows = [
                _accu_member_row(owner_phone, "master_card", owner_total, owner_used, owner_left, "GB", offer_name, owner_phone == login_phone)
            ]
            for item in sub_cards:
                rows.append(
                    _accu_member_row(
                        str(item.get("phone", "")).strip(),
                        "sub_card",
                        float(item.get("dataTotal", 0) or 0),
                        float(item.get("dataUsed", 0) or 0),
                        float(item.get("dataLeft", 0) or 0),
                        "GB",
                        offer_name,
                        str(item.get("phone", "")).strip() == login_phone,
                    )
                )
            return rows
        total = round(max(1.0, float(user.get("data_gb", 0) or 0)), 2)
        used = round(max(0.3, min(total, total * 0.58)), 2)
        left = round(max(0.0, total - used), 2)
        return [_accu_member_row(current_phone, current_role, total, used, left, "GB", offer_name, True)]
    if unit_type_id == "1":
        total = float(user.get("call_min", 0) or 0)
        if total <= 0:
            return []
        used = round(max(1.0, min(total, total * 0.46)), 2)
        left = round(max(0.0, total - used), 2)
        return [_accu_member_row(current_phone, current_role, total, used, left, "分钟", offer_name, True)]
    if unit_type_id == "2":
        total = float(user.get("sms", 0) or 0)
        if total <= 0:
            return []
        used = round(max(0.0, min(total, total * 0.22)), 2)
        left = round(max(0.0, total - used), 2)
        return [_accu_member_row(current_phone, current_role, total, used, left, "条", offer_name, True)]
    return []


def _normalize_recommend_mode(value: str) -> str:
    mapping = {
        "": "套餐",
        "all": "套餐",
        "套餐": "套餐",
        "plan": "套餐",
        "流量": "流量",
        "flow": "流量",
        "flow_pack": "流量",
        "积分": "积分",
        "points": "积分",
        "沪呗": "沪呗",
        "hubei": "沪呗",
        "权益": "积分",
        "benefit": "积分",
    }
    key = str(value or "").strip().lower()
    return mapping.get(key, mapping.get(str(value or "").strip(), "套餐"))


def _recommend_group_meta(mode: str) -> tuple[str, str, str]:
    if mode == "套餐":
        return "plan", "套餐推荐", "结合当前资费档位，仅保留不低于当前资费的升级方案。"
    if mode == "流量":
        return "flow_pack", "流量推荐", "结合当前套餐使用情况，优先推荐更贴近缺口的流量补充方案。"
    if mode == "积分":
        return "benefit", "积分可兑推荐", "结合当前积分余额，优先推荐可用积分兑换或抵扣的权益产品。"
    return "benefit", "沪呗可兑推荐", "结合当前沪呗余额，优先推荐可用沪呗兑换或抵扣的权益产品。"


def _benefit_exchange_view(items: list[dict], mode: str, user: dict) -> list[dict]:
    result = []
    score_balance = int(user.get("points_useable", 0) or 0)
    hubei_balance = int(max(12, round(score_balance / 350)))
    for idx, item in enumerate(items, start=1):
        row = copy.deepcopy(item)
        if mode == "积分":
            redeem_points = int(float(row.get("price", 0) or 0) * 100)
            row["tag"] = "积分可兑"
            row["redeemLabel"] = f"可用积分 {score_balance}"
            row["recommendedReason"] = f"当前可用积分约 {score_balance}，该权益支持积分兑换或积分抵扣。"
            row["highlights"] = list(row.get("highlights", [])) + [f"参考兑换 {redeem_points}积分"]
        else:
            redeem_hubei = max(1, int(float(row.get("price", 0) or 0) // 2) + idx)
            row["tag"] = "沪呗可兑"
            row["redeemLabel"] = f"可用沪呗 {hubei_balance}"
            row["recommendedReason"] = f"当前可用沪呗约 {hubei_balance}，该权益支持沪呗兑换或抵扣。"
            row["highlights"] = list(row.get("highlights", [])) + [f"参考兑换 {redeem_hubei}沪呗"]
        result.append(row)
    return result


def _find_user_by_acct(acct_cd: str) -> dict:
    for phone, u in MOCK_USERS.items():
        if u["acct_cd"] == acct_cd:
            row = copy.deepcopy(u)
            row["login_phone"] = phone
            row["owner_phone"] = phone
            row["is_sub_card"] = False
            return row
    row = copy.deepcopy(MOCK_USERS[DEFAULT_PHONE])
    row["login_phone"] = DEFAULT_PHONE
    row["owner_phone"] = DEFAULT_PHONE
    row["is_sub_card"] = False
    return row


def _find_user_by_cust_number(cust_number: str) -> dict:
    for phone, u in MOCK_USERS.items():
        if u["cust_number"] == cust_number:
            row = copy.deepcopy(u)
            row["login_phone"] = phone
            row["owner_phone"] = phone
            row["is_sub_card"] = False
            return row
    row = copy.deepcopy(MOCK_USERS[DEFAULT_PHONE])
    row["login_phone"] = DEFAULT_PHONE
    row["owner_phone"] = DEFAULT_PHONE
    row["is_sub_card"] = False
    return row


def _normalize_product_type(value: str) -> str:
    mapping = {
        "": "all",
        "all": "all",
        "套餐": "plan",
        "plan": "plan",
        "plans": "plan",
        "流量包": "flow_pack",
        "flow": "flow_pack",
        "flow_pack": "flow_pack",
        "权益": "benefit",
        "权益产品": "benefit",
        "benefit": "benefit",
    }
    return mapping.get(str(value).strip().lower() if isinstance(value, str) else "", "all")


def _get_products(product_type: str) -> list[dict]:
    ptype = _normalize_product_type(product_type)
    if ptype == "all":
        return [copy.deepcopy(item) for group in MOCK_PRODUCTS.values() for item in group]
    return [copy.deepcopy(item) for item in MOCK_PRODUCTS.get(ptype, [])]


def _find_product(product_id: str) -> dict | None:
    for group in MOCK_PRODUCTS.values():
        for item in group:
            if item["productId"] == product_id:
                return copy.deepcopy(item)
    return None


def _get_orders(phone: str) -> list[dict]:
    if phone not in ORDER_STORE:
        ORDER_STORE[phone] = []
    return ORDER_STORE[phone]


def _find_order(phone: str, order_id: str) -> dict | None:
    for item in _get_orders(phone):
        if item.get("orderId") == order_id:
            return item
    return None


def _price_text(product: dict) -> str:
    return f"{product.get('price', 0)}{product.get('unit', '')}"


def _compare_summary(product_type: str) -> str:
    if product_type == "plan":
        return "已为您按月费、流量档位、语音和宽带配置做横向对比，可重点看预算与家庭共享需求。"
    if product_type == "flow_pack":
        return "已为您按价格、流量额度和有效期做横向对比，适合判断短期补量还是长效过渡。"
    if product_type == "benefit":
        return "已为您按月费、权益内容和到账时效做横向对比，可重点看使用场景是否高频。"
    return "已为您整理产品差异，方便您快速做选择。"


def _preview_summary(product: dict) -> str:
    product_type = product.get("productType", "")
    if product_type == "plan":
        return "套餐类产品通常按规则在次月生效，请在确认资费与配置后再提交订单。"
    if product_type == "flow_pack":
        return "流量包支付成功后通常即时到账，适合当月补量或阶段性叠加。"
    if product_type == "benefit":
        return "权益类产品支付成功后一般立即生效，请确认您确实需要对应会员或数字权益。"
    return "请确认产品内容、资费和生效规则后再继续提交订单。"


def _expand_compare_products(product_ids: list[str], base_product_id: str = "", product_type: str = "all") -> tuple[str, list[dict]]:
    selected: list[dict] = []
    seen: set[str] = set()
    base = _find_product(base_product_id) if base_product_id else None
    compare_type = _normalize_product_type(product_type or (base.get("productType") if base else "all"))

    def add(item: dict | None):
        if not item:
            return
        if compare_type != "all" and item.get("productType") != compare_type:
            return
        pid = item.get("productId")
        if not pid or pid in seen:
            return
        selected.append(copy.deepcopy(item))
        seen.add(pid)

    if base:
        if compare_type == "all":
            compare_type = base.get("productType", "plan")
        add(base)

    for pid in product_ids:
        item = _find_product(pid)
        if item and compare_type == "all":
            compare_type = item.get("productType", "plan")
        add(item)

    if compare_type == "all":
        compare_type = "plan"

    pool = _get_products(compare_type)
    anchor = base or (selected[0] if selected else (pool[0] if pool else None))
    if anchor:
        pool.sort(key=lambda item: (item.get("productId") in seen, abs(float(item.get("price", 0)) - float(anchor.get("price", 0))), float(item.get("price", 0))))
    for item in pool:
        if len(selected) >= 3:
            break
        add(item)

    return compare_type, selected


def _recommend_reason(user: dict, product_type: str, intent: str) -> str:
    plan_fee = int(user.get("plan_fee", 0))
    data_gb = int(user.get("data_gb", 0))
    broadband = bool(user.get("broadband"))
    intent = str(intent).strip()
    if product_type == "plan":
        if broadband:
            return f"您当前在用{user['plan_name']}，如希望提升家庭共享流量或宽带规格，可优先考虑融合套餐升级。"
        if data_gb <= 30:
            return "您当前套餐流量档位偏基础，若近期有追剧、热点、出行等需求，升级主套餐更稳妥。"
        return "结合您当前资费与用量，推荐更贴近您预算和使用强度的主套餐。"
    if product_type == "flow_pack":
        if "流量" in intent or data_gb <= 30:
            return "您有明显的补流量诉求，叠加流量包比直接改主套餐更灵活。"
        return "如果只是阶段性流量偏高，先叠加流量包通常更划算。"
    if product_type == "benefit":
        if plan_fee >= 159:
            return "您当前资费档位较高，叠加数字权益产品更容易放大套餐价值。"
        return "如果您更关注会员、云盘、出行等体验，权益产品比改单卡套餐更直接。"
    return "结合您的当前档位、使用习惯和咨询意图，为您做了综合推荐。"


def _ok(result: dict) -> dict:
    return {
        "data": {
            "resCode": "0000",
            "resMsg": "",
            "resObj": {
                "isSuccess": 1,
                "needTerminate": False,
                "flowSeq": _flow_seq(),
                "result": result,
            },
        }
    }


# ---------------------------------------------------------------------------
# 1. eop.BpnbrListBySerialnbr  设备号 -> 分账序号
# ---------------------------------------------------------------------------
def _mock_acct_by_serial(param: dict) -> dict:
    phone = param.get("accNum", DEFAULT_PHONE)
    user = _get_user(phone)
    return _ok({"eopData": [{"acctCd": user["acct_cd"]}]})


# ---------------------------------------------------------------------------
# 2. eop.ZwzxBalanceRecord  分账序号 -> 余额
# ---------------------------------------------------------------------------
def _mock_balance(param: dict) -> dict:
    acct_no = param.get("params", {}).get("accountNo", "")
    user = _find_user_by_acct(acct_no)
    r = _rng("bal", acct_no)

    fee = user["plan_fee"]
    balance = int((fee * (1.5 + r.random() * 2.0)) * 100)
    zy = int(balance * (0.4 + r.random() * 0.2))
    ty = balance - zy
    should_charge = 0 if balance > 0 else abs(balance)

    return _ok({
        "eopData": {
            "result": {
                "show_ye_ty": str(ty),
                "bill_list": [],
                "accountName": user["name"],
                "show_ye": str(balance),
                "accountType": "",
                "show_ye_zy": str(zy),
                "bill_ye": {
                    "sumBalanceZY": str(zy),
                    "code": "0",
                    "sumBalanceTY": str(ty),
                    "yz_desc": "",
                    "yz_balance": "",
                    "sumBalance_new": "",
                },
                "resultCode": "0",
                "accountAddr": "***",
                "type": "005",
                "bill_qf": {
                    "code": "0",
                    "shouldCharge": str(should_charge),
                },
                "resultMsg": "操作成功",
            },
            "code": "0",
        },
    })


# ---------------------------------------------------------------------------
# 3. eop.ZwzxPackageRecord  手机号+月份 -> 套餐用量
# ---------------------------------------------------------------------------
def _mock_package(param: dict) -> dict:
    params = param.get("params", {})
    phone = params.get("deviceNo", DEFAULT_PHONE)
    month = params.get("month", datetime.now().strftime("%Y%m"))
    user = _get_user(phone)
    r = _rng("pkg", phone, month)

    now = datetime.now()
    end_time = f"{now.year}{now.month:02d}{28}235959"

    # --- 流量 ---
    data_total_gb = float(user["data_gb"])
    data_used_gb = round(data_total_gb * (0.25 + r.random() * 0.60), 2)
    data_left_gb = round(max(0, data_total_gb - data_used_gb), 2)
    data_pct = f"{int(100 * data_left_gb / data_total_gb) if data_total_gb else 0}%"

    data_init_kb = int(data_total_gb * 1048576)
    data_usage_kb = int(data_used_gb * 1048576)

    flow_group = {
        "show_left_value": f"{data_left_gb:.2f}",
        "grounName": "国内通用流量",
        "show_all_value": f"{data_total_gb:.2f}",
        "show_used_unit": "GB",
        "show_used_value": f"{data_used_gb:.2f}",
        "show_all_unit": "GB",
        "show_left_unit": "GB",
        "percent": data_pct,
        "resultList": [
            {
                "show_left_value": f"{data_left_gb:.2f}",
                "unitTypeId": "3",
                "shareFlag": "1" if user.get("broadband") else "0",
                "show_used_unit": "GB",
                "percent": data_pct,
                "show_all_unit": "GB",
                "accuTypeAttr": "33110011" if user.get("broadband") else "33110001",
                "offer": "套餐销售品",
                "unitType": "流量（KB）",
                "initVal": str(data_init_kb),
                "offerType": "11",
                "obj_AccuUseDetailQry": "[]",
                "show_all_value": f"{data_total_gb:.2f}",
                "offerInstId": str(132002193699200 + hash(phone) % 1000),
                "offerName": user["plan_name"],
                "accuTypeId": "273381",
                "accuId": str(7107000051604000 + hash(phone) % 10000),
                "excessFlag": "0",
                "accuTypeName": f"国内上网含{int(data_total_gb)}GB" + ("(群组共享)" if user.get("broadband") else ""),
                "shareList": "[]",
                "useProirity": "1",
                "usageVal": str(data_usage_kb),
                "offerId": str(100000279704000 + hash(phone) % 10000),
                "endTime": end_time,
                "show_used_value": f"{data_used_gb:.2f}",
                "show_left_unit": "GB",
            }
        ],
    }

    # --- 语音 ---
    call_total = int(user["call_min"])
    call_used = int(call_total * (0.15 + r.random() * 0.55))
    call_left = max(0, call_total - call_used)
    call_pct = f"{int(100 * call_left / call_total) if call_total else 0}%"

    voice_group = {
        "show_left_value": str(call_left),
        "grounName": "国内通用语音",
        "show_all_value": str(call_total),
        "show_used_unit": "分钟",
        "show_used_value": str(call_used),
        "show_all_unit": "分钟",
        "show_left_unit": "分钟",
        "percent": call_pct,
        "resultList": [
            {
                "show_left_value": str(call_left),
                "unitTypeId": "1",
                "shareFlag": "1" if user.get("broadband") else "0",
                "show_used_unit": "分钟",
                "percent": call_pct,
                "show_all_unit": "分钟",
                "accuTypeAttr": "13110011" if user.get("broadband") else "13110001",
                "offer": "套餐销售品",
                "unitType": "分钟",
                "initVal": str(call_total),
                "offerType": "11",
                "obj_AccuUseDetailQry": "[]",
                "show_all_value": str(call_total),
                "offerInstId": str(132002193699200 + hash(phone) % 1000),
                "offerName": user["plan_name"],
                "accuTypeId": "273382",
                "accuId": str(7107000354987000 + hash(phone) % 10000),
                "excessFlag": "0",
                "accuTypeName": f"国内通话含{call_total}分钟" + ("群组共享" if user.get("broadband") else ""),
                "shareList": "[]",
                "useProirity": "10",
                "usageVal": str(call_used),
                "offerId": str(100000279704000 + hash(phone) % 10000),
                "endTime": end_time,
                "show_used_value": str(call_used),
                "show_left_unit": "分钟",
            }
        ],
    }

    result_list = [flow_group, voice_group]

    # --- 短信 ---
    sms_total = int(user.get("sms", 0))
    if sms_total > 0:
        sms_used = int(sms_total * r.random() * 0.5)
        sms_left = max(0, sms_total - sms_used)
        sms_pct = f"{int(100 * sms_left / sms_total)}%"
        sms_group = {
            "show_left_value": str(sms_left),
            "grounName": "国内通用短信",
            "show_all_value": str(sms_total),
            "show_used_unit": "次数",
            "show_used_value": str(sms_used),
            "show_all_unit": "次数",
            "show_left_unit": "次数",
            "percent": sms_pct,
            "resultList": [
                {
                    "show_left_value": str(sms_left),
                    "unitTypeId": "2",
                    "shareFlag": "1",
                    "show_used_unit": "次数",
                    "percent": sms_pct,
                    "show_all_unit": "次数",
                    "accuTypeAttr": "43110001",
                    "offer": "套餐销售品",
                    "unitType": "次数",
                    "initVal": str(sms_total),
                    "offerType": "11",
                    "obj_AccuUseDetailQry": "[]",
                    "show_all_value": str(sms_total),
                    "offerInstId": str(132002193699200 + hash(phone) % 1000),
                    "offerName": user["plan_name"],
                    "accuTypeId": "273386",
                    "accuId": str(7107000354987000 + hash(phone) % 5000),
                    "excessFlag": "0",
                    "accuTypeName": f"点对点短信、彩信（国内）含{sms_total}条",
                    "shareList": "[]",
                    "useProirity": "14",
                    "usageVal": str(sms_used),
                    "offerId": str(100000279704000 + hash(phone) % 10000),
                    "endTime": end_time,
                    "show_used_value": str(sms_used),
                    "show_left_unit": "次数",
                }
            ],
        }
        result_list.append(sms_group)

    # 套餐外用量
    excess_sms = int(r.random() * 5)
    excess_voice = int(r.random() * 3)
    excess_flow_kb = int(r.random() * 1024)
    info = [
        {"show_value": str(excess_sms), "show_name": "套餐外短信", "show_unit": "条"},
        {"show_value": str(excess_voice), "show_name": "套餐外语音", "show_unit": "分钟"},
        {"show_value": str(excess_flow_kb), "show_name": "套餐外流量", "show_unit": "KB"},
    ]

    offer_inst_info = []
    offer_seen = set()
    for grp in result_list:
        for detail in grp.get("resultList", []):
            offer_inst_id = int(detail.get("offerInstId", "0") or 0)
            if offer_inst_id in offer_seen:
                continue
            offer_seen.add(offer_inst_id)
            accu_item = {
                "ownerType": 2,
                "dayCardFlag": "0",
                "unitTypeId": detail.get("unitTypeId", ""),
                "accuTypeId": int(detail.get("accuTypeId", "0") or 0),
                "accuId": int(detail.get("accuId", "0") or 0),
                "excessFlag": detail.get("excessFlag", "0"),
                "ownerId": offer_inst_id,
                "accuTypeName": detail.get("accuTypeName", ""),
                "accuTypeAttr": detail.get("accuTypeAttr", ""),
                "initVal": int(detail.get("initVal", "0") or 0),
                "useProirity": detail.get("useProirity", ""),
                "usageVal": int(detail.get("usageVal", "0") or 0),
                "accuVal": 0,
                "beginTime": f"{month}01000000",
                "endTime": detail.get("endTime", end_time),
            }
            offer_inst_info.append(
                {
                    "offerType": detail.get("offerType", ""),
                    "offerName": detail.get("offerName", ""),
                    "shareFlag": detail.get("shareFlag", "0"),
                    "offerId": int(detail.get("offerId", "0") or 0),
                    "offerInstId": offer_inst_id,
                    "accuQryList": [accu_item],
                }
            )

    mobile_members = []
    login_phone = str(user.get("login_phone") or phone).strip() or phone
    owner_phone = str(user.get("owner_phone") or phone).strip() or phone
    carry_over_left = round(max(0.0, data_left_gb * 0.35), 2)
    owner_phone, login_phone, sub_cards, shared_used_total, shared_left_total = _shared_usage_profile(user)
    login_view = next((copy.deepcopy(item) for item in sub_cards if item.get("phone") == login_phone), None)
    login_role = "sub_card" if bool(user.get("is_sub_card")) else "master_card"
    for grp in result_list:
        for detail in grp.get("resultList", []):
            detail["obj_AccuUseDetailQry"] = json.dumps(
                _accu_use_detail_rows(
                    phone,
                    user,
                    str(detail.get("unitTypeId", "") or ""),
                    str(detail.get("shareFlag", "0") or "0"),
                    str(detail.get("offerName", "") or ""),
                ),
                ensure_ascii=False,
            )

    return _ok({
        "eopData": {
            "result": {
                "resultCode": "0",
                "resultList": result_list,
                "resultMsg": "操作成功",
            },
            "code": "0",
            "records": {
                "billingCycle": int(month),
                "destinationAttr": "2",
                "resultCode": "0",
                "accNbr": phone,
                "resultMsg": "操作成功",
                "offerInstInfo": offer_inst_info,
            },
            "info": info,
            "loginRole": login_role,
            "carryOverFlow": {
                "supported": True,
                "left": f"{carry_over_left:.2f}",
                "unit": "GB",
                "desc": "剩余流量中支持按规则结转至下月的参考值",
            },
            "sharedUsage": {
                "ownerPhone": owner_phone,
                "loginPhone": login_phone,
                "subCards": sub_cards,
                "sharedUsed": f"{shared_used_total:.2f}",
                "sharedLeft": f"{shared_left_total:.2f}",
                "unit": "GB",
                "loginView": login_view,
            },
        },
    })


# ---------------------------------------------------------------------------
# 4. eop.InvoiceBalanceListInfo  账单查询
# ---------------------------------------------------------------------------
def _next_month(dt: datetime) -> datetime:
    return (dt.replace(day=28) + timedelta(days=4)).replace(day=1)


def _mock_bill(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    acct_id = spi_param.get("acctId", param.get("acctId", ""))
    from_date = spi_param.get("fromDate", param.get("fromDate", ""))
    to_date = spi_param.get("toDate", param.get("toDate", ""))
    user = _find_user_by_acct(acct_id)
    billing = _billing_profile(user)
    r = _rng("bill", acct_id, from_date, to_date)

    try:
        start = datetime.strptime(from_date, "%Y-%m")
        end = datetime.strptime(to_date, "%Y-%m")
    except ValueError:
        start = datetime.now().replace(day=1) - timedelta(days=60)
        end = datetime.now().replace(day=1)

    if start > end:
        start, end = end, start

    bills = []
    cur = start
    i = 0
    while cur <= end:
        fee = user["plan_fee"]
        charge = int(max(1000, (fee + r.uniform(-22, 45)) * 100))
        is_latest = cur.year == end.year and cur.month == end.month
        paid = (not is_latest and r.random() > 0.08) or (is_latest and r.random() > 0.55)
        paid_amt = -charge if paid else int(-charge * r.uniform(0.0, 0.6))
        due = max(0, charge + paid_amt)

        bills.append({
            "totalAdjAmount": 0,
            "transitTotalAdjAmount": 0,
            "isOCSAcct": "",
            "totalPaid": paid_amt,
            "balanceDue": due,
            "toDate": (cur.replace(day=28)).strftime("%Y-%m-%d"),
            "billType": "01",
            "billDate": cur.replace(day=1).strftime("%Y-%m-%d"),
            "lateFeeAmount": 0,
            "invoceNo": f"303{(int(acct_id[-6:] or '0') + i * 7919) % 900000000 + 100000000}",
            "fromDate": cur.replace(day=1).strftime("%Y-%m-%d"),
            "newCharge": charge,
            "totalAdj": 0,
            "lateFee": "0",
            "status": "2" if due == 0 else "1",
        })
        i += 1
        cur = _next_month(cur)

    return _ok({
        "eopData": {
            "paymentMode": "现金",
            "count": len(bills),
            "reseller": 0,
            "invoiceBalanceList": bills,
            "acctName": user["name"],
            "billingType": billing.get("billing_type", ""),
            "feeCycleType": billing.get("fee_cycle_type", ""),
            "billingJudge": {
                "isPrepaid": billing.get("billing_type") == "预付费",
                "isPostpaid": billing.get("billing_type") == "后付费",
                "isYearly": billing.get("fee_cycle_type") == "年付费",
                "isMonthly": billing.get("fee_cycle_type") == "月付费",
            },
        },
    })


# ---------------------------------------------------------------------------
# 5. eop.CapAccountHttps  获取设备号的客户标识
# ---------------------------------------------------------------------------
def _mock_user_info(param: dict) -> dict:
    phone = param.get("spiParam", {}).get("accNum", DEFAULT_PHONE)
    user = _get_user(phone)
    billing = _billing_profile(user)

    return _ok({
        "eopData": {
            "custId": user["cust_id"],
            "custNumber": user["cust_number"],
            "custName": user["name"],
            "account": [
                {
                    "invFormatCustomizeRels": [
                        {
                            "billPrefCd": "12",
                            "invFormatCustomizeId": 400057043200 + hash(phone) % 1000,
                            "eMail": user["email"],
                            "postMethod": 9,
                            "contactAddr": user["addr"],
                            "ebillSmsNoticeFlg": "2",
                            "collectionCd": "1000",
                            "postcode": "200000",
                            "lateFeeFlag": 1,
                            "ebillPhone": phone,
                            "ebillSmsFlg": "1",
                            "postCycle": 1,
                        }
                    ],
                    "acctCd": user["acct_cd"],
                    "extAcct": [],
                    "acctId": 400039637800 + hash(phone) % 1000,
                    "statusCd": user["status_cd"],
                    "prodInst": [{"accNum": num} for num in user["prod_inst"]],
                    "acctName": user["name"],
                    "acctBillingType": f"{billing.get('billing_type', '后付费')}|1200",
                    "feeCycleType": billing.get("fee_cycle_type", "月付费"),
                    "feeCycleTypeText": billing.get("fee_cycle_type", "月付费"),
                    "customerType": billing.get("customer_type", "公客"),
                    "paymentPlans": [
                        {
                            "paymentMethod": "100000",
                            "paymentMethodStr": "现金|100000",
                        }
                    ],
                }
            ],
        },
    })


# ---------------------------------------------------------------------------
# 6. eop.userBasicInfo  获取设备号积分信息
# ---------------------------------------------------------------------------
def _mock_points(param: dict) -> dict:
    cust_number = param.get("custId", "")
    user = _find_user_by_cust_number(cust_number)
    available_hubei = int(max(12, round((user.get("points_useable", 0) or 0) / 350)))

    return _ok({
        "eopData": {
            "code": "00000",
            "message": "成功",
            "body": {
                "sumPoints": user["points_total"],
                "useablePoints": user["points_useable"],
                "score": user["points_expiring"],
                "sumscore": int(user["points_expiring"] * 1.2),
                "usedPoints": user["points_used"],
                "year": user["points_expire_year"],
                "currMonthPoints": int(user["points_useable"] * 0.04),
                "statusCd": "1000" if user["status_cd"] == 1 else "1100",
                "availableHuBei": available_hubei,
                "availableHuBeiText": f"可用沪呗 {available_hubei}",
            },
        },
    })


# ---------------------------------------------------------------------------
# 7. eop.ProductRecommendHttps  获取推荐产品
# ---------------------------------------------------------------------------
def _mock_product_recommend(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("deviceNo", spi_param.get("accNum", DEFAULT_PHONE))
    intent = str(spi_param.get("intent", "")).strip()
    mode = _normalize_recommend_mode(spi_param.get("recommendMode", spi_param.get("productType", spi_param.get("focus", "套餐"))))
    start_index = max(1, int(spi_param.get("startIndex", spi_param.get("startNo", 1)) or 1))
    count = max(1, int(spi_param.get("count", spi_param.get("limit", spi_param.get("topK", 3))) or 3))
    user = _get_user(phone)

    group_type, group_name, default_reason = _recommend_group_meta(mode)
    items = _get_products(group_type)
    if mode == "套餐":
        items = [item for item in items if float(item.get("price", 0) or 0) >= float(user.get("plan_fee", 0) or 0)]
        items.sort(key=lambda item: (float(item.get("price", 0) or 0) == float(user.get("plan_fee", 0) or 0), abs(float(item.get("price", 0) or 0) - float(user.get("plan_fee", 0) or 0)), float(item.get("price", 0) or 0)))
    elif mode == "流量":
        items.sort(key=lambda item: (abs(float(item.get("price", 0) or 0) - (50 if int(user.get("data_gb", 0) or 0) <= 30 else 99)), float(item.get("price", 0) or 0)))
    else:
        items = _benefit_exchange_view(items, mode, user)
        items.sort(key=lambda item: float(item.get("price", 0) or 0))

    total_available = len(items)
    start_zero = min(max(start_index - 1, 0), max(total_available - 1, 0) if total_available else 0)
    picked = items[start_zero:start_zero + count] if items else []
    enriched = []
    for item in picked:
        row = copy.deepcopy(item)
        row["priceText"] = f"{row['price']}{row['unit']}"
        row["recommendedReason"] = row.get("recommendedReason") or default_reason or _recommend_reason(user, group_type, intent)
        row["actionMessage"] = f"我想办理产品 {row['productId']}（{row['productName']}）"
        enriched.append(row)
    groups = [
        {
            "groupType": group_type,
            "groupName": group_name,
            "recommendMode": mode,
            "rankStart": start_index,
            "rankEnd": start_index + max(len(enriched) - 1, 0),
            "totalAvailable": total_available,
            "recommendReason": default_reason or _recommend_reason(user, group_type, intent),
            "products": enriched,
        }
    ]

    profile = {
        "custName": user["name"],
        "currentPlan": user["plan_name"],
        "currentPlanFee": user["plan_fee"],
        "dataGb": user["data_gb"],
        "callMin": user["call_min"],
        "hasBroadband": user["broadband"],
        "recommendMode": mode,
    }
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "推荐成功",
                "summary": f"已按{mode}模式返回推荐位次 {start_index} ~ {start_index + max(len(enriched) - 1, 0)} 的候选结果。",
                "profile": profile,
                "recommendationGroups": groups,
            }
        }
    )


def _mock_accu_use_detail(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", spi_param.get("deviceNo", DEFAULT_PHONE))
    unit_type_id = str(spi_param.get("unitTypeId", "") or "")
    share_flag = str(spi_param.get("shareFlag", "1" if _get_user(phone).get("broadband") else "0") or "0")
    offer_name = str(spi_param.get("offerName", "") or "")
    user = _get_user(phone)
    detail_list = _accu_use_detail_rows(phone, user, unit_type_id, share_flag, offer_name)
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "成功",
                "offerInstId": str(spi_param.get("offerInstId", "") or ""),
                "accuId": str(spi_param.get("accuId", "") or ""),
                "detailList": detail_list,
            }
        }
    )


def _mock_asset_info_by_service(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("serviceId", spi_param.get("deviceNo", spi_param.get("accNum", DEFAULT_PHONE)))
    user = _get_user(phone)
    billing = _billing_profile(user)
    restriction = _restriction_profile(phone, user)
    asset_info_list = []
    for item in restriction.get("restrictionItems", []):
        asset_info_list.append(
            {
                "assetCode": str(item.get("code", "") or ""),
                "assetName": str(item.get("label", "") or ""),
                "assetValue": "1" if item.get("blocked") or item.get("warning") else "0",
                "resultFlag": "1" if item.get("blocked") else ("2" if item.get("warning") else "0"),
                "resultMsg": str(item.get("detail", "") or ""),
                "blocked": bool(item.get("blocked")),
                "warning": bool(item.get("warning")),
            }
        )
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "成功",
                "serviceId": phone,
                "billingType": billing.get("billing_type", ""),
                "feeCycleType": billing.get("fee_cycle_type", ""),
                "customerType": billing.get("customer_type", ""),
                "canOrder": restriction.get("canOrder", True),
                "summary": restriction.get("summary", ""),
                "assetInfoList": asset_info_list,
                "restrictionItems": restriction.get("restrictionItems", []),
            }
        }
    )


def _mock_device_restriction(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("deviceNo", spi_param.get("accNum", DEFAULT_PHONE))
    user = _get_user(phone)
    result = _restriction_profile(phone, user)
    billing = _billing_profile(user)
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "校验成功",
                "deviceNo": phone,
                "billingType": billing.get("billing_type", ""),
                "feeCycleType": billing.get("fee_cycle_type", ""),
                "customerType": billing.get("customer_type", ""),
                **result,
            }
        }
    )


def _mock_recharge_link(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("deviceNo", spi_param.get("accNum", DEFAULT_PHONE))
    amount = float(spi_param.get("amount", spi_param.get("amountYuan", 0)) or 0)
    user = _get_user(phone)
    billing = _billing_profile(user)
    mall_path = f"/newmall/recharge/index.html?accNum={phone}&amount={round(amount, 2):.2f}"
    sso_token = uuid.uuid4().hex
    if billing.get("billing_type") == "预付费":
        return _ok(
            {
                "eopData": {
                    "code": "2",
                    "message": "预付费用户当前不支持通过该接口生成充值链接",
                    "billingType": billing.get("billing_type", ""),
                    "feeCycleType": billing.get("fee_cycle_type", ""),
                    "canRecharge": False,
                }
            }
        )
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "生成成功",
                "billingType": billing.get("billing_type", ""),
                "feeCycleType": billing.get("fee_cycle_type", ""),
                "paymentMode": billing.get("payment_mode", "线上支付"),
                "amountYuan": round(amount, 2),
                "canRecharge": True,
                "mallPath": mall_path,
                "ssoToken": sso_token,
                "rechargeUrl": f"https://pay.mock.189.cn/recharge/{phone}?amount={round(amount, 2)}",
            }
        }
    )


def _extract_mock_eop_data(payload: dict) -> dict:
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    res_obj = data.get("resObj", {}) if isinstance(data, dict) else {}
    result = res_obj.get("result", {}) if isinstance(res_obj, dict) else {}
    eop_data = result.get("eopData", {}) if isinstance(result, dict) else {}
    return eop_data if isinstance(eop_data, dict) else {}


def _dispatch_wrapped_request(param: dict, enrich_recharge: bool = False) -> dict:
    key = str(param.get("key", "") or "").strip()
    nested = param.get("param", {}) if isinstance(param.get("param"), dict) else {}
    if key in {"requestOpenApi", "requestOpenApiAes"}:
        return _ok({"eopData": {"code": "1", "message": f"未知的接口标识: {key}"}})
    handler = _MOCK_HANDLERS.get(key)
    if not handler and key.startswith("eop."):
        handler = _MOCK_HANDLERS.get(f"/api/eop/{key}/requestEop")
    if not handler:
        return _ok({"eopData": {"code": "1", "message": f"未知的接口标识: {key}"}})
    response = handler(nested)
    if enrich_recharge and key == "eop.RechargeLinkHttps":
        eop = _extract_mock_eop_data(response)
        if eop.get("code") == "0":
            enriched = dict(eop)
            if not enriched.get("mallPath"):
                spi_param = nested.get("spiParam", {}) if isinstance(nested.get("spiParam"), dict) else {}
                phone = str(spi_param.get("deviceNo", spi_param.get("accNum", DEFAULT_PHONE)) or DEFAULT_PHONE).strip() or DEFAULT_PHONE
                amount = round(float(spi_param.get("amount", spi_param.get("amountYuan", 0)) or 0), 2)
                enriched["mallPath"] = f"/newmall/recharge/index.html?accNum={phone}&amount={amount:.2f}"
            if not enriched.get("ssoToken"):
                enriched["ssoToken"] = uuid.uuid4().hex
            return _ok({"eopData": enriched})
    return response


def _mock_request_open_api(param: dict) -> dict:
    return _dispatch_wrapped_request(param, enrich_recharge=False)


def _mock_request_open_api_aes(param: dict) -> dict:
    return _dispatch_wrapped_request(param, enrich_recharge=True)


def _mock_emall(param: dict) -> dict:
    phone = str(param.get("phone", param.get("accNum", DEFAULT_PHONE)) or DEFAULT_PHONE).strip() or DEFAULT_PHONE
    token = str(param.get("token", param.get("ssoToken", "")) or "").strip() or uuid.uuid4().hex
    target_path = str(param.get("path", param.get("mallPath", "/newmall/index.html")) or "/newmall/index.html").strip() or "/newmall/index.html"
    login_url = f"https://sh.189.cn/emall/sso-login?token={token}&redirect={quote(target_path, safe='')}"
    return {
        "code": "0",
        "message": "成功",
        "data": {
            "phone": phone,
            "token": token,
            "loginUrl": login_url,
            "targetPath": target_path,
        },
    }


# ---------------------------------------------------------------------------
# 8. eop.ProductCompareHttps  推荐产品对比
# ---------------------------------------------------------------------------
def _mock_product_compare(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    base_product_id = str(spi_param.get("baseProductId", "")).strip()
    raw_ids = spi_param.get("productIds", [])
    if isinstance(raw_ids, str):
        product_ids = [p.strip() for p in raw_ids.split(",") if p.strip()]
    elif isinstance(raw_ids, list):
        product_ids = [str(p).strip() for p in raw_ids if str(p).strip()]
    else:
        product_ids = []
    compare_type, items = _expand_compare_products(product_ids, base_product_id, str(spi_param.get("productType", "all")))
    user = _get_user(phone)
    if not items:
        return _ok({"eopData": {"code": "1", "message": "没有可对比的产品"}})

    compare_items = []
    for item in items:
        row = copy.deepcopy(item)
        row["priceText"] = _price_text(row)
        row["selected"] = row.get("productId") == base_product_id
        compare_items.append(row)

    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "对比成功",
                "compareType": compare_type,
                "summary": _compare_summary(compare_type),
                "profile": {
                    "custName": user["name"],
                    "currentPlan": user["plan_name"],
                    "currentPlanFee": user["plan_fee"],
                },
                "baseProductId": base_product_id,
                "compareItems": compare_items,
            }
        }
    )


# ---------------------------------------------------------------------------
# 9. eop.OrderListHttps  查询当前订单
# ---------------------------------------------------------------------------
def _mock_order_list(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    status = str(spi_param.get("status", "all") or "all").strip().upper()
    order_id = str(spi_param.get("orderId", "") or "").strip()
    orders = copy.deepcopy(_get_orders(phone))
    if order_id:
        orders = [o for o in orders if o.get("orderId") == order_id]
    if status not in {"", "ALL"}:
        orders = [o for o in orders if o.get("status", "").upper() == status or o.get("payStatus", "").upper() == status]
    orders.sort(key=lambda item: item.get("createdAt", ""), reverse=True)

    summary = {
        "total": len(orders),
        "pendingPayment": sum(1 for o in orders if o.get("payStatus") == "PENDING"),
        "active": sum(1 for o in orders if o.get("status") == "ACTIVE"),
        "cancelled": sum(1 for o in orders if o.get("status") == "CANCELLED"),
    }
    return _ok({"eopData": {"code": "0", "message": "成功", "summary": summary, "orders": orders}})


# ---------------------------------------------------------------------------
# 10. eop.OrderPreviewHttps  下单预览
# ---------------------------------------------------------------------------
def _mock_order_preview(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    product_id = str(spi_param.get("productId", "")).strip()
    pay_mode = str(spi_param.get("payMode", "在线支付") or "在线支付").strip()
    product = _find_product(product_id)
    if not product:
        return _ok({"eopData": {"code": "1", "message": f"未找到产品 {product_id}"}})
    restriction = _restriction_profile(phone, _get_user(phone))
    if not restriction.get("canOrder"):
        return _ok({"eopData": {"code": "2", "message": restriction.get("summary", "当前设备暂不支持订购"), **restriction}})

    existing = next((copy.deepcopy(o) for o in _get_orders(phone) if o.get("productId") == product_id and o.get("status") in {"PENDING_PAYMENT", "ACTIVE"}), None)
    preview_id = f"PV{datetime.now().strftime('%Y%m%d%H%M%S')}{str(random.randint(0, 999)).zfill(3)}"
    row = copy.deepcopy(product)
    row["priceText"] = _price_text(row)
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "预下单成功",
                "previewId": preview_id,
                "payMode": pay_mode,
                "payModeOptions": ["在线支付", "话费账户支付"],
                "summary": _preview_summary(product),
                "tips": [
                    "提交订单前请确认资费、生效规则和适用范围。",
                    "若已存在同产品订单，建议优先继续处理原订单。",
                    "下单前需要先获取验证码，最终提交订单仅接受卡片按钮确认。",
                ],
                "product": row,
                "duplicateOrder": existing,
                "restrictionSummary": restriction.get("summary", ""),
                "restrictionItems": restriction.get("restrictionItems", []),
            }
        }
    )


def _mock_request_order_sms_code(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    product_id = str(spi_param.get("productId", "")).strip()
    preview_id = str(spi_param.get("previewId", "")).strip()
    pay_mode = str(spi_param.get("payMode", "在线支付") or "在线支付").strip()
    restriction = _restriction_profile(phone, _get_user(phone))
    if not restriction.get("canOrder"):
        return _ok({"eopData": {"code": "2", "message": restriction.get("summary", "当前设备暂不支持订购"), **restriction}})
    duplicate = next((copy.deepcopy(o) for o in _get_orders(phone) if o.get("productId") == product_id and o.get("status") in {"PENDING_PAYMENT", "ACTIVE"}), None)
    if duplicate and duplicate.get("payStatus") == "PENDING":
        return _ok({"eopData": {"code": "3", "message": "已存在待支付订单，请先继续处理现有订单", "duplicateOrder": duplicate}})
    if duplicate and duplicate.get("payStatus") == "PAID":
        return _ok({"eopData": {"code": "6", "message": "该产品已有已生效订单，无需重复下单", "duplicateOrder": duplicate}})
    verification_seq = f"VC{datetime.now().strftime('%Y%m%d%H%M%S')}{str(random.randint(0, 999)).zfill(3)}"
    debug_code = str(random.randint(100000, 999999)).zfill(6)
    SMS_CODE_STORE[verification_seq] = {
        "phone": phone,
        "product_id": product_id,
        "preview_id": preview_id,
        "pay_mode": pay_mode,
        "sms_code": debug_code,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "验证码已发送",
                "verificationSeq": verification_seq,
                "maskedTarget": f"{phone[:3]}****{phone[-4:]}",
                "payMode": pay_mode,
                "previewId": preview_id,
                "debugSmsCode": debug_code,
            }
        }
    )


# ---------------------------------------------------------------------------
# 11. eop.OrderSubmitHttps  提交订单
# ---------------------------------------------------------------------------
def _mock_submit_order(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    product_id = str(spi_param.get("productId", "")).strip()
    pay_mode = str(spi_param.get("payMode", "在线支付") or "在线支付").strip()
    preview_id = str(spi_param.get("previewId", "") or "").strip()
    verification_seq = str(spi_param.get("verificationSeq", "") or "").strip()
    sms_code = str(spi_param.get("smsCode", "") or "").strip()
    source_scene = str(spi_param.get("sourceScene", "AI下单") or "AI下单").strip()
    product = _find_product(product_id)
    if not product:
        return _ok({"eopData": {"code": "1", "message": f"未找到产品 {product_id}"}})
    restriction = _restriction_profile(phone, _get_user(phone))
    if not restriction.get("canOrder"):
        return _ok({"eopData": {"code": "2", "message": restriction.get("summary", "当前设备暂不支持订购"), **restriction}})
    orders = _get_orders(phone)
    existing = next((o for o in orders if o.get("productId") == product_id and o.get("status") in {"PENDING_PAYMENT", "ACTIVE"}), None)
    if existing:
        if existing.get("payStatus") == "PAID":
            return _ok(
                {
                    "eopData": {
                        "code": "6",
                        "message": "该产品已有已生效订单，无需重复下单",
                        "duplicate": True,
                        "verificationSeq": verification_seq,
                        "order": copy.deepcopy(existing),
                    }
                }
            )
        pay_url = f"https://pay.mock.189.cn/order/{existing['orderId']}"
        return _ok(
            {
                "eopData": {
                    "code": "0",
                    "message": "已存在可继续处理的订单",
                    "duplicate": True,
                    "verificationSeq": verification_seq,
                    "order": copy.deepcopy(existing),
                    "payment": {
                        "payMode": pay_mode,
                        "payUrl": pay_url,
                        "payCode": f"PAY{existing['orderId'][-8:]}",
                        "payBefore": existing.get("payBefore", ""),
                    },
                }
            }
        )
    if not verification_seq or verification_seq not in SMS_CODE_STORE:
        return _ok({"eopData": {"code": "4", "message": "验证码会话不存在或已失效，请重新获取验证码"}})
    sms_session = SMS_CODE_STORE.get(verification_seq) or {}
    if sms_session.get("phone") != phone or sms_session.get("product_id") != product_id:
        return _ok({"eopData": {"code": "4", "message": "验证码与当前订购产品不匹配，请重新获取验证码"}})
    if preview_id and sms_session.get("preview_id") and preview_id != sms_session.get("preview_id"):
        return _ok({"eopData": {"code": "4", "message": "预览信息已变化，请重新获取验证码"}})
    if sms_session.get("sms_code") != sms_code:
        return _ok({"eopData": {"code": "5", "message": "验证码错误，请核对后重试"}})

    now = datetime.now()
    order_id = f"OD{now.strftime('%Y%m%d%H%M%S')}{str(random.randint(0, 9999)).zfill(4)}"
    pay_before = (now + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")
    order = {
        "orderId": order_id,
        "productId": product["productId"],
        "productType": product["productType"],
        "productName": product["productName"],
        "amountFen": int(float(product["price"]) * 100),
        "status": "PENDING_PAYMENT",
        "statusText": "待支付",
        "payStatus": "PENDING",
        "payStatusText": "待支付",
        "createdAt": now.strftime("%Y-%m-%d %H:%M"),
        "effectiveTime": product.get("effectiveDesc", "支付成功后生效"),
        "payBefore": pay_before,
        "channel": source_scene,
        "description": product.get("description", ""),
    }
    orders.insert(0, order)
    SMS_CODE_STORE.pop(verification_seq, None)
    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "下单成功",
                "duplicate": False,
                "verificationSeq": verification_seq,
                "order": copy.deepcopy(order),
                "payment": {
                    "payMode": pay_mode,
                    "payUrl": f"https://pay.mock.189.cn/order/{order_id}",
                    "payCode": f"PAY{order_id[-8:]}",
                    "payBefore": pay_before,
                },
            }
        }
    )


# ---------------------------------------------------------------------------
# 12. eop.OrderPayConfirmHttps  支付完成确认
# ---------------------------------------------------------------------------
def _mock_confirm_payment(param: dict) -> dict:
    spi_param = param.get("spiParam", {}) if isinstance(param.get("spiParam"), dict) else {}
    phone = spi_param.get("accNum", DEFAULT_PHONE)
    order_id = str(spi_param.get("orderId", "")).strip()
    order = _find_order(phone, order_id)
    if not order:
        return _ok({"eopData": {"code": "1", "message": f"未找到订单 {order_id}"}})

    if order.get("payStatus") != "PAID":
        paid_at = datetime.now().strftime("%Y-%m-%d %H:%M")
        order["payStatus"] = "PAID"
        order["payStatusText"] = "已支付"
        order["status"] = "ACTIVE"
        order["statusText"] = "已生效"
        order["paidAt"] = paid_at
        if not order.get("effectiveTime") or "支付成功后" in str(order.get("effectiveTime", "")):
            order["effectiveTime"] = paid_at

    return _ok(
        {
            "eopData": {
                "code": "0",
                "message": "支付确认成功",
                "order": copy.deepcopy(order),
                "paymentResult": {
                    "payStatus": order.get("payStatus"),
                    "payStatusText": order.get("payStatusText"),
                    "paidAt": order.get("paidAt", ""),
                },
            }
        }
    )


# ---------------------------------------------------------------------------
# 路由分发
# ---------------------------------------------------------------------------
_MOCK_HANDLERS = {
    "eop.BpnbrListBySerialnbr": _mock_acct_by_serial,
    "/api/eop/eop.BpnbrListBySerialnbr/requestEop": _mock_acct_by_serial,
    "eop.ZwzxBalanceRecord": _mock_balance,
    "/api/eop/eop.ZwzxBalanceRecord/requestEop": _mock_balance,
    "eop.ZwzxPackageRecord": _mock_package,
    "/api/eop/eop.ZwzxPackageRecord/requestEop": _mock_package,
    "eop.AccuUseDetailQry": _mock_accu_use_detail,
    "/api/eop/eop.AccuUseDetailQry/requestEop": _mock_accu_use_detail,
    "eop.InvoiceBalanceListInfo": _mock_bill,
    "eop.InvoiceBalanceListInfoHttps": _mock_bill,
    "/api/eop/eop.InvoiceBalanceListInfoHttps/requestEop": _mock_bill,
    "eop.CapAccountHttps": _mock_user_info,
    "/api/eop/eop.CapAccountHttps/requestEop": _mock_user_info,
    "eop.userBasicInfo": _mock_points,
    "/api/eop/eop.userBasicInfo/requestEop": _mock_points,
    "eop.AssetInfoByServiceIdSalHttps": _mock_asset_info_by_service,
    "/api/eop/eop.AssetInfoByServiceIdSalHttps/requestEop": _mock_asset_info_by_service,
    "eop.ProductRecommendHttps": _mock_product_recommend,
    "/api/eop/eop.ProductRecommendHttps/requestEop": _mock_product_recommend,
    "eop.ProductUnifiedRecommendHttps": _mock_product_recommend,
    "/api/eop/eop.ProductUnifiedRecommendHttps/requestEop": _mock_product_recommend,
    "eop.DeviceRestrictionCheckHttps": _mock_device_restriction,
    "/api/eop/eop.DeviceRestrictionCheckHttps/requestEop": _mock_device_restriction,
    "eop.RechargeLinkHttps": _mock_recharge_link,
    "/api/eop/eop.RechargeLinkHttps/requestEop": _mock_recharge_link,
    "eop.ProductCompareHttps": _mock_product_compare,
    "/api/eop/eop.ProductCompareHttps/requestEop": _mock_product_compare,
    "eop.OrderListHttps": _mock_order_list,
    "/api/eop/eop.OrderListHttps/requestEop": _mock_order_list,
    "eop.OrderPreviewHttps": _mock_order_preview,
    "/api/eop/eop.OrderPreviewHttps/requestEop": _mock_order_preview,
    "eop.OrderSmsCodeHttps": _mock_request_order_sms_code,
    "/api/eop/eop.OrderSmsCodeHttps/requestEop": _mock_request_order_sms_code,
    "eop.OrderSubmitHttps": _mock_submit_order,
    "/api/eop/eop.OrderSubmitHttps/requestEop": _mock_submit_order,
    "eop.OrderPayConfirmHttps": _mock_confirm_payment,
    "/api/eop/eop.OrderPayConfirmHttps/requestEop": _mock_confirm_payment,
    "requestOpenApi": _mock_request_open_api,
    "/api/eop/requestOpenApi": _mock_request_open_api,
    "requestOpenApiAes": _mock_request_open_api_aes,
    "/api/eop/requestOpenApiAes": _mock_request_open_api_aes,
    "/zengpiao/testEop": _mock_request_open_api,
    "/api/sso/emall": _mock_emall,
}


def get_mock_response(key: str, param: dict) -> dict:
    handler = _MOCK_HANDLERS.get(key)
    if not handler:
        return {
            "data": {
                "resCode": "9999",
                "resMsg": f"未知的接口标识: {key}",
                "resObj": {"isSuccess": 0, "result": {}},
            }
        }
    return handler(param)
