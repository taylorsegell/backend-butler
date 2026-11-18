"""Require local speech evidence before accepting native microphone transcripts."""

import time

from livekit.agents import StopResponse, inference


class SpeechEvidence:
    def __init__(self):
        self.blocked = False
        self.last_speech = 0.0

    def reset(self):
        self.last_speech = 0.0

    def observe(self, event):
        if not self.blocked and event.speaking and event.speech_duration >= 0.15:
            self.last_speech = time.monotonic()

    def consume(self):
        recent = 0 < time.monotonic() - self.last_speech <= 8
        self.reset()
        return recent and not self.blocked

    def detector(self):
        evidence = self

        class Detector(inference.VAD):
            def stream(self):
                return _ObservedStream(super().stream(), evidence)

        return Detector(min_speech_duration=0.15)

    def validate(self, new_message):
        # StopResponse runs before the SDK appends the message or invokes the LLM.
        has_speech = self.consume()
        confidence = new_message.transcript_confidence
        if (
            not has_speech
            or not (new_message.text_content or "").strip()
            or (confidence is not None and 0 < confidence < 0.8)
        ):
            raise StopResponse()


class _ObservedStream:
    """Observe the SDK's own local VAD stream without a second audio consumer."""

    def __init__(self, stream, evidence):
        self.stream = stream
        self.evidence = evidence

    def __getattr__(self, name):
        return getattr(self.stream, name)

    def __aiter__(self):
        return self

    async def __anext__(self):
        event = await self.stream.__anext__()
        self.evidence.observe(event)
        return event

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.stream.aclose()
