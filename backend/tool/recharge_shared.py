import math
from api.eop import post_eop, get_acct_cd, get_cap_account_eop, extract_eop_data, response_root


async def load_balance_snapshot(phone: str) -> tuple[dict, str]:
    phone = str(phone or '').strip()
    acct_cd = await get_acct_cd(phone)
    if not acct_cd:
        return {}, f"未查到手机号 {phone} 对应的分账序号"
    cap_account = await get_cap_account_eop(phone)
    account_list = cap_account.get("account", []) if isinstance(cap_account.get("account"), list) else []
    primary_account = account_list[0] if account_list else {}
    billing_type_raw = str(primary_account.get("acctBillingType", "") or "").strip()
    billing_type = billing_type_raw.split("|", 1)[0].strip() if billing_type_raw else ""
    fee_cycle_type = str(primary_account.get("feeCycleType", "") or primary_account.get("feeCycleTypeText", "")).strip()

    resp = await post_eop(
        "/api/eop/eop.ZwzxBalanceRecord/requestEop",
        {
            "business": "zwzx_BalanceRecord",
            "params": {"accountNo": acct_cd},
        },
    )

    root = response_root(resp)
    if root.get("resCode") != "0000":
        return {}, root.get("resMsg") or "接口请求失败"

    eop = extract_eop_data(resp)
    result = eop.get("result", {})
    if result.get("resultCode") != "0":
        return {}, result.get("resultMsg", "查询失败")

    show_ye = int(result.get("show_ye", "0"))
    show_ye_ty = int(result.get("show_ye_ty", "0"))
    show_ye_zy = int(result.get("show_ye_zy", "0"))
    should_charge = int(result.get("bill_qf", {}).get("shouldCharge", "0"))

    balance_yuan = show_ye / 100
    balance_ty_yuan = show_ye_ty / 100
    balance_zy_yuan = show_ye_zy / 100
    arrears_yuan = should_charge / 100

    return {
        "phone": phone,
        "account_name": result.get("accountName", ""),
        "balance_yuan": balance_yuan,
        "balance_ty_yuan": balance_ty_yuan,
        "balance_zy_yuan": balance_zy_yuan,
        "arrears_yuan": arrears_yuan,
        "balance": f"{balance_yuan:.2f}",
        "balance_ty": f"{balance_ty_yuan:.2f}",
        "balance_zy": f"{balance_zy_yuan:.2f}",
        "arrears": f"{arrears_yuan:.2f}",
        "is_arrears": show_ye < 0 or should_charge > 0,
        "billing_type": billing_type,
        "fee_cycle_type": fee_cycle_type,
        "can_recharge": billing_type != "预付费",
    }, ""


def normalize_amount_yuan(value: object) -> float:
    text = str(value or '').strip().replace('元', '').replace('￥', '').replace(',', '')
    if not text:
        return 0.0
    try:
        amount = float(text)
    except (TypeError, ValueError):
        return 0.0
    return amount if amount > 0 else 0.0


def amount_text(amount: float) -> str:
    rounded = round(float(amount or 0), 2)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.2f}".rstrip('0').rstrip('.')


def recharge_prefill(snapshot: dict, requested_amount_yuan: object = 0) -> tuple[float, str, str]:
    requested = normalize_amount_yuan(requested_amount_yuan)
    arrears_yuan = float(snapshot.get("arrears_yuan", 0) or 0)
    if requested > 0:
        return requested, "模型预填", f"已根据当前对话为您预填充值金额 {amount_text(requested)} 元。"
    if arrears_yuan > 0:
        suggested = max(float(math.ceil(arrears_yuan)), 1.0)
        return suggested, "欠费推荐", f"当前账户仍有 {snapshot.get('arrears', '0.00')} 元欠费，已按欠费情况预填充值金额。"
    return 100.0, "常用档位", "当前账户暂无欠费，可直接使用常用充值档位，或手动修改金额。"


def recharge_presets(snapshot: dict, draft_amount_yuan: float) -> list[str]:
    draft = amount_text(draft_amount_yuan)
    arrears_yuan = float(snapshot.get("arrears_yuan", 0) or 0)
    raw = [draft]
    if arrears_yuan > 0:
        raw.extend(["50", "100", "200"])
    else:
        raw.extend(["100", "300", "500", "1000"])

    result: list[str] = []
    seen = set()
    for item in raw:
        text = amount_text(normalize_amount_yuan(item))
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def build_recharge_card(snapshot: dict, requested_amount_yuan: object = 0, *, title: str = "话费充值") -> dict:
    draft_amount_yuan, source_label, summary = recharge_prefill(snapshot, requested_amount_yuan)
    draft_amount = amount_text(draft_amount_yuan)
    billing_type = str(snapshot.get("billing_type", "") or "").strip()
    fee_cycle_type = str(snapshot.get("fee_cycle_type", "") or "").strip()
    can_recharge = bool(snapshot.get("can_recharge", True))
    actions = []
    if can_recharge:
        actions.append(
            {
                "label": "获取充值链接",
                "contentTemplate": "请继续为我生成{{amount}}元话费的充值链接",
                "displayTemplate": "请继续为我生成{{amount}}元话费的充值链接",
                "requiresValidation": True,
            }
        )
    actions.append(
        {
            "label": "重新查询余额",
            "content": "请再帮我查一下当前账户余额",
            "displayContent": "请再帮我查一下当前账户余额",
            "requiresValidation": False,
        }
    )
    return {
        "type": "recharge",
        "title": title,
        "phone": snapshot.get("phone", ""),
        "accountName": snapshot.get("account_name", ""),
        "summary": summary,
        "balance": snapshot.get("balance", "0.00"),
        "arrears": snapshot.get("arrears", "0.00"),
        "balanceTY": snapshot.get("balance_ty", "0.00"),
        "balanceZY": snapshot.get("balance_zy", "0.00"),
        "billingType": billing_type,
        "feeCycleType": fee_cycle_type,
        "canRecharge": can_recharge,
        "editableFields": [
            {
                "key": "amount",
                "label": "充值金额",
                "inputType": "currency",
                "value": draft_amount,
                "unit": "元",
                "placeholder": "请输入充值金额",
                "required": True,
                "presets": recharge_presets(snapshot, draft_amount_yuan),
                "sourceLabel": source_label,
            }
        ],
        "actions": actions,
    }
