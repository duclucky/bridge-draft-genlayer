# BridgeDraft specification

## Identity

- Idea ID: IDEA-034
- Category: Projects
- Status: READY FOR SUBMISSION (Studio Dev lifecycle, public repository, and public production hosting verified)
- Repository: local child repository `D:\Genlayer Project\bridge-draft`
- Network: Studio Dev (endpoint/chain parameters require action-time verification)

## Product hook

BridgeDraft turns two locked operational briefs into a shared draft that both parties must ratify before a fixed 2 GEN work budget becomes two 1 GEN credits.

## Scope and non-goals

Parties submit bounded non-negotiables, inspect a canonical draft and its coverage outcome, then ratify only a balanced draft. A sponsor creates and funds the session. Users need a session summary, their own constraint form, the current draft/status, their ratification action, retry/refund guidance, and credit balance. No screen presents a wallet, transaction, balance, or finality result as live before a deployed contract returns it.

### In scope

- Two registered EVM addresses, each submitting up to three bounded operational constraints.
- A fixed 2 GEN sponsor deposit, independently judged candidate draft, bilateral ratification, two fixed 1 GEN credits, withdrawal, and sponsor refund on terminal non-ratification.
- Canonical contract views and a browser product that reads them and signs real actions once configured.

### Out of scope

- Legal agreements/advice, identity verification, proof that offchain work happened, external document/oracle authentication, arbitrary payouts, custody, and a third-party arbiter.
- Claims that the operator does not generate the candidate draft. In this MVP the operator may generate it; GenLayer is authoritative only over semantic judgment of the exact submitted draft bytes.

## Product/frontend blueprint

### Users and jobs

| Role | Job | Outcome |
| --- | --- | --- |
| Sponsor | Fund a neutral drafting session | A bounded 2 GEN work budget with a safe expiry refund |
| Party A/B | Protect non-negotiables and approve a workable draft | A shared operational draft and, only after bilateral ratification, a 1 GEN credit |

### Route map

| Route | User job | Primary action | States |
| --- | --- | --- | --- |
| `/` | Understand the product and enter a workflow | Start a session | disconnected, configured, loading, error |
| `/sessions` | Find and revisit sessions | Filter/open a session | empty, loading, error, populated |
| `/sessions/new` | Sponsor a new session | Create with exactly 2 GEN | field errors, wallet/configuration error, submitted/finalized |
| `/sessions/:id` | Submit constraints, read draft and ratify when eligible | Submit / ratify / retry / withdraw contextually | collecting, review, retryable, balanced, ratified, expired |
| `/account` | Manage connection and see credits | Open wallet menu / disconnect | disconnected, connected, configuration error |
| `/help` | Understand scope, safety and recovery | Review workflow help | static support content |

Persistent navigation links Home, Sessions, New session, Help and Account. Mobile uses the same labeled navigation without hiding core routes.

### Visibility and actions

| Group/control | Visibility | Rule |
| --- | --- | --- |
| Session status, party-facing draft, next legal action | USER_PRIMARY | Canonical values only after adapter integration |
| Explorer link and transaction details | USER_CONTEXTUAL | Optional technical disclosure |
| Constraint IDs, validator rationale, attempts and raw storage | SYSTEM_ONLY | Never primary UI |
| Create session / submit constraints / ratify / retry / withdraw | USER_PRIMARY | Role and canonical-state gated |

### User-facing language

| Canonical state | Label | Next step |
| --- | --- | --- |
| COLLECTING | Waiting for both briefs | Submit your constraints |
| `request_review` / `retry_review` pending finality | Draft under review | Wait for a finalized result, then reload canonical state |
| BALANCED_DRAFT | Ready for both approvals | Review and ratify if it protects your constraints |
| RETRYABLE | Review needs another attempt | Retry when you are eligible |
| RATIFIED | Shared draft confirmed | Withdraw your 1 GEN credit |
| EXPIRED_REFUNDED | Session expired safely | Sponsor can confirm the refund |

