from __future__ import annotations

import asyncio

from app.core.limits import DemoLimits


def test_slow_upload_is_bounded_and_never_reaches_application():
    async def exercise():
        messages = []

        async def app(*args):
            raise AssertionError("Timed-out body must not reach a parser")

        async def receive():
            await asyncio.sleep(5)

        async def send(message):
            messages.append(message)

        middleware = DemoLimits(app)
        middleware.BODY_TIMEOUT_SECONDS = 0.01
        await middleware({"type": "http", "method": "POST", "client": ("test", 1)}, receive, send)
        assert messages[0]["status"] == 408

    asyncio.run(exercise())


def test_oversized_body_is_rejected_before_parser():
    async def exercise():
        messages = []

        async def app(*args):
            raise AssertionError("Oversized body must not reach a parser")

        async def receive():
            return {"type": "http.request", "body": b"x" * (6 * 1024 * 1024 + 1)}

        async def send(message):
            messages.append(message)

        await DemoLimits(app)(
            {"type": "http", "method": "POST", "client": ("test", 1)}, receive, send
        )
        assert messages[0]["status"] == 413

    asyncio.run(exercise())
