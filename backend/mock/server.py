"""
伪接口服务：模拟电信业务 API
启动方式: python -m mock.server
"""
from fastapi import FastAPI, Query
from pydantic import BaseModel
from mock.data import build_package, build_balance, build_bill, USERS, DEFAULT_USER

app = FastAPI(title="电信伪接口")


class PackageReq(BaseModel):
    business: str = "zwzxPackageRecord"
    params: dict = {}


class BalanceReq(BaseModel):
    business: str = "QryBalanceRecord"
    params: dict = {}


@app.post("/api/package")
async def package_query(req: PackageReq):
    phone = req.params.get("deviceNo", DEFAULT_USER)
    month = req.params.get("month", "202501")
    return build_package(phone, month)


@app.post("/api/balance")
async def balance_query(req: BalanceReq):
    acct = req.params.get("accountNo", "20004225889")
    month = req.params.get("month", "202501")
    return build_balance(acct, month)


@app.get("/api/bill")
async def bill_query(
    acctId: str = Query(default="20004225889"),
    fromDate: str = Query(default="2025-01"),
    toDate: str = Query(default="2025-06"),
):
    return build_bill(acctId, fromDate, toDate)


@app.get("/api/user")
async def user_info(phone: str = Query(default=DEFAULT_USER)):
    user = USERS.get(phone, USERS[DEFAULT_USER])
    return {"code": "0", "data": user}


if __name__ == "__main__":
    import uvicorn
    from config import settings
    uvicorn.run("mock.server:app", host="0.0.0.0", port=settings.mock_port, reload=True)