### Visual preservation

Use the persisted `design-system/bridgedraft/MASTER.md`: Swiss minimalism, blue information hierarchy, orange primary calls to action, Lora/Raleway, generous spacing and subtle motion. Later work may only add legal controls/states or accessibility corrections; it must not redesign the route structure, colors, typography, or hierarchy.

## Trust problem and fingerprint

- Decision that must not depend on one party: whether a shared draft preserves every locked party constraint without material conflict, and whether a 2 GEN budget may become two 1 GEN credits.
- Why database/ordinary EVM/backend LLM is insufficient: a sponsor, party, or backend could replace terms, label an incomplete draft balanced, or unlock credits before bilateral consent. Validator-controlled semantic comparison must operate over canonical bytes.
- Value/rights at risk: sponsor's 2 GEN, each party's right to a 1 GEN credit, and the canonical ratified-draft digest.
- Trust problem: no participant/operator may unilaterally decide that a compromise draft preserves both parties' locked terms before value rights open.
- Actors/adversary: sponsor, Party A, Party B, arbitrary caller, and malformed or biased leader output.
- Evidence class + authenticity: contractual terms are direct transaction inputs signed by the registered A/B wallet and bound to canonical session/sequence. They assert only sender's own proposed term, never an external fact.
- Consensus question: does the candidate draft cover each canonical term and avoid a material contradiction?
- State machine: each finalized review write moves `COLLECTING` or `RETRYABLE` directly to `BALANCED_DRAFT`, `CONFLICTING`, or `RETRYABLE`; a balanced draft reaches `RATIFIED` only by both role-bound ratifications; non-ratified paths reach `EXPIRED_REFUNDED`.
- Direct consequence: only a validator-accepted balanced draft plus bilateral ratification creates two fixed 1 GEN credits. Conflict/expiry creates only the sponsor's 2 GEN refund path.
- Reuse surface: a bounded bilateral semantic-agreement primitive for agent handoffs, DAO working groups, and inter-team runbooks.

## Mandatory gate matrix

| Gate | PASS/FAIL | Evidence/reason |
| --- | --- | --- |
| Replacement | PASS | A database cannot give validator-controlled semantic preservation or canonical GEN rights; ordinary EVM cannot perform the semantic comparison. |
| Judgment | PASS | Semantic coverage/material contradiction, not keyword matching, is load-bearing. |
| Evidence availability | PASS | Complete review corpus is bounded canonical state: 1-3 terms from each registered wallet. |
| Evidence authenticity | PASS | Direct transaction sender is checked against registered party/session; each term represents only its sender's own contractual input. |
| Equivalence | PASS | Validator assesses the leader's exact draft against the same canonical terms and must agree on normalized verdict, coverage, and conflicts. |
| Consequence | PASS | Accepted balance plus bilateral ratification deterministically opens fixed credits; rejected/undetermined review opens none. |
| Adversarial | PASS | Role binding, immutable snapshots, exact coverage sets, semantic replay, deadlines, and idempotent accounting address manipulation. |
| State model | PASS | Keyed sessions, terms, draft digest, verdict, ratification, credits, and refund have legal transitions. |
| Reuse | PASS | Stable session/actionability/draft/credit views do not embed a vertical workflow. |
| Contract count | PASS | One contract suffices; the frontend is a consumer, not a pass-through contract. |
| Differentiation | PASS | Unlike ScopeSeal's TED comparison, CanonMerge's fiction canon, and MandateMesh's public-mandate allocation, this is bilateral operational compromise before symmetric credits. |
| Claim-to-code | PASS | Each claim maps to state/method, view, test, and planned evidence below. |
| Full lifecycle | PASS | Creation, terms, review, retry, conflict, ratification, withdrawal, expiry refund, and closed-state rejection are explicit. |
| Scope honesty | PASS | No legal/external-performance/authenticated-generation claim; operator can generate draft and GenLayer judges exact bytes. |

One FAIL means redesign/reject. These gate results do not claim deployment, browser, or production-evidence success.

