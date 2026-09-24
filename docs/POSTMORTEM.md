# BridgeDraft v0.5 closeout

## Outcome

- Category: Projects.
- Active Studio Dev contract: `0xb49039e50e549E3c93Cf2303D07740698e8de7ef`.
- Deployment transaction: `0xd412ba2a30e4247c43ca6403091759b6ce753a75a9ed54ba123158100f29f9f2`.
- Deployment execution: `Result: SUCCESS` and finalized.
- Full lifecycle: 2 GEN locked, bilateral collection completed, validator review produced `BALANCED_DRAFT`, both parties ratified, and two 1 GEN withdrawals finalized.
- Final canonical accounting: `locked_gen=0`, both credits `0`, native contract balance `0 GEN`.
- Production app: `https://bridge-draft.vercel.app`.

## Transfer defect and correction

Revision `0xD8CF71e375C5B93b699447bb54Af2319d9a1b990` incorrectly used `gl.chain.Account(...).emit_transfer`. Parent withdrawal writes finalized and cleared the internal credits, but no valid EOA external message moved the 2 GEN native balance. Because both withdrawal flags were already terminal and the contract had no recovery entrypoint, that revision is `ABANDONED_BROKEN_TRANSFER`; it must receive no more value.

Version 0.5 uses one `@gl.evm.contract_interface` recipient type and emits finalized EOA value messages with `emit_transfer(value=u256(...))`. A regression test rejects the old API. The lifecycle verifier now checks the contract balance after each withdrawal instead of treating parent finalization as transfer proof. Recipient net balance increased by slightly less than 1 GEN because transaction fees were charged in the same window; contract balance deltas provide the exact transfer proof.

## Reusable lessons

1. Parent `FINALIZED_SUCCESS` proves the parent write, not execution of its child/external value message.
2. Internal zero accounting and native contract balance must be reconciled before calling settlement complete.
3. A value-moving demo needs contract balance before/after plus recipient evidence; a transaction hash and cleared credit are insufficient.
4. Recovery must be designed before value is accepted. A terminal withdrawal flag without child-message reconciliation can orphan funds.

## Milestone headroom

After v1 acceptance, the strongest substantial milestone is a separately owned workflow-router consumer that authenticates the BridgeDraft contract and accepts only a ratified draft digest. A later extension can add versioned three-party sessions and an explicit appeal path; neither is claimed in v1.
