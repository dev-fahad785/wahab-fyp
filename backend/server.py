"""ASGI proxy shim — forwards all HTTP traffic to the Node.js (Express) backend.

The real ThesisVault backend is pure MERN: /app/backend/index.js (Express + Mongoose).
This file exists only because the Emergent preview supervisor hardcodes
`uvicorn server:app --host 0.0.0.0 --port 8001`. It:
  1. spawns the Node server on 127.0.0.1:NODE_PORT during startup, and
  2. transparently proxies every request/response through.

This shim contains ZERO business logic — it is just plumbing for the preview harness.
On native deploy (pm2 / Docker / Node host), you ship `index.js` directly and drop
this file entirely.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import signal
import socket
import subprocess
import time
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response

logging.basicConfig(level=logging.INFO, format="%(asctime)s - shim - %(levelname)s - %(message)s")
logger = logging.getLogger("shim")

NODE_PORT = int(os.environ.get("NODE_PORT", "8002"))
NODE_URL = f"http://127.0.0.1:{NODE_PORT}"
NODE_DIR = str(ROOT_DIR)

_node_proc: "subprocess.Popen | None" = None


def _port_open(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _wait_node(total_timeout: float = 25.0) -> bool:
    start = time.time()
    while time.time() - start < total_timeout:
        if _port_open(NODE_PORT):
            return True
        time.sleep(0.3)
    return False


def _kill_stale() -> None:
    if _port_open(NODE_PORT):
        subprocess.run(
            ["pkill", "-f", "node .*index.js"],
            capture_output=True,
            check=False,
        )
        time.sleep(0.4)


def start_node() -> None:
    global _node_proc
    if _node_proc and _node_proc.poll() is None:
        return
    _kill_stale()
    env = {**os.environ, "PORT": str(NODE_PORT)}
    logger.info(f"spawning node backend on port {NODE_PORT}")
    _node_proc = subprocess.Popen(
        ["node", "index.js"],
        cwd=NODE_DIR,
        env=env,
        preexec_fn=os.setsid,
    )
    if not _wait_node():
        logger.error("node backend failed to start within timeout")
    else:
        logger.info("node backend ready")


def stop_node() -> None:
    global _node_proc
    if _node_proc and _node_proc.poll() is None:
        try:
            os.killpg(os.getpgid(_node_proc.pid), signal.SIGTERM)
            _node_proc.wait(timeout=5)
        except Exception:
            try:
                _node_proc.kill()
            except Exception:
                pass
    _node_proc = None


HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
    "content-encoding", "content-length",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_node()
    try:
        yield
    finally:
        stop_node()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy(request: Request, path: str):
    if not _port_open(NODE_PORT):
        start_node()
        if not _wait_node(10):
            return Response(
                b'{"detail":"Backend unavailable"}',
                status_code=503,
                media_type="application/json",
            )

    query = request.url.query
    target = f"{NODE_URL}/{path}" + (f"?{query}" if query else "")
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    body = await request.body()

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.request(
            request.method,
            target,
            headers=headers,
            content=body,
            follow_redirects=False,
        )

    resp_headers = {k: v for k, v in r.headers.items() if k.lower() not in HOP_BY_HOP}
    return Response(
        content=r.content,
        status_code=r.status_code,
        headers=resp_headers,
        media_type=r.headers.get("content-type"),
    )