## Actors, roles and incentives

| Actor | Permissions | Value at risk | Incentive to bias |
| --- | --- | --- | --- |
| Sponsor | Creates session, supplies exactly 2 GEN, receives only eligible refund | 2 GEN | Avoid payment or choose favorable parties |
| Party A | Submits 1-3 own terms; ratifies only Party A side | potential 1 GEN | Omit Party B requirement or ratify prematurely |
| Party B | Submits 1-3 own terms; ratifies only Party B side | potential 1 GEN | Omit Party A requirement or ratify prematurely |
| Validator set | Checks leader draft semantically | none | Accept misleading coverage declaration |
| Arbitrary caller | Public views only | none | Attempt unauthorized/replayed/late action |

## State model

### Stable IDs and structured storage

- `session_id` is derived onchain from `(sponsor, sponsor_nonce)`; callers never supply a trusted identity.
- `term_id` is `<session_id>:A|B:<sequence>`, sequence 1-3; role derives from sender.
- `draft_digest` is Keccak-256 of the exact stored ASCII draft; ratification must supply this exact digest.
- `(session_id, party)` is the one-withdrawal key. `Session` stores sponsor, A/B, title, deadlines, phase, the 2 GEN refundable/credit ledger, draft/digest, verdict, ratification bits, credit bits, withdrawal bits, refund bit, and participant index. `Term` stores canonical session, role, sequence, and bounded text; role is authenticated from sender at write time. There are no global `last_*` fields.

### State machine

```text
NEW --create_session(2 GEN)--> COLLECTING
COLLECTING --Party A/B submit_constraint before collection deadline--> COLLECTING
COLLECTING --each party mark_collection_complete after its own terms--> COLLECTING
COLLECTING --registered party request_review after bilateral completion or collection deadline--> BALANCED_DRAFT|CONFLICTING|RETRYABLE
RETRYABLE --registered party retry_review before ratify deadline--> BALANCED_DRAFT|CONFLICTING|RETRYABLE
BALANCED_DRAFT --A or B ratify exact digest--> A_RATIFIED or B_RATIFIED
A_RATIFIED/B_RATIFIED --other party ratify exact digest--> RATIFIED
RATIFIED --each credited party withdraws once--> RATIFIED
COLLECTING|RETRYABLE|BALANCED_DRAFT|A_RATIFIED|B_RATIFIED --sponsor refund at/after expiry--> EXPIRED_REFUNDED
CONFLICTING --sponsor refund--> EXPIRED_REFUNDED
```

### Temporal entrypoint rules

- Canonical time is the pinned GenVM transaction-time API verified before source implementation.
- Constraint and completion writes require `now < collect_deadline`; review requires bilateral completion while `now < collect_deadline`, or may proceed at/after that deadline; review/retry/ratification still require `now < ratify_deadline`. `refund_expired` requires `now >= ratify_deadline`, except immediately from finalized `CONFLICTING`.
- Every time-sensitive public method enforces its own condition before mutation. Stale active phase at exact deadline rejects the active write and leaves only recovery.
- Only sponsor may refund; it requires a non-ratified legal state, unpaid refund flag, and ledger-held refundable amount. Credits are never refunded after `RATIFIED`; owners withdraw independently.

### Illegal transitions, authorization and idempotency

- Parties, deadlines, terms, per-party completion flags, sponsor amount, and draft digest are immutable after their legal write. A party that marks its own collection complete cannot add another term, but cannot close or restrict the other party's collection. No terminal phase returns to active.
- `create_session` needs two nonzero, distinct non-sponsor parties; `submit_constraint`, review/retry, ratify, withdrawal, and refund each verify the exact stored role described in the safety matrix.
- Term `(role,sequence)`, active review, ratification bit, credit creation, withdrawal bit, and refund bit are one-way. Repeated calls reject before value movement.

## Write-method safety matrix

