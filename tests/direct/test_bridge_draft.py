import json

from eth_utils import to_hex


GEN = 10**18
COLLECT_DEADLINE = 1_900_000_000
RATIFY_DEADLINE = 1_900_003_600


def _review(session_id: str, verdict: str = "BALANCED", draft: str | None = None, missing: bool = False) -> dict:
    if draft is None:
        draft = "Keep the named rollback owner and observable incident handoff available to both operating parties."
    coverage = [
        {"term_id": session_id + ":A:1", "status": "SATISFIED"},
        {"term_id": session_id + ":B:1", "status": "SATISFIED"},
    ]
    if verdict == "CONFLICTING":
        coverage[0]["status"] = "UNSATISFIED"
    if missing:
        coverage.pop()
    return {
        "verdict": verdict,
        "coverage": coverage,
        "conflict_term_ids": [] if verdict == "BALANCED" else [session_id + ":A:1"],
        "draft": draft,
    }


def _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_alice
    direct_vm.value = 2 * GEN
    return contract.create_session(to_hex(direct_bob), to_hex(direct_charlie), "handoff", COLLECT_DEADLINE, RATIFY_DEADLINE)


def _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie):
    direct_vm.sender = direct_bob
    contract.submit_constraint(session_id, 1, "Keep the rollback owner named")
    direct_vm.sender = direct_charlie
    contract.submit_constraint(session_id, 1, "Keep incident handoff observable")


def _open_balanced(contract, direct_vm, session_id, direct_bob, direct_charlie):
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id))))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)


def test_session_requires_exactly_two_gen(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    with direct_vm.expect_revert("exactly 2 GEN"):
        contract.create_session(to_hex(direct_bob), to_hex(direct_charlie), "handoff", COLLECT_DEADLINE, RATIFY_DEADLINE)


def test_session_rejects_malformed_party_address(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 2 * GEN
    with direct_vm.expect_revert("invalid account address"):
        contract.create_session("not-an-evm-address", to_hex(direct_charlie), "handoff", COLLECT_DEADLINE, RATIFY_DEADLINE)


def test_only_registered_party_can_add_a_term(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("registered party only"):
        contract.submit_constraint(session_id, 1, "Keep handoff steps observable")


def test_each_party_can_lock_up_to_three_immutable_constraints(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_bob
    contract.submit_constraint(session_id, 1, "Keep the rollback owner named")
    contract.submit_constraint(session_id, 2, "Keep the handoff owner accountable")
    contract.submit_constraint(session_id, 3, "Keep material changes observable")
    with direct_vm.expect_revert("sequence must be next"):
        contract.submit_constraint(session_id, 3, "Replace the locked term")
    with direct_vm.expect_revert("sequence must be 1 through 3"):
        contract.submit_constraint(session_id, 4, "A fourth term must not be stored")


def test_review_requires_both_sides_and_exact_coverage_before_balanced_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("both parties must submit"):
        contract.request_review(session_id)
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id, missing=True))))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)
    assert contract.get_session_phase(session_id) == "RETRYABLE"


