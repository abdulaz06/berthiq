"""Bounded request bodies and per-client traffic for the single-worker demo server."""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict, deque

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class DemoLimits:
    BODY_TIMEOUT_SECONDS = 15

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.clients: OrderedDict[str, deque[float]] = OrderedDict()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] in {"POST", "PUT", "DELETE"}:
            client = str((scope.get("client") or ("unknown",))[0])
            now = time.monotonic()
            hits = self.clients.setdefault(client, deque())
            self.clients.move_to_end(client)
            while len(self.clients) > 2048:
                self.clients.popitem(last=False)
            while hits and hits[0] <= now - 60:
                hits.popleft()
            if len(hits) >= 30:
                await JSONResponse(
                    {"detail": "Demo request limit reached. Retry in one minute."},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )(scope, receive, send)
                return
            hits.append(now)
            body = bytearray()
            deadline = time.monotonic() + self.BODY_TIMEOUT_SECONDS
            while True:
                try:
                    message = await asyncio.wait_for(
                        receive(), timeout=max(0, deadline - time.monotonic())
                    )
                except TimeoutError:
                    await JSONResponse({"detail": "Request body timed out."}, status_code=408)(
                        scope, receive, send
                    )
                    return
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > 6 * 1024 * 1024:
                    await JSONResponse({"detail": "Request body exceeds 6 MiB."}, status_code=413)(
                        scope, receive, send
                    )
                    return
                if not message.get("more_body", False):
                    break
            sent = False

            async def replay():
                nonlocal sent
                if not sent:
                    sent = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, replay, send)
        else:
            await self.app(scope, receive, send)
