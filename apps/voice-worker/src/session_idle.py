"""End quiet voice sessions without interrupting speech, generation or tools."""

import asyncio
from collections.abc import Awaitable, Callable


class SessionIdle:
    def __init__(
        self, session, seconds: float, disconnect: Callable[[], Awaitable[None]]
    ):
        self.session = session
        self.seconds = seconds
        self.disconnect = disconnect
        self.loop = asyncio.get_running_loop()
        self.deadline = self.loop.time() + seconds
        self.changed = asyncio.Event()
        self.busy = set()
        self.closed = False
        self.expired = False
        self.handlers = {
            "agent_state_changed": self.agent_state,
            "user_state_changed": self.user_state,
            "user_input_transcribed": self.transcript,
            "conversation_item_added": self.touch,
            "tool_execution_updated": self.tool,
            "close": self.session_closed,
        }
        for name, callback in self.handlers.items():
            session.on(name, callback)
        self.hold(
            "agent",
            getattr(session, "agent_state", None)
            in {"initializing", "thinking", "speaking"},
        )
        self.hold("user", getattr(session, "user_state", None) == "speaking")
        self.task = asyncio.create_task(self.run())

    def touch(self, _event=None):
        if not self.closed and not self.expired:
            self.deadline = self.loop.time() + self.seconds
            self.changed.set()

    def hold(self, key, active):
        if active:
            self.busy.add(key)
            self.touch()
        elif key in self.busy:
            self.busy.remove(key)
            self.touch()  # a full quiet grace period after work finishes

    def agent_state(self, event):
        self.hold("agent", event.new_state in {"initializing", "thinking", "speaking"})

    def user_state(self, event):
        self.hold("user", event.new_state == "speaking")

    def transcript(self, event):
        if event.transcript.strip():
            self.touch()

    def tool(self, event):
        update = event.update
        if update.type == "tool_call_started":
            self.hold("tool:" + update.function_call.call_id, True)
        elif update.type == "tool_call_ended":
            self.hold("tool:" + update.call_id, False)
        elif update.type == "tool_reply_updated":
            self.hold("reply:" + update.speech_id, update.status == "scheduled")

    def session_closed(self, _event):
        # Failed/closed agents cannot keep an otherwise quiet room reserved with
        # a stale thinking/speaking/tool state.
        self.busy.clear()
        self.touch()

    async def run(self):
        while not self.closed:
            self.changed.clear()
            if self.busy:
                await self.changed.wait()
                continue
            remaining = self.deadline - self.loop.time()
            if remaining <= 0:
                self.expired = True
                await self.disconnect()
                return
            try:
                await asyncio.wait_for(self.changed.wait(), remaining)
            except TimeoutError:
                pass

    async def aclose(self):
        self.closed = True
        for name, callback in self.handlers.items():
            self.session.off(name, callback)
        if self.task is not asyncio.current_task():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
