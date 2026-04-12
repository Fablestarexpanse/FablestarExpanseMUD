"""Minimal ComfyUI HTTP client: queue prompt, poll history, download PNG."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

from fablestar.core.config import ComfyUIConfig

logger = logging.getLogger(__name__)


def _load_workflow(path: Path) -> Dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("workflow_not_object")
    # Strip comment-only keys
    return {k: v for k, v in raw.items() if not str(k).startswith("_")}


def _strip_node_meta_for_api(workflow: Dict[str, Any]) -> None:
    """Remove per-node _meta (UI metadata); ComfyUI /prompt often rejects unknown node keys."""
    for node in workflow.values():
        if isinstance(node, dict) and "_meta" in node:
            del node["_meta"]


def _inject_positive_prompt(workflow: Dict[str, Any], node_id: str, text: str) -> None:
    node = workflow.get(node_id)
    if not isinstance(node, dict):
        raise ValueError(f"missing_node:{node_id}")
    inputs = node.get("inputs")
    if not isinstance(inputs, dict) or "text" not in inputs:
        raise ValueError(f"node_has_no_text_input:{node_id}")
    inputs["text"] = text


def _apply_checkpoint_override(workflow: Dict[str, Any], ckpt_name: str) -> None:
    name = (ckpt_name or "").strip()
    if not name:
        return
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") != "CheckpointLoaderSimple":
            continue
        inputs = node.get("inputs")
        if isinstance(inputs, dict):
            inputs["ckpt_name"] = name


def _comfy_error_detail(response: httpx.Response) -> str:
    """Extract ComfyUI /prompt error JSON into a short string for logs and API detail."""
    text = (response.text or "").strip()
    if not text:
        return "(empty response body)"
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text[:3000]
    parts: list[str] = []
    err = data.get("error")
    if isinstance(err, dict):
        msg = err.get("message")
        if msg:
            parts.append(str(msg))
        typ = err.get("type")
        if typ and typ != msg:
            parts.append(f"type={typ}")
        det = err.get("details")
        if det and str(det) not in str(msg or ""):
            parts.append(str(det))
    ne = data.get("node_errors")
    if isinstance(ne, dict) and ne:
        snippet = json.dumps(ne, ensure_ascii=False)
        if len(snippet) > 2800:
            snippet = snippet[:2800] + "…"
        parts.append(f"node_errors={snippet}")
    return " | ".join(parts) if parts else text[:3000]


def _resolve_workflow(cfg: ComfyUIConfig, kind: str) -> tuple[Path, str, str]:
    """Return (workflow_path, positive_prompt_node_id, output_node_id). kind is portrait | area."""
    k = (kind or "portrait").lower().strip()
    if k == "area":
        wp = (cfg.area_workflow_path or "").strip() or cfg.workflow_path
        pid = (cfg.area_positive_prompt_node_id or "").strip() or cfg.positive_prompt_node_id
        oid = (cfg.area_output_node_id or "").strip() or cfg.output_node_id
    else:
        wp = cfg.workflow_path
        pid = cfg.positive_prompt_node_id
        oid = cfg.output_node_id
    return Path(wp), pid, oid


async def generate_comfy_png(
    cfg: ComfyUIConfig,
    user_prompt: str,
    kind: str = "portrait",
) -> Tuple[bytes, str]:
    """
    Run ComfyUI once; return (png_bytes, empty_error_string).
    kind: "portrait" | "area"
    """
    if not cfg.enabled:
        raise RuntimeError("comfyui_disabled")

    wf_path, pos_node, output_node_id = _resolve_workflow(cfg, kind)
    if not wf_path.is_file():
        raise FileNotFoundError(f"workflow_missing:{wf_path}")

    user_prompt = (user_prompt or "").strip()
    if len(user_prompt) < 3:
        raise ValueError("prompt_too_short")

    workflow = _load_workflow(wf_path)
    _strip_node_meta_for_api(workflow)
    _apply_checkpoint_override(workflow, cfg.checkpoint_name)
    _inject_positive_prompt(workflow, pos_node, user_prompt)

    base = cfg.base_url.rstrip("/")
    client_id = str(uuid.uuid4())
    timeout = httpx.Timeout(cfg.timeout_seconds + 10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        pr = await client.post(f"{base}/prompt", json={"prompt": workflow, "client_id": client_id})
        if pr.status_code >= 400:
            detail = _comfy_error_detail(pr)
            raise RuntimeError(f"ComfyUI /prompt HTTP {pr.status_code}: {detail}")
        body = pr.json()
        prompt_id = body.get("prompt_id")
        if not prompt_id:
            raise RuntimeError(f"comfyui_no_prompt_id:{body}")

        deadline = asyncio.get_event_loop().time() + cfg.timeout_seconds
        history: Dict[str, Any] = {}
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(cfg.poll_interval_seconds)
            hr = await client.get(f"{base}/history/{prompt_id}")
            hr.raise_for_status()
            history = hr.json()
            if prompt_id in history:
                break
        else:
            raise TimeoutError("comfyui_timeout")

        entry = history.get(prompt_id, {})
        outputs = entry.get("outputs") or {}
        out_block = outputs.get(output_node_id)
        if not out_block:
            raise RuntimeError(f"comfyui_no_output_node:{output_node_id}")
        images = out_block.get("images") or []
        if not images:
            raise RuntimeError("comfyui_no_images")

        img0 = images[0]
        filename = img0.get("filename")
        subfolder = img0.get("subfolder") or ""
        typ = img0.get("type") or "output"
        if not filename:
            raise RuntimeError("comfyui_no_filename")

        params = {"filename": filename, "type": typ}
        if subfolder:
            params["subfolder"] = subfolder
        vr = await client.get(f"{base}/view", params=params)
        vr.raise_for_status()
        data = vr.content
        if not data:
            raise RuntimeError("comfyui_empty_image")
        return data, ""


async def generate_portrait_png(
    cfg: ComfyUIConfig,
    appearance_prompt: str,
) -> Tuple[bytes, str]:
    """Portrait workflow (backwards-compatible name)."""
    return await generate_comfy_png(cfg, appearance_prompt, kind="portrait")


def workflow_template_copy_destination() -> Path:
    """Hint path for operators copying the example workflow."""
    return Path("config/comfyui_portrait_workflow.json")
