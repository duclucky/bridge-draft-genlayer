from pathlib import Path


SOURCE = Path("contracts/bridge_draft.py")


def test_contract_source_is_ascii_pinned_and_has_one_visible_contract_class():
    raw = SOURCE.read_bytes()
    source = raw.decode("ascii")
    assert source.startswith('# v0.5.0\n# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }\n')
    assert source.count("class BridgeDraftContract(gl.contract.Contract):") == 1
    assert "run_nondet_default" in source
    assert "run_nondet_unsafe" not in source
    assert "gl.vm.run_nondet(" not in source


def test_time_guards_use_canonical_transaction_datetime_not_timestamp_rpc():
    source = SOURCE.read_text(encoding="ascii")
    assert 'gl.message_raw["datetime"]' in source
    assert "gl.message.datetime" in source
    assert "datetime.fromisoformat" in source
    assert "gl.vm.get_timestamp" not in source


def test_eoa_value_transfers_use_the_external_message_interface():
    source = SOURCE.read_text(encoding="ascii")
    assert "@gl.evm.contract_interface" in source
    assert "class EoaRecipient:" in source
    assert "EoaRecipient(gl.message.sender_address).emit_transfer(value=u256(GEN))" in source
    assert "EoaRecipient(gl.message.sender_address).emit_transfer(value=u256(SESSION_BUDGET))" in source
    assert "gl.chain.Account" not in source
