#!/usr/bin/env python3
"""
Web server for the Vision Recognizer — serves a frontend UI and REST API.

Endpoints:
  GET  /            -> frontend HTML
  POST /api/recognize      -> single image recognition (multipart or JSON)
  POST /api/batch-recognize -> batch recognition (multiple files)
  GET  /api/config         -> current model config
  POST /api/config         -> update model config at runtime
"""
import asyncio
import base64
import mimetypes
import os
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ── Reuse the same vision logic ──────────────────────────────────────────────

API_BASE = os.getenv("VISION_API_BASE", "http://localhost:11434/v1")
API_KEY = os.getenv("VISION_API_KEY", "ollama")
MODEL = os.getenv("VISION_MODEL", "llava")
DEFAULT_PROMPT = (
    "Identify the main subject of this image. "
    "Reply with one short phrase only, no extra text."
)
SYSTEM_PROMPT = "分析这张图片，用5-10字描述图中内容"

# Runtime-mutable config
config = {"api_base": API_BASE, "api_key": API_KEY, "model": MODEL}


def _load_image_as_data_url(image: str) -> str:
    if image.startswith(("http://", "https://")):
        r = httpx.get(image, timeout=30, follow_redirects=True)
        r.raise_for_status()
        mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
        b64 = base64.b64encode(r.content).decode()
        return f"data:{mime};base64,{b64}"
    if os.path.isfile(image):
        data = Path(image).read_bytes()
        mime = (mimetypes.guess_type(image)[0] or "image/jpeg").split(";")[0]
        b64 = base64.b64encode(data).decode()
        return f"data:{mime};base64,{b64}"
    if image.startswith("data:"):
        return image
    return f"data:image/jpeg;base64,{image}"


async def _call_vision(data_url: str, prompt: str) -> str:
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{config['api_base']}/chat/completions",
            headers={"Authorization": f"Bearer {config['api_key']}"},
            json={
                "model": config["model"],
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
                "max_tokens": 60,
                "temperature": 0,
            },
        )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Vision Recognizer")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    return (STATIC_DIR / "index.html").read_text()


# ── Config ───────────────────────────────────────────────────────────────────


@app.get("/api/config")
async def get_config():
    return {k: (v if k != "api_key" else "***") for k, v in config.items()}


@app.post("/api/config")
async def update_config(api_base: Optional[str] = None, api_key: Optional[str] = None, model: Optional[str] = None):
    if api_base:
        config["api_base"] = api_base
    if api_key:
        config["api_key"] = api_key
    if model:
        config["model"] = model
    return {k: (v if k != "api_key" else "***") for k, v in config.items()}


# ── Single image ─────────────────────────────────────────────────────────────


@app.post("/api/recognize")
async def recognize(
    file: UploadFile = File(None),
    image_url: str = Form(""),
    prompt: str = Form(DEFAULT_PROMPT),
):
    if file:
        data = await file.read()
        mime = file.content_type or "image/jpeg"
        b64 = base64.b64encode(data).decode()
        data_url = f"data:{mime};base64,{b64}"
    elif image_url:
        data_url = _load_image_as_data_url(image_url)
    else:
        return JSONResponse({"error": "Provide either 'file' or 'image_url'"}, 400)

    try:
        result = await _call_vision(data_url, prompt)
        return {"result": result}
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, 502)


# ── Batch ────────────────────────────────────────────────────────────────────


@app.post("/api/batch-recognize")
async def batch_recognize(
    files: list[UploadFile] = File(...),
    prompt: str = Form(DEFAULT_PROMPT),
    concurrency: int = Form(3),
):
    sem = asyncio.Semaphore(concurrency)
    results: list[dict[str, Any]] = [{}] * len(files)

    async def _process(idx: int, f: UploadFile) -> None:
        async with sem:
            try:
                data = await f.read()
                mime = f.content_type or "image/jpeg"
                b64 = base64.b64encode(data).decode()
                data_url = f"data:{mime};base64,{b64}"
                text = await _call_vision(data_url, prompt)
                results[idx] = {"name": f.filename, "result": text}
            except Exception as exc:
                results[idx] = {"name": f.filename, "error": str(exc)}

    await asyncio.gather(*(_process(i, f) for i, f in enumerate(files)))
    return results


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8787)
