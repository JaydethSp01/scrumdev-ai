"""Tests del state machine SDLC del orchestrator."""
from services.orchestrator_service.app.state_machine import (
    can_transition,
    crew_for_state,
    next_state,
    requires_human_approval,
)
from shared.events.event_types import (
    WORKFLOW_STATE_ARCHITECTURE_APPROVAL,
    WORKFLOW_STATE_ARCHITECTURE_INCEPTION,
    WORKFLOW_STATE_BACKLOG,
    WORKFLOW_STATE_DEVELOPMENT,
    WORKFLOW_STATE_NFR_CAPTURE,
    WORKFLOW_STATE_READY_FOR_DEV,
    WORKFLOW_STATE_REFINEMENT,
    WORKFLOW_STATE_RELEASE_APPROVAL,
    WORKFLOW_STATE_RELEASED,
)


def test_full_happy_path_progression():
    """Recorre el camino feliz BACKLOG -> RELEASED y valida cada transicion."""
    state = WORKFLOW_STATE_BACKLOG
    visited = [state]
    while state != WORKFLOW_STATE_RELEASED:
        nxt = next_state(state)
        assert can_transition(state, nxt), f"transicion {state} -> {nxt} invalida"
        state = nxt
        visited.append(state)
    assert len(visited) >= 14
    assert visited[-1] == WORKFLOW_STATE_RELEASED


def test_nfr_comes_after_refinement():
    assert next_state(WORKFLOW_STATE_REFINEMENT) == WORKFLOW_STATE_NFR_CAPTURE


def test_architecture_inception_after_nfr():
    assert next_state(WORKFLOW_STATE_NFR_CAPTURE) == WORKFLOW_STATE_ARCHITECTURE_INCEPTION


def test_approval_required_at_architecture_and_release():
    assert requires_human_approval(WORKFLOW_STATE_ARCHITECTURE_APPROVAL)
    assert requires_human_approval(WORKFLOW_STATE_RELEASE_APPROVAL)
    assert not requires_human_approval(WORKFLOW_STATE_DEVELOPMENT)
    assert not requires_human_approval(WORKFLOW_STATE_REFINEMENT)


def test_arbitrary_transition_rejected():
    assert not can_transition(WORKFLOW_STATE_BACKLOG, WORKFLOW_STATE_RELEASED)
    assert not can_transition(WORKFLOW_STATE_REFINEMENT, WORKFLOW_STATE_DEVELOPMENT)


def test_failed_transition_always_allowed():
    from shared.events.event_types import WORKFLOW_STATE_FAILED

    assert can_transition(WORKFLOW_STATE_BACKLOG, WORKFLOW_STATE_FAILED)
    assert can_transition(WORKFLOW_STATE_READY_FOR_DEV, WORKFLOW_STATE_FAILED)


def test_crew_for_known_states():
    assert crew_for_state(WORKFLOW_STATE_REFINEMENT) == "refinement"
    assert crew_for_state(WORKFLOW_STATE_ARCHITECTURE_INCEPTION) == "architecture"
    assert crew_for_state(WORKFLOW_STATE_DEVELOPMENT) == "delivery"


def test_crew_none_for_pure_human_states():
    assert crew_for_state(WORKFLOW_STATE_ARCHITECTURE_APPROVAL) is None
    assert crew_for_state(WORKFLOW_STATE_NFR_CAPTURE) is None
