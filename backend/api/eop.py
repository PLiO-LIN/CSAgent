"""EOP 接口网关客户端
当 eop_base_url 为空时使用本地 mock 数据，填写后直接请求真实接口。
迁移生产环境只需在 .env 中设置 EOP_BASE_URL 即可。
"""
import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)


def response_root(data: dict) -> dict:
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    return data if isinstance(data, dict) else {}


def extract_eop_data(data: dict):
    root = response_root(data)
    return root.get("resObj", {}).get("result", {}).get("eopData", {})


async def post_eop(path: str, body: dict) -> dict:
    if not settings.eop_base_url:
        from api.mock_responses import get_mock_response
        return get_mock_response(path, body)

    url = f"{settings.eop_base_url.rstrip('/')}{path}"
    headers = {"Content-Type": "application/json"}
    if settings.eop_token:
        headers["token"] = settings.eop_token

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.exception("EOP request failed: path=%s", path)
        return {
            "data": {
                "resCode": "9999",
                "resMsg": f"接口请求失败: {e}",
                "resObj": {"isSuccess": 0, "result": {}},
            }
        }


async def get_acct_cd(phone: str) -> str | None:
    data = await post_eop("/api/eop/eop.BpnbrListBySerialnbr/requestEop", {"accNum": phone})
    eop_data = extract_eop_data(data)
    if isinstance(eop_data, list) and eop_data:
        return eop_data[0].get("acctCd")
    return None


async def get_cap_account_eop(phone: str) -> dict:
    data = await post_eop(
        "/api/eop/eop.CapAccountHttps/requestEop",
        {
            "headers": {"opt_tye": "01"},
            "spiParam": {"accNum": phone},
        },
    )
    eop_data = extract_eop_data(data)
    return eop_data if isinstance(eop_data, dict) else {}


async def call_eop(key: str, param: dict, extra_fields: dict | None = None) -> dict:
    path_map = {
        "eop.BpnbrListBySerialnbr": "/api/eop/eop.BpnbrListBySerialnbr/requestEop",
        "eop.CapAccountHttps": "/api/eop/eop.CapAccountHttps/requestEop",
        "eop.AccuUseDetailQry": "/api/eop/eop.AccuUseDetailQry/requestEop",
        "eop.AssetInfoByServiceIdSalHttps": "/api/eop/eop.AssetInfoByServiceIdSalHttps/requestEop",
        "eop.ZwzxPackageRecord": "/api/eop/eop.ZwzxPackageRecord/requestEop",
        "eop.ZwzxBalanceRecord": "/api/eop/eop.ZwzxBalanceRecord/requestEop",
        "eop.InvoiceBalanceListInfo": "/api/eop/eop.InvoiceBalanceListInfoHttps/requestEop",
        "eop.InvoiceBalanceListInfoHttps": "/api/eop/eop.InvoiceBalanceListInfoHttps/requestEop",
        "eop.userBasicInfo": "/api/eop/eop.userBasicInfo/requestEop",
        "eop.ProductRecommendHttps": "/api/eop/eop.ProductRecommendHttps/requestEop",
        "eop.ProductCompareHttps": "/api/eop/eop.ProductCompareHttps/requestEop",
        "eop.OrderListHttps": "/api/eop/eop.OrderListHttps/requestEop",
        "eop.OrderPreviewHttps": "/api/eop/eop.OrderPreviewHttps/requestEop",
        "eop.OrderSubmitHttps": "/api/eop/eop.OrderSubmitHttps/requestEop",
        "eop.OrderPayConfirmHttps": "/api/eop/eop.OrderPayConfirmHttps/requestEop",
        "requestOpenApi": "/api/eop/requestOpenApi",
        "requestOpenApiAes": "/api/eop/requestOpenApiAes",
    }
    path = path_map.get(key, f"/api/eop/{key}/requestEop")
    body = dict(param)
    if extra_fields:
        body.update(extra_fields)
    return await post_eop(path, body)
