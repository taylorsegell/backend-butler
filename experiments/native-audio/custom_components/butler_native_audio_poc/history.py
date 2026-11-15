"""Owner-scoped proxy to allowlisted real worker conversation routes."""

from urllib.parse import urlsplit

import aiohttp

FIELDS = {
    "conversation_id",
    "version",
    "text",
    "new",
    "steps",
    "force",
    "task_id",
    "interrupt",
    "wait",
}
ROUTES = {
    "history": ("GET", "/chat/history"),
    "conversations": ("GET", "/chat/conversations"),
    "switch": ("POST", "/chat/switch"),
    "delete": ("POST", "/chat/delete"),
    "send": ("POST", "/chat"),
    "warm": ("POST", "/chat/warm"),
    "cancel": ("POST", "/chat/cancel"),
}


def worker_url(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or not parsed.port
        or parsed.port < 18123
        or parsed.path not in ("", "/")
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Use only an isolated loopback worker")
    return value.rstrip("/")


class HistoryProxy:
    def __init__(self, url, token):
        self.url = worker_url(url)
        self.token = token

    async def request(self, owner, operation, data):
        if operation not in ROUTES or set(data) - FIELDS:
            raise ValueError("Invalid history request")
        for key, value in data.items():
            if key in {"new", "steps", "force", "interrupt", "wait"}:
                if not isinstance(value, bool):
                    raise ValueError("Invalid history option")
            elif not isinstance(value, str) or len(value) > (
                2000 if key == "text" else 200
            ):
                raise ValueError("Invalid history field")
        method, path = ROUTES[operation]
        fields = {**data, "user": owner}
        headers = {"Authorization": "Bearer " + self.token}
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30)
        ) as client:
            kwargs = {"params": fields} if method == "GET" else {"json": fields}
            async with client.request(
                method, self.url + path, headers=headers, **kwargs
            ) as response:
                body = await response.text()
                if len(body) > 500000:
                    raise ValueError("History response too large")
                try:
                    import json

                    result = json.loads(body)
                except ValueError:
                    result = (
                        body if response.status < 400 else "Conversation request failed"
                    )
                return {"status": response.status, "body": result}
