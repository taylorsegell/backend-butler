"""Owner-bound ephemeral sessions; identifiers never confer access by themselves."""

import asyncio
import secrets
from contextvars import ContextVar
from dataclasses import dataclass, field

PREFIX = "camera.backend_butler_native_audio_"
principal = ContextVar("butler_native_principal", default=None)


@dataclass
class BridgeSession:
    id: str
    owner: str
    receiver: object
    person: str
    speech: object = None
    conversation_id: str | None = None
    camera: object = None
    closed: bool = False
    expiry: object = None
    operation_lock: object = field(default_factory=asyncio.Lock)
    cleanup: list = field(default_factory=list)

    @property
    def entity_id(self):
        return PREFIX + self.id

    def check_signaling(self):
        if self.closed or principal.get() != (self.owner, self.id):
            raise PermissionError("Audio session unavailable")


class SessionRegistry:
    def __init__(
        self,
        receiver_factory,
        speech_factory=lambda _owner, _conversation: None,
        add=None,
        remove=None,
    ):
        self.receiver_factory = receiver_factory
        self.speech_factory = speech_factory
        self.add = add
        self.remove = remove
        self.sessions = {}
        self.lock = asyncio.Lock()

    async def open(self, owner, person, conversation_id=None):
        async with self.lock:
            if (
                len(self.sessions) >= 8
                or sum(s.owner == owner for s in self.sessions.values()) >= 2
            ):
                raise ValueError("Audio session limit reached")
            speech = self.speech_factory(person, conversation_id)
            session = BridgeSession(
                secrets.token_hex(16),
                owner,
                self.receiver_factory(speech),
                person,
                speech,
                conversation_id=conversation_id,
            )
            self.sessions[session.id] = session
            try:
                if self.add:
                    await self.add(session)
            except BaseException:
                self.sessions.pop(session.id)
                await session.receiver.close()
                try:
                    if speech:
                        await speech.close()
                finally:
                    if self.remove:
                        await self.remove(session)
                raise
            if speech:

                def expire_idle(event):
                    if event.get("type") == "idle":
                        asyncio.create_task(self.expire(session.id))

                speech.listeners.add(expire_idle)
            session.expiry = asyncio.get_running_loop().call_later(
                1200, lambda: asyncio.create_task(self.expire(session.id))
            )
            return session

    def owned(self, owner, session_id):
        session = self.sessions.get(session_id)
        if not session or session.closed or session.owner != owner:
            raise PermissionError("Audio session unavailable")
        return session

    def for_entity(self, owner, entity_id):
        if not entity_id.startswith(PREFIX):
            raise PermissionError("Audio session unavailable")
        session = self.owned(owner, entity_id[len(PREFIX) :])
        if session.entity_id != entity_id:
            raise PermissionError("Audio session unavailable")
        return session

    async def close(self, owner, session_id):
        session = self.owned(owner, session_id)
        session.closed = True
        self.sessions.pop(session_id)
        session.expiry.cancel()
        for cleanup in session.cleanup:
            cleanup()
        session.cleanup.clear()
        async with session.operation_lock:
            try:
                await session.receiver.close()
            finally:
                try:
                    if session.speech:
                        session.speech.listeners.clear()
                        await session.speech.close()
                finally:
                    if self.remove:
                        await self.remove(session)

    async def expire(self, session_id):
        session = self.sessions.get(session_id)
        if session:
            await self.close(session.owner, session_id)

    async def shutdown(self):
        results = await asyncio.gather(
            *(self.expire(session.id) for session in list(self.sessions.values())),
            return_exceptions=True,
        )
        errors = [result for result in results if isinstance(result, BaseException)]
        if errors:
            raise BaseExceptionGroup("Native audio cleanup failed", errors)