| Method | Caller | Allowed states | Forbidden states | Temporal/expiry gate | Idempotency | Value/accounting effect | Views affected | Negative tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create_session` | sponsor | new | existing ID | N/A; bounded future deadlines | unused nonce/ID | receives exactly `2 * 10**18` (=2 GEN); locked ledger =2 GEN | session, actionability | wrong value, same parties, bad address/deadline, collision |
| `submit_constraint` | registered A/B | `COLLECTING` | all others | `now < collect_deadline`; equality rejects | unused role/sequence, cap 3 | none | terms/session/actionability | wrong caller/state, -1/exact/+1 boundary, duplicate, cap, malformed |
| `mark_collection_complete` | registered A/B with own term count >=1 | `COLLECTING` | all others | `now < collect_deadline`; equality rejects | own completion bit must be false | none | session/actionability | wrong caller/state, no own term, duplicate, exact boundary; one side cannot block the other's remaining terms |
| `request_review` | registered A/B | `COLLECTING` with both term counts >=1 | all others | `now < ratify_deadline`; before collection deadline both completion bits are required; at/after collection deadline they are not | no active review | none | session/result/actionability | wrong caller/state, missing term side, unilateral early review, collection and ratification boundaries, malformed outputs |
| `retry_review` | registered A/B | `RETRYABLE` | all others | `now < ratify_deadline`; equality rejects | current retryable review only | none | session/result/actionability | wrong caller/state, boundaries, duplicate, accounting unchanged |
| `ratify` | own A/B | balanced/other-side-ratified | all others | `now < ratify_deadline`; equality rejects | own bit false + digest match | second unique bit creates exactly two 1 GEN credits | session/credit/actionability | wrong caller, stale digest, duplicate, boundaries, no double credit |
| `withdraw_credit` | credited A/B | `RATIFIED` | all others | N/A: earned credit is non-temporal | own withdrawal false | debit own credit, then emit exactly 1 GEN to the authenticated caller through the EOA external-message interface | credit/session accounting plus child-message receipt and contract/recipient balance delta | wrong caller/state, duplicate, transfer/accounting invariant, wrong recipient interface |
| `refund_expired` | sponsor | `CONFLICTING` or expired non-ratified states | ratified/refunded/reviewing | conflicting N/A; otherwise `now >= ratify_deadline` | refund false | clear locked ledger, then emit exactly 2 GEN to the authenticated sponsor through the EOA external-message interface | session/refund/actionability plus child-message receipt and contract/recipient balance delta | wrong caller/state, -1/exact/+1, duplicate, no credits, wrong recipient interface |

## Frontend lifecycle coverage matrix

| Canonical state | User action | Contract write | UI component | Frontend test | Evidence status |
| --- | --- | --- | --- | --- | --- |
| no session | sponsor creates | `create_session` | New session form | real-SDK offline wallet preflight | wrapper complete; live write pending authorization/deployment |
| `COLLECTING` | party saves term | `submit_constraint` | Session action card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| `COLLECTING` | party finishes its own brief | `mark_collection_complete` | Session action card | adapter and direct regression checks | wrapper complete; cannot close the other party's collection |
| `COLLECTING` | party requests review | `request_review` | Session action card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| `RETRYABLE` | party retries | `retry_review` | Retry card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| balanced ratification | party ratifies | `ratify` | Draft approval card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| `RATIFIED` | party withdraws | `withdraw_credit` | Account/session credit card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| eligible refund | sponsor refunds | `refund_expired` | Session recovery card | TypeScript/build; live browser pending | wrapper complete; no simulated canonical state |
| finalized write | user sees canonical result | public views | session/account reload | adapter preflight + browser proxy read | reload occurs only after finalization; live write pending |

## Evidence policy

- Authoritative sources: canonical BridgeDraft storage and authenticated transaction sender supplied by GenVM. Validator result is authoritative only for semantic review of those canonical bytes.
- Provenance/authentication: `gl.message.sender` must equal stored sponsor/A/B on each consequential write; fetched artifact, screenshot, signature-like text, or URL is never accepted.
- Authorized attestor/signer: registered direct sender for own term/ratification; GenLayer validator set for review acceptance.
- Anti-replay identity: session ID, role, term sequence, review ID, and exact draft digest bind every action; they are locked storage, not caller prose.
- Timestamp bounds: transaction time is checked locally at the entrypoint; no actor timestamp is trusted.
- Policy/source version: immutable contract source/deployment identity; no mutable external source URL exists in this MVP.
- Allowed domains/paths: none; consensus performs no network fetch.
- Bounds: title 1-80 chars; term 1-280 chars; 1-3 terms per party; draft 80-1,200 chars; contract source and normalized wire strings are ASCII.
- Missing terms block review. Contradiction blocks credits. Nondeterministic, parse, or validator failure is `RETRYABLE` with ledger unchanged. Private/unverifiable evidence is excluded.
- Objective and binding come from locked session/roles/term IDs/review ID. Untrusted terms/draft are delimited data; they cannot redefine authority, schema, state, or amounts.

### Evidence Authority Matrix

| Consequential claim/fact | Evidence/artifact | Data controller | Authoritative source/issuer | Deterministic verification | Canonical objective/entity/actor binding | Freshness/anti-replay | Semantic role after verification | Non-penalizing failure state | Consequence blocked | Required negative test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Party A's locked own term | direct `submit_constraint` text | Party A | stored A wallet | sender=A; session exists; unique sequence 1-3; ASCII/length/deadline | code derives session, role A, term ID, author | unique `(session,A,sequence)` and tx deadline | canonical review input only | reject/no mutation | review, ratification, credits | valid text from B or wrong session/sequence leaves ledger/phase unchanged |
| Party B's locked own term | direct `submit_constraint` text | Party B | stored B wallet | same checks for B | code derives session, role B, term ID, author | unique `(session,B,sequence)` and deadline | canonical review input only | reject/no mutation | review, ratification, credits | valid text from A or replayed sequence leaves ledger/phase unchanged |
| Draft semantic result | leader draft + normalized coverage/conflicts | operator/model | GenLayer validator through `run_nondet_default` | strict schema/enum/bounds; exact stored IDs once; verdict derived from coverage; validator assesses exact draft against terms and must match | code supplies session/review/roles/terms and ignores authority text | active review ID + stored digest | decides balanced/conflicting/retryable only | retry/revert before mutation | credits and transfer | valid shape with extra/missing ID, class mismatch, altered review ID, or injection prose leaves accounting unchanged |
| Bilateral consent | direct `ratify` carrying digest | Party A/B | stored party wallet | sender role, legal state/time, own bit false, exact stored digest | code derives session/digest/role | one bit per party and exact digest | both bits permit deterministic credits | reject/no mutation | credits/withdrawal | correct digest from wrong role, stale digest/replay, or exact-boundary action creates no credit |

## Consensus design

### Leader task

- Inputs: canonical session/review IDs, role labels, every stored term ID/text, and no external data.
- Fetch: none. Extraction: quote bounded terms as untrusted data and assess a candidate shared draft.
- Normalization: reject non-object/unknown keys, non-ASCII or oversized fields, duplicate/missing IDs, invalid enum, malformed array, and unexpected authority/amount field before mutation.
- Structured output: `{"verdict":"BALANCED|CONFLICTING","coverage":[{"term_id":"...","status":"SATISFIED|UNSATISFIED"}],"conflict_term_ids":["..."],"draft":"..."}`. `RETRYABLE` is contract handling of no safe accepted result, never a leader-selected payout value.

### Consensus-critical fields

| Field | Type/bounds | Comparison rule | Why critical |
| --- | --- | --- | --- |
| `verdict` | `BALANCED` or `CONFLICTING` | validator equality and code-derived coverage invariant | controls whether ratification is offered |
| `coverage` | every canonical term ID exactly once; status enum | exact ID set and per-ID status equality | prevents omitted/duplicated constraints |
| `conflict_term_ids` | sorted unique subset of canonical IDs | exact set; each must map to a non-satisfied term | blocks arbitrary conflict labels |
| `draft` | ASCII 80-1,200 chars | validator semantically assesses this exact string; digest stored | this is the ratified object |
| `session_id/review_id` | canonical scalars | supplied by code, never trusted from output | blocks cross-session/replay confusion |

### Validator and rationale policy

- Validator receives exact canonical terms and the leader draft, independently assesses satisfaction/material conflicts, and compares normalized verdict/coverage/conflicts to leader output.
- `BALANCED` requires all terms `SATISFIED`, empty conflict set, and semantic agreement that exact draft has no material contradiction. Other safe findings are `CONFLICTING`; output failure/disagreement is `RETRYABLE`.
- Reject wrong schema, unknown/missing/duplicate ID, invalid enum, invariant inconsistency, unrelated conflict, disagreement, or any output that supplies amount/role/state authority.
- Raw prompts/rationale are system-only. A short sanitized coverage summary can appear after finalization; no prose controls a transition or amount.

## Consequence and accounting

| Verdict | Canonical state change | Consumer action | Value movement |
| --- | --- | --- | --- |
| accepted `BALANCED` | `BALANCED_DRAFT` | each party may inspect/ratify | none |
| accepted `CONFLICTING` | `CONFLICTING` | sponsor may refund | none until derived refund |
| invalid/disagreed/undetermined | `RETRYABLE` or reverted | registered party may retry before deadline | none |
| both valid ratifications | `RATIFIED`, two credit bits | each party may withdraw | exactly 1 GEN withdrawable per party |
| eligible expiry/non-ratification | `EXPIRED_REFUNDED` | sponsor receives refund | exactly 2 GEN once |

- Accepted/finalized boundary: only finalized nondeterministic review establishes a result; finalized ratifications establish bits; transfer uses finalized ledger state only.
- Ledger invariant: before ratification `locked_values` is exactly 2 GEN and refundable; after both ratifications it is zero and exactly two 1 GEN credits exist; each withdrawal clears one credit before its finalized transfer. Refund clears the 2 GEN locked amount before its finalized transfer. Model output never supplies accounting.
- Debit ledger before external transfer; safe allowlisted receipt fields plus canonical view prove withdrawal/refund. No appeal/cure exists; retry is a bounded non-consequential review action only.

## Reusable interface

### Write methods

- `create_session(party_a, party_b, title, collect_deadline, ratify_deadline)` payable with exactly 2 GEN; party addresses are validated canonical `0x` EVM-address strings.
- `submit_constraint(session_id, sequence, text)`; `mark_collection_complete(session_id)`; `request_review(session_id)`; `retry_review(session_id)`.
- `ratify(session_id, draft_digest)`; `withdraw_credit(session_id)`; `refund_expired(session_id)`.

### View methods

- `get_session(session_id)` returns sanitized phase, roles, deadlines, eligible draft/digest, verdict, ratification flags, and finalized accounting summary.
- `get_terms(session_id)` returns role-tagged terms only at the allowed disclosure point.
- `get_actionability(session_id, account)` accepts a validated canonical address string and returns code-derived legal actions from contract transaction time, not a frontend guess.
- `get_sessions_for_account(account)` accepts a validated canonical address string and returns that registered account's canonical indexed session IDs.
- `get_credit(session_id, account)` returns only that account's derived 0/1 GEN credit and withdrawal status.

### Consumer/callback

- No callback/consumer contract exists in this MVP: the frontend reads views directly. Write idempotency is session/role/review/withdrawal keyed. Read failure is retried by frontend; semantic retry is contract-authorized only. There is no generic cancellation; sponsor-only refund is the bounded recovery method.

## Threat model

| Threat | Attack | Mitigation | Test |
| --- | --- | --- | --- |
| Sponsor coercion | mutate parties/deadlines/budget | immutable session fields and exact 2 GEN receive rule | mutation/incorrect-value rejection |
| Party substitution | submit as other role/overwrite term | sender-derived role, unique `(role,sequence)` | wrong sender, duplicate, isolation |
| Leader omission | drop disadvantageous term | exact coverage set + validator replay | missing/extra/duplicate ID |
| Semantic false balance | declare coverage while draft conflicts | validator checks exact leader draft; code invariant | leader/validator mismatch |
| Prompt injection | text changes authority/payout | delimited untrusted data; code schema/authority | injection leaves hard state unchanged |
| Replay/late action | stale digest or deadline action | digest/review IDs, bit flags, local time check | -1/exact/+1, stale digest |
| Double movement | repeat refund/withdraw | flags set before transfer and terminal guards | duplicate accounting |
| Operator overclaim | call candidate draft authenticated fact | explicit trusted-operator limitation | documentation/UI honesty review |

## Test plan

- Happy path: 2 GEN lock, both term sets, balanced review, both ratify, two 1 GEN withdrawals, and zero final contract accounting.
- Unauthorized and isolation: every write rejects wrong role and two sessions cannot cross-read/cross-mutate.
- Evidence failure: missing side term, malformed/non-ASCII/oversized term, wrong sequence/role, malformed output, and provenance-shaped replay block consequences.
- Malicious leader/validator: valid-shape extra/missing/duplicate ID, invalid enum, false verdict, unrelated conflict, amount-like field, and semantic mismatch leave ledger unchanged.
- Prompt injection: term/draft text attempting to redefine authority/entity/role/payout/policy cannot alter normalized outcome.
- Verdict/duplicate/recovery: balanced, conflicting, retryable; duplicate terms/reviews/ratification/withdraw/refund; every value/recovery wrong caller/state/closed/boundary/invariant path.
- Accounting: only base-unit transfer conversion represents 2/1/1 GEN; all user-facing output uses GEN. No orphaned value path.
- Frontend: adapter and browser tests will prove selected wallet/network only, each action's submitted/accepted/finalized/failed/retry display, and canonical reload; until then not claimed browser-complete.

## Claim-to-code matrix

| Product claim | Contract method/state | View/read | Direct test | Network evidence |
| --- | --- | --- | --- | --- |
| Sponsor locks exactly 2 GEN | `create_session`/locked ledger | `get_session` | wrong/valid value | deploy receipt + read |
| Only registered parties lock terms | `submit_constraint`/keyed terms | `get_terms`, `get_actionability` | auth/isolation/replay | party tx + read |
| Validators judge exact draft meaning | `request_review`/normalized result | `get_session` | semantic replay | finalized review + view |
| No term is silently omitted | coverage invariant | sanitized coverage | missing/extra/duplicate IDs | balanced view |
| Both parties consent | `ratify`/bits | `get_session` | order/wrong digest/duplicate | two txs + read |
| Exactly 1 GEN each after consent | `ratify`, `withdraw_credit` | `get_credit` | no early/double withdraw | receipt + balance/view |
| Non-ratified 2 GEN is recoverable | `refund_expired`/refund bit | `get_session` | conflict/expiry/double refund | receipt + balance/view |
| Browser does not simulate state | frontend adapter/view reload | session/account | adapter/browser lifecycle | browser capture + live RPC |

## Analogue and differentiation matrix

| Analogue/prior idea | Similar dimensions | Structural difference | Collision decision |
| --- | --- | --- | --- |
| ScopeSeal | semantic review, terms, stateful result | compares TED amendment to public procurement scope; BridgeDraft makes bilateral operational compromise and requires two ratifications before credits | retain |
| CanonMerge | multi-constraint semantic consistency | fiction canon protection without bilateral GEN-credit consent | retain |
| MandateMesh | roles and constrained outcomes | work allocation against public mandate, not bilateral private brief compromise | retain |

## Deployment and evidence plan

- Network: Studio Dev only, with current official endpoint/chain verification immediately before any action.
- Actors: existing authorized local EOAs only, with sponsor distinct from A/B where available. Variables are checked only for nonempty presence and never printed.
- Deploy: verify API/header/lint/direct tests, deploy resumably, save allowlisted identity/receipt fields, and read canonical state before any retry.
- Lifecycle: create with 2 GEN, both terms, review, both ratifications, and two 1 GEN withdrawals are finalized on the active revision; expiry refund remains a separately documented recovery path.
- Browser demo timing: the New session form sets a 10-minute collection deadline and offers 20-, 30-, or 60-minute ratification deadlines. These are explicitly short Studio Dev demo presets, not a claim about an appropriate production operating window; the deployed contract independently enforces both timestamps on every affected entrypoint.
- Canonical reads follow every finalized write. Evidence in `docs/evidence/studio-dev/` contains only sanitized command, receipt, state, browser, source-commit, and deployment-identity data.

## Definition of Done

### Projects

- [x] Frontend uses a real `genlayer-js` adapter with selected EIP-1193 provider, exact GEN value conversion, finality stages, and canonical reload wiring; offline real-SDK preflight passes.
- [x] Contract-level lifecycle/failure/retry and adversarial direct tests pass locally.
- [x] Canonical browser-read path uses a same-origin Studio Dev proxy; browser-local `eth_chainId` returns `0xf22d` with HTTP 200.
- [x] All claimed browser lifecycle writes have an adapter wrapper, state-gated control, finality handling, and canonical reload code.
- [x] Primary UI limits itself to user-relevant terms, draft, coverage, legal actions, and GEN credit; raw validator internals remain hidden.
- [x] Studio Dev deployment finalized and its BridgeDraft schema was read back from the deployed address.
- [x] Browser-wallet sponsor creation was confirmed on Studio Dev; the active revision's full lifecycle is separately labeled script-signed evidence.

## Live app

https://bridge-draft.vercel.app

## Current Studio Dev lifecycle evidence

- Active contract: `0xb49039e50e549E3c93Cf2303D07740698e8de7ef` ([Explorer](https://explorer-studio-dev.genlayer.com/address/0xb49039e50e549E3c93Cf2303D07740698e8de7ef)).
- Session creation: 2 GEN locked; Party A and Party B each finalized one term and an independent collection-completion transaction before semantic review finalized `BALANCED_DRAFT`.
- Settlement: both parties ratified; each made one finalized withdrawal of 1 GEN through the EOA external-message interface. Canonical terminal read: `RATIFIED`, `locked_gen=0`, `a_credit_gen=0`, `b_credit_gen=0`; native contract balance moved 2 -> 1 -> 0 GEN and both recipient balances increased after network fees.
- Evidence files retain only allowlisted hashes, actor roles, finality, and canonical reads. Browser proof and script-signed proof are intentionally distinct.
- Two superseded diagnostic revisions are explicitly archived as abandoned after their reviews remained undetermined; no additional value is sent to them, and they are not counted as active-lifecycle evidence.
- Revision `0xD8CF...b990` is archived as `ABANDONED_BROKEN_TRANSFER`: its ledger cleared without valid EOA messages, leaving 2 GEN without a recovery path. It receives no further value and is not active evidence.

## Honest limitations

BridgeDraft is a trusted-operator MVP for candidate-draft generation. It does not authenticate model provenance, prove external performance, create a legal agreement, or make its semantic result a proof of real-world fact. GenLayer validators judge semantic preservation of exact canonical terms/draft bytes; contract code, not model prose, controls role binding and fixed GEN accounting. The deployment identity is recorded in `docs/evidence/studio-dev/deployment.json`; no browser-lifecycle result is claimed before it is recorded.

## Kill criteria

- Reject before deployment if current pinned official API cannot express one safe validator-visible class with `run_nondet_default` semantic replay.
- Reject if a direct test permits external/authentication claims, arbitrary payout amount, omitted term ID, double movement, stale temporal action, or unverified output to cause a hard consequence.
- Stop network work if official Studio Dev parameters cannot be verified, needed authorization/configuration is absent, or a live result contradicts this specification.
