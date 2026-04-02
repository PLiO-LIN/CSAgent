from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from db.engine import get_db
from db import crud

router = APIRouter(prefix="/api/sessions", tags=["session"])


class CreateSessionReq(BaseModel):
    title: str = ""


class SessionResp(BaseModel):
    id: str
    title: str
    created_at: float

    class Config:
        from_attributes = True


class MessageResp(BaseModel):
    id: str
    role: str
    agent: str
    model: str
    created_at: float
    parts: list[dict]

    class Config:
        from_attributes = True


@router.post("", response_model=SessionResp)
async def create_session(req: CreateSessionReq, db: AsyncSession = Depends(get_db)):
    session = await crud.create_session(db, req.title)
    return session


@router.get("", response_model=list[SessionResp])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    return await crud.list_sessions(db)


@router.get("/{sid}", response_model=SessionResp)
async def get_session(sid: str, db: AsyncSession = Depends(get_db)):
    session = await crud.get_session(db, sid)
    if not session:
        from fastapi import HTTPException
        raise HTTPException(404, "Session not found")
    return session


@router.get("/{sid}/messages")
async def get_messages(sid: str, db: AsyncSession = Depends(get_db)):
    messages = await crud.get_messages(db, sid)
    result = []
    for msg in messages:
        parts = [
            {"type": p.type, "content": p.content, "metadata": p.metadata_}
            for p in sorted(msg.parts, key=lambda p: p.index)
        ]
        result.append({
            "id": msg.id,
            "role": msg.role,
            "agent": msg.agent,
            "model": msg.model,
            "created_at": msg.created_at,
            "parts": parts,
        })
    return result
