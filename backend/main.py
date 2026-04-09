import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.meta import router as framework_router
from routes.published_agent import router as published_agent_router
from db.engine import init_db, Session
from mcp_runtime import ensure_mcp_tools_loaded, shutdown_mcp_runtime
from platform_registry import bootstrap_platform_registry
from routes.platform import router as platform_router
from routes.session import router as session_router
from routes.chat import router as chat_ws_router, rest_router as chat_rest_router
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logging.info("Database initialized")
    logging.info("Chat model: %s", settings.chat_model)
    await ensure_mcp_tools_loaded()
    async with Session() as db:
        await bootstrap_platform_registry(db)
    logging.info("Platform registry initialized")
    try:
        yield
    finally:
        await shutdown_mcp_runtime()


app = FastAPI(title="CSAgent", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session_router)
app.include_router(chat_ws_router)
app.include_router(chat_rest_router)
app.include_router(framework_router)
app.include_router(platform_router)
app.include_router(published_agent_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "name": "CSAgent",
        "version": "0.2.0",
        "port": settings.port,
        "chat_model": settings.chat_model,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
