"""知识库搜索工具 - FAISS + bge-m3 向量检索（带磁盘缓存）"""
import os
import hashlib
import pickle
import asyncio
import logging
import numpy as np
import httpx
from tool.base import tool, ToolResult
from config import settings

logger = logging.getLogger(__name__)

_index = None
_questions: list[str] = []
_answers: list[str] = []
_categories: list[str] = []
_ready = False
_loading = False
_err = ""
_lock = asyncio.Lock()

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")


def _xlsx_hash(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(xlsx: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"klg_{_xlsx_hash(xlsx)}.pkl")


async def _embed(texts: list[str]) -> np.ndarray:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.base_url}/embeddings",
            headers={"Authorization": f"Bearer {settings.api_key}"},
            json={"model": settings.embed_model, "input": texts, "encoding_format": "float"},
        )
        resp.raise_for_status()
        data = resp.json()
    vecs = [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]
    return np.array(vecs, dtype="float32")


def _load_xlsx(path: str):
    import openpyxl
    questions, answers, categories = [], [], []
    wb = openpyxl.load_workbook(path, read_only=False)
    for ws in wb.worksheets:
        first = True
        for row in ws.iter_rows(values_only=True):
            vals = [str(v).strip() if v is not None else "" for v in row]
            if not any(vals):
                continue
            if first:
                first = False
                head = " ".join(vals[:6])
                if "问题" in head and ("答案" in head or "回答" in head):
                    continue
            if len(vals) >= 3 and vals[1] and vals[2]:
                cat, q, a = vals[0] or "通用", vals[1], vals[2]
            elif len(vals) >= 2 and vals[0] and vals[1]:
                cat, q, a = "通用", vals[0], vals[1]
            else:
                continue
            categories.append(cat)
            questions.append(q)
            answers.append(a)
    wb.close()
    return questions, answers, categories


async def init_knowledge(force: bool = False) -> bool:
    global _index, _questions, _answers, _categories, _ready, _loading, _err
    if _ready and not force:
        return True

    async with _lock:
        if _ready and not force:
            return True
        _loading = True
        _err = ""
        _index = None
        _questions = []
        _answers = []
        _categories = []

        try:
            import faiss

            path = os.path.join(os.path.dirname(__file__), "..", settings.klg_path)
            path = os.path.normpath(path)
            if not os.path.exists(path):
                _err = f"知识库文件不存在: {path}"
                logger.warning(_err)
                _ready = False
                return False

            cache = _cache_path(path)

            # 尝试从磁盘缓存加载
            if not force and os.path.exists(cache):
                logger.info(f"从缓存加载知识库索引: {cache}")
                with open(cache, "rb") as f:
                    blob = pickle.load(f)
                _questions = blob["questions"]
                _answers = blob["answers"]
                _categories = blob["categories"]
                matrix = blob["matrix"]
                faiss.normalize_L2(matrix)
                dim = matrix.shape[1]
                _index = faiss.IndexFlatIP(dim)
                _index.add(matrix)
                _ready = True
                logger.info(f"缓存加载完成: {len(_questions)} 条, dim={dim}")
                return True

            # 无缓存 → 解析 xlsx 并嵌入
            logger.info(f"正在加载知识库: {path}")
            _questions, _answers, _categories = _load_xlsx(path)

            if not _questions:
                _err = "知识库数据为空或格式不正确（支持2列:问题/答案，或3列:类别/问题/答案）"
                logger.warning(_err)
                _ready = False
                return False

            logger.info(f"知识库加载完成: {len(_questions)} 条，开始嵌入...")

            batch = 64
            all_vecs = []
            for i in range(0, len(_questions), batch):
                chunk = _questions[i:i + batch]
                vecs = await _embed(chunk)
                all_vecs.append(vecs)
                logger.info(f"嵌入进度: {min(i + batch, len(_questions))}/{len(_questions)}")

            matrix = np.vstack(all_vecs)

            # 保存到磁盘缓存
            with open(cache, "wb") as f:
                pickle.dump({
                    "questions": _questions,
                    "answers": _answers,
                    "categories": _categories,
                    "matrix": matrix,
                }, f)
            logger.info(f"缓存已保存: {cache}")

            faiss.normalize_L2(matrix)
            dim = matrix.shape[1]
            _index = faiss.IndexFlatIP(dim)
            _index.add(matrix)
            logger.info(f"FAISS 索引构建完成: dim={dim}, n={_index.ntotal}")
            _ready = True
            return True
        except Exception as e:
            _err = str(e)
            _ready = False
            logger.exception("知识库初始化失败")
            return False
        finally:
            _loading = False


async def ensure_knowledge() -> bool:
    global _loading
    if _ready and _index is not None and _index.ntotal > 0:
        return True
    if _loading:
        for _ in range(120):
            await asyncio.sleep(0.25)
            if _ready and _index is not None and _index.ntotal > 0:
                return True
            if not _loading:
                break
    return await init_knowledge()


@tool(
    name="search_knowledge",
    description="搜索电信业务知识库，回答套餐、流量、续约升级、宽带、账单、业务办理、发票、报障、活动等问题，任何问题均可查询此库。该工具适合一次检索一个主题或一类知识，输入尽量简短、聚焦；如果用户问题包含多个子问题，应拆成多次检索，逐个获取信息后再综合回答。",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "用户的问题"},
        },
        "required": ["query"],
    },
    scope="global",
    policy={
        "risk_level": "low",
        "confirm_policy": "never",
        "phase_guidance": "当前工具未覆盖、条件不足或需要办理渠道说明时优先使用知识库兜底",
    },
)
async def search_knowledge(query: str) -> ToolResult:
    ok = await ensure_knowledge()
    if not ok or _index is None or _index.ntotal == 0:
        if _err:
            return ToolResult(text=f"知识库初始化失败：{_err}")
        return ToolResult(text="知识库尚未初始化，请稍后再试。")

    vec = await _embed([query])
    import faiss
    faiss.normalize_L2(vec)
    k = min(settings.klg_top_k, _index.ntotal)
    scores, indices = _index.search(vec, k)

    # 只取答案，去重（同一答案只保留最高分）
    seen = set()
    answers = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or score < 0.3:
            continue
        ans = _answers[idx]
        if ans in seen:
            continue
        seen.add(ans)
        answers.append(ans)

    if not answers:
        return ToolResult(text='未找到相关知识，建议联系人工客服（输入"服务升级"转人工）。')

    return ToolResult(text="\n\n---\n\n".join(answers))