def test_two_distinct_ratifications_create_exactly_two_one_gen_credits(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _open_balanced(contract, direct_vm, session_id, direct_bob, direct_charlie)
    digest = contract.get_draft_digest(session_id)
    assert contract.get_session_phase(session_id) == "BALANCED_DRAFT"
    direct_vm.sender = direct_bob
    contract.ratify(session_id, digest)
    assert contract.get_credit(session_id, to_hex(direct_bob)) == 0
    direct_vm.sender = direct_charlie
    contract.ratify(session_id, digest)
    assert contract.get_session_phase(session_id) == "RATIFIED"
    assert contract.get_credit(session_id, to_hex(direct_bob)) == GEN
    assert contract.get_credit(session_id, to_hex(direct_charlie)) == GEN
    direct_vm.sender = direct_bob
    contract.withdraw_credit(session_id)
    assert contract.get_credit(session_id, to_hex(direct_bob)) == 0
    with direct_vm.expect_revert("credit already withdrawn"):
        contract.withdraw_credit(session_id)


def test_one_ratification_never_creates_credit(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("balanced draft required"):
        contract.ratify(session_id, "0" * 64)


def test_exact_collection_deadline_rejects_term_without_mutation(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp("2030-03-17T17:46:40+00:00")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("deadline passed"):
        contract.submit_constraint(session_id, 1, "Late term must never be stored")
    assert contract.get_session_phase(session_id) == "COLLECTING"


def test_sponsor_can_refund_exactly_at_ratify_deadline_once(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp("2030-03-17T18:46:40+00:00")
    direct_vm.sender = direct_alice
    contract.refund_expired(session_id)
    assert contract.get_session_phase(session_id) == "EXPIRED_REFUNDED"
    with direct_vm.expect_revert("refund already paid"):
        contract.refund_expired(session_id)


def test_validator_rejects_leader_coverage_lie_without_credit(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _open_balanced(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.clear_mocks()
    validator = _review(session_id, "CONFLICTING")
    del validator["draft"]
    direct_vm.mock_llm(r"BridgeDraft validator", json.dumps(json.dumps(validator)))
    assert direct_vm.run_validator() is False
    assert contract.get_credit(session_id, to_hex(direct_bob)) == 0


def test_validator_accepts_semantically_identical_coverage_in_a_different_order(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id))))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)
    direct_vm.clear_mocks()
    validator = _review(session_id)
    del validator["draft"]
    validator["coverage"].reverse()
    direct_vm.mock_llm(r"BridgeDraft validator", json.dumps(json.dumps(validator)))
    assert direct_vm.run_validator() is True


def test_retry_requires_retryable_state_and_does_not_move_ledger(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id, missing=True))))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)
    assert contract.get_session_phase(session_id) == "RETRYABLE"
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id))))
    contract.retry_review(session_id)
    assert contract.get_session_phase(session_id) == "BALANCED_DRAFT"


def test_exact_ratification_deadline_rejects_without_creating_credit(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _open_balanced(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.warp("2030-03-17T18:46:40+00:00")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("deadline passed"):
        contract.ratify(session_id, contract.get_draft_digest(session_id))
    assert contract.get_session_phase(session_id) == "BALANCED_DRAFT"
    assert contract.get_credit(session_id, to_hex(direct_bob)) == 0


def test_unknown_output_key_is_retryable_and_never_changes_ledger(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    malformed = _review(session_id)
    malformed["amount_gen"] = 999
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(malformed)))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)
    assert contract.get_session_phase(session_id) == "RETRYABLE"
    assert contract.get_credit(session_id, to_hex(direct_bob)) == 0
    assert contract.get_credit(session_id, to_hex(direct_charlie)) == 0


def test_session_index_and_actionability_are_canonical(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    assert contract.get_sessions_for_account(to_hex(direct_alice)) == [session_id]
    assert contract.get_sessions_for_account(to_hex(direct_bob)) == [session_id]
    assert contract.get_actionability(session_id, to_hex(direct_bob)) == ["submit_constraint"]


def test_only_sponsor_can_refund_and_conflict_is_refundable_without_waiting(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/bridge_draft.py")
    session_id = _create(contract, direct_vm, direct_alice, direct_bob, direct_charlie)
    _submit_pair(contract, direct_vm, session_id, direct_bob, direct_charlie)
    direct_vm.mock_llm(r"BridgeDraft semantic review", json.dumps(json.dumps(_review(session_id, "CONFLICTING"))))
    direct_vm.sender = direct_bob
    contract.request_review(session_id)
    assert contract.get_session_phase(session_id) == "CONFLICTING"
    with direct_vm.expect_revert("sponsor only"):
        contract.refund_expired(session_id)
    direct_vm.sender = direct_alice
    contract.refund_expired(session_id)
    assert contract.get_session_phase(session_id) == "EXPIRED_REFUNDED"
