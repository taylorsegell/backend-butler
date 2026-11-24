from dataclasses import replace
from pathlib import Path

import pytest
from livekit.agents import Agent
from livekit.agents.llm import ChatContext, ChatMessage

import agent
from config import UPDATE_PREFIX


def test_default_prompt_speaks_as_butler_and_preserves_approval(monkeypatch):
    prompt_file = Path(__file__).resolve().parents[1] / "prompt.yaml"
    monkeypatch.setattr(
        agent, "settings", replace(agent.settings, prompt_file=str(prompt_file))
    )
    instructions = agent.load_instructions()

    assert instructions.startswith("You are Backend Butler")
    assert "first person" in instructions
    assert "LiveKit provides voice transport" in instructions
    assert "hand_to_butler" in instructions and "chat_id" in instructions
    assert "decide_approval" in instructions and "exact proposed change" in instructions
    assert "confirms it was applied" in instructions
    assert "when the tool is available" in instructions
    assert "to Backend Butler with hand_to_butler" not in instructions


@pytest.fixture
def capture_llm(monkeypatch):
    def capture(_agent, context, tools, _settings):
        return context.items[-1], tools

    monkeypatch.setattr(Agent.default, "llm_node", capture)
    return agent.HomeAssistantAgent.__new__(agent.HomeAssistantAgent)


@pytest.mark.parametrize(
    "update",
    [
        "The configuration is still in progress.",
        "Approval needed: Update the porch schedule. (approval test-id)",
        "I received approval for the porch schedule.",
        "The porch schedule was applied and verified.",
        "I couldn’t finish the request.",
    ],
)
def test_butler_updates_are_first_person_status_without_tools(capture_llm, update):
    user = ChatMessage(role="user", content=[f"{UPDATE_PREFIX} butler: {update}"])
    note, tools = capture_llm.llm_node(ChatContext([user]), ["action-tool"], None)

    assert tools == []
    assert note.role == "system"
    assert "first person" in note.text_content
    assert "exact proposed change" in note.text_content
    assert "confirms it was applied" in note.text_content


def test_external_update_still_disables_tools_without_butler_attribution(capture_llm):
    user = ChatMessage(role="user", content=[f"{UPDATE_PREFIX} other: Task finished."])
    note, tools = capture_llm.llm_node(ChatContext([user]), ["action-tool"], None)

    assert tools == []
    assert "Take no action" in note.text_content
    assert "first person" not in note.text_content


def test_person_can_answer_approval_after_an_update(capture_llm):
    update = ChatMessage(
        role="user",
        content=[f"{UPDATE_PREFIX} butler: Approval needed. (approval test-id)"],
    )
    answer = ChatMessage(role="user", content=["Yes, apply that change."])
    latest, tools = capture_llm.llm_node(
        ChatContext([update, answer]), ["decide_approval"], None
    )

    assert latest is answer
    assert tools == ["decide_approval"]
