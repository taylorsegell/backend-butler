"""False recognition must be rejected before history and action generation."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from livekit import rtc
from livekit.agents import StopResponse
from livekit.agents.llm import ChatContext, ChatMessage

from agent import HomeAssistantAgent
from native_audio import NativeInput, NativeSession, ReplyOutput
from native_speech import SpeechEvidence


def detected_speech():
    return SimpleNamespace(speaking=True, speech_duration=0.25)


@pytest.mark.asyncio
async def test_confident_hallucination_without_speech_never_reaches_history():
    agent = HomeAssistantAgent.__new__(HomeAssistantAgent)
    agent._speech_evidence = SpeechEvidence()
    message = ChatMessage(
        role="user", content=["Man, you're smart."], transcript_confidence=0.99
    )
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(ChatContext(), message)


@pytest.mark.asyncio
async def test_real_speech_is_accepted_but_evidence_cannot_authorize_another_turn():
    agent = HomeAssistantAgent.__new__(HomeAssistantAgent)
    agent._speech_evidence = SpeechEvidence()
    agent._speech_evidence.observe(detected_speech())
    message = ChatMessage(role="user", content=["Yes"], transcript_confidence=0.99)
    await agent.on_user_turn_completed(ChatContext(), message)
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(ChatContext(), message)


@pytest.mark.asyncio
async def test_playback_and_low_confidence_speech_are_rejected():
    agent = HomeAssistantAgent.__new__(HomeAssistantAgent)
    agent._speech_evidence = SpeechEvidence()
    agent._speech_evidence.observe(detected_speech())
    uncertain = ChatMessage(
        role="user", content=["Man, you're smart."], transcript_confidence=0.757895
    )
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(ChatContext(), uncertain)
    agent._speech_evidence.blocked = True
    agent._speech_evidence.observe(detected_speech())
    with pytest.raises(StopResponse):
        await agent.on_user_turn_completed(
            ChatContext(), ChatMessage(role="user", content=["I can help."])
        )


@pytest.mark.asyncio
async def test_actual_silence_and_noise_do_not_satisfy_local_speech_detector():
    import numpy as np

    evidence = SpeechEvidence()
    detector = evidence.detector()
    async with detector.stream() as stream:
        rng = np.random.default_rng(1)
        for _ in range(100):
            samples = rng.integers(-20, 21, 960, dtype=np.int16)
            stream.push_frame(rtc.AudioFrame(samples.tobytes(), 48000, 1, 960))
        async with asyncio.timeout(5):
            for _ in range(50):
                await stream.__anext__()
    assert not evidence.consume(), "quiet PCM must not authorize invented words"


@pytest.mark.asyncio
async def test_audio_send_is_not_playback_completion_and_ack_is_segment_bound():
    emit = Mock()
    output = ReplyOutput(emit)
    finished = Mock()
    output.on("playback_finished", finished)
    await output.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
    output.flush()
    finished.assert_not_called()
    segment = emit.call_args.args[0]["segment"]
    output.acknowledge(segment + 1)
    finished.assert_not_called()
    output.acknowledge(segment)
    finished.assert_called_once()
    output.acknowledge(segment)
    finished.assert_called_once()
    output.clear_buffer()


@pytest.mark.asyncio
async def test_interrupt_finishes_pending_segments_and_old_ack_is_harmless():
    output = ReplyOutput(Mock())
    finished = Mock()
    output.on("playback_finished", finished)
    for _ in range(2):
        await output.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
        output.flush()
    output.clear_buffer()
    assert finished.call_count == 2
    assert output._pending_playback_count == 0
    output.acknowledge(1)
    assert finished.call_count == 2


@pytest.mark.asyncio
async def test_microphone_discards_playback_and_resumes_only_after_ack_and_tail():
    speech = NativeSession.__new__(NativeSession)
    speech.speech_evidence = SpeechEvidence()
    speech.session = Mock()
    speech.input = NativeInput()
    speech.resume_timer = None
    speech.listening = True
    speech.failed = speech.closing = False
    speech.output = ReplyOutput(Mock(), speech.block_for_playback, speech.playback_done)
    pcm = bytes(1920)
    speech.push(pcm)
    assert speech.input.frames.qsize() == 1
    await speech.output.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
    speech.output.flush()
    assert speech.input.frames.empty(), "old mic audio is cleared at playback start"
    speech.push(pcm)
    assert speech.input.frames.empty(), "speaker echo cannot enter recognition"
    speech.output.acknowledge(1)
    speech.push(pcm)
    assert speech.input.frames.empty(), "in-flight echo is discarded after playback"
    await asyncio.sleep(0.4)
    speech.push(pcm)
    assert speech.input.frames.qsize() == 1
    speech.session.input.set_audio_enabled.assert_called_with(True)


@pytest.mark.asyncio
async def test_ending_session_while_playing_never_reopens_microphone():
    speech = NativeSession.__new__(NativeSession)
    speech.speech_evidence = SpeechEvidence()
    speech.speech_evidence.blocked = True
    speech.session = Mock()
    speech.agent = Mock()
    speech.input = NativeInput()
    speech.resume_timer = speech.turn_timer = None
    speech.listening = True
    speech.failed = speech.closing = False
    speech.playback_done()
    speech.idle_input()
    await asyncio.sleep(0.4)
    speech.session.input.set_audio_enabled.assert_called_once_with(False)


@pytest.mark.asyncio
async def test_manual_send_preserves_speech_until_sdk_turn_hook_runs():
    speech = NativeSession.__new__(NativeSession)
    speech.speech_evidence = SpeechEvidence()
    speech.speech_evidence.observe(detected_speech())
    speech.session = Mock()
    speech.session.commit_user_turn = AsyncMock(return_value="Yes")
    speech.agent = Mock()
    speech.resume_timer = speech.turn_timer = None
    speech.listening = True
    speech.failed = False
    speech.refresh = lambda: {}
    await speech.control("end_turn")
    speech.speech_evidence.validate(
        ChatMessage(role="user", content=["Yes"], transcript_confidence=0.99)
    )


def test_microphone_evidence_is_not_saved_as_agent_constructor_state():
    agent = HomeAssistantAgent.__new__(HomeAssistantAgent)
    agent.user_id = "synthetic-person"
    agent._speech_evidence = SpeechEvidence()
    assert agent._snapshot_state() == {"user_id": "synthetic-person"}
