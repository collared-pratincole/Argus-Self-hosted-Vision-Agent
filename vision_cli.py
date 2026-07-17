#!/usr/bin/env python3
"""
Vision Recognizer CLI — a tiny识图命令行工具。

设计给其他 agent 通过 subprocess 调用，也方便人在终端直接用。
默认输出格式：每行一条 "<图片完整路径>>>识别结果"，简洁直观。
加 --json 可切换为 JSON 输出，便于程序解析。

配置（环境变量，与 web_server 共用同一套）：
    VISION_API_BASE  默认 http://localhost:11434/v1
    VISION_API_KEY   默认 ollama
    VISION_MODEL     默认 llava

用法：
    # 单张图片（路径 / URL / base64）
    python vision_cli.py single /path/to/img.jpg
    python vision_cli.py single "https://example.com/a.png"

    # 批量识别一个文件夹里的所有图片（递归）
    python vision_cli.py batch /path/to/folder
    python vision_cli.py batch /path/to/folder --concurrency 5

    # 自定义 prompt（默认极简：5-10 字描述）
    python vision_cli.py single img.jpg --prompt "这是什么动物？"

    # JSON 输出（给 agent 解析）
    python vision_cli.py batch folder --json

退出码：
    0  成功（但单条结果里可能仍含 error 字段）
    1  调用失败 / 参数错误
"""
import argparse
import asyncio
import base64
import json
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

import httpx

API_BASE = os.getenv("VISION_API_BASE", "http://localhost:11434/v1")
API_KEY = os.getenv("VISION_API_KEY", "ollama")
MODEL = os.getenv("VISION_MODEL", "llava")
SYSTEM_PROMPT = "分析这张图片，用5-10字描述图中内容"
DEFAULT_PROMPT = "Identify the main subject of this image concisely."

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}


def _load_image_as_data_url(image: str) -> str:
    """路径 / URL / base64 / data URL -> data URL"""
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


async def _call_vision(client: httpx.AsyncClient, data_url: str, prompt: str) -> str:
    resp = await client.post(
        f"{API_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            "max_tokens": 60,
            "temperature": 0,
        },
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


async def recognize_one(image: str, prompt: str) -> dict[str, Any]:
    try:
        data_url = _load_image_as_data_url(image)
        async with httpx.AsyncClient(timeout=90) as client:
            text = await _call_vision(client, data_url, prompt)
        return {"image": image, "result": text}
    except Exception as exc:
        return {"image": image, "error": str(exc)}


async def recognize_batch(
    images: list[str], prompt: str, concurrency: int
) -> list[dict[str, Any]]:
    sem = asyncio.Semaphore(concurrency)
    results: list[dict[str, Any]] = [{}] * len(images)

    async def _run(idx: int, img: str) -> None:
        async with sem:
            results[idx] = await recognize_one(img, prompt)

    await asyncio.gather(*(_run(i, img) for i, img in enumerate(images)))
    return results


def _collect_images_from_folder(folder: str) -> list[str]:
    p = Path(folder)
    if not p.is_dir():
        raise SystemExit(f"not a directory: {folder}")
    files = [
        str(f)
        for f in p.rglob("*")
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS
    ]
    files.sort()
    return files


def _format_line(item: dict[str, Any]) -> str:
    """格式化单条结果为 '<路径>>>结果' 或 '<路径>>>ERROR: ...'"""
    img = item.get("image", "")
    if "result" in item:
        return f"{img}>>{item['result']}"
    return f"{img}>>ERROR: {item.get('error', 'unknown')}"


def _print_single(result: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(_format_line(result))


def _print_batch(results: list[dict[str, Any]], as_json: bool) -> None:
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            print(_format_line(item))


def cmd_single(args: argparse.Namespace) -> int:
    prompt = args.prompt or DEFAULT_PROMPT
    result = asyncio.run(recognize_one(args.image, prompt))
    _print_single(result, args.json)
    return 0 if "result" in result else 1


def cmd_batch(args: argparse.Namespace) -> int:
    prompt = args.prompt or DEFAULT_PROMPT
    images = _collect_images_from_folder(args.folder)
    if not images:
        if args.json:
            print(json.dumps({"error": "no images found", "folder": args.folder},
                             ensure_ascii=False, indent=2))
        else:
            print(f"{args.folder}>>ERROR: no images found")
        return 1
    if not args.json:
        print(f"found {len(images)} images, concurrency={args.concurrency}", file=sys.stderr)
    results = asyncio.run(recognize_batch(images, prompt, args.concurrency))
    _print_batch(results, args.json)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vision_cli",
        description="极简识图 CLI（可被其他 agent subprocess 调用）",
    )
    parser.add_argument("--json", action="store_true",
                        help="输出 JSON 格式（默认是 '路径>>结果' 文本）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_single = sub.add_parser("single", help="识别单张图片")
    p_single.add_argument("image", help="图片路径 / URL / base64 字符串")
    p_single.add_argument("--prompt", help="自定义 prompt，留空使用默认")
    p_single.set_defaults(func=cmd_single)

    p_batch = sub.add_parser("batch", help="递归识别文件夹里所有图片")
    p_batch.add_argument("folder", help="文件夹路径")
    p_batch.add_argument("--concurrency", type=int, default=3, help="并发数，默认 3")
    p_batch.add_argument("--prompt", help="自定义 prompt，留空使用默认")
    p_batch.set_defaults(func=cmd_batch)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
