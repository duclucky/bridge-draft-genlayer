import { createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'
import { isAddress, type Address } from 'viem'

export const GEN = 10n ** 18n
export const STUDIO_DEV_RPC = 'https://studio-next.genlayer.com/api'
export const STUDIO_DEV_CHAIN_ID = 61997

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export type Finality = 'idle' | 'quoting' | 'submitted' | 'accepted' | 'finalized' | 'failed'

export type SessionPhase =
  | 'COLLECTING'
  | 'BALANCED_DRAFT'
  | 'A_RATIFIED'
  | 'B_RATIFIED'
  | 'RETRYABLE'
  | 'CONFLICTING'
  | 'RATIFIED'
  | 'EXPIRED_REFUNDED'

export type ContractAction = 'submit_constraint' | 'request_review' | 'retry_review' | 'ratify' | 'withdraw_credit' | 'refund_expired'

export type Term = { term_id: string; role: 'A' | 'B'; text: string }

export type SessionSummary = {
  id: string
  title: string
  phase: SessionPhase
  sponsor: string
  partyA: string
  partyB: string
  collectDeadline: number
  ratifyDeadline: number
  verdict: string
  draft: string
  draftDigest: string
  coverage: Array<{ term_id: string; status: 'SATISFIED' | 'UNSATISFIED' }>
  eligibleActions: ContractAction[]
  lockedGen: number
  creditGen: number
  withdrawn: boolean
  refunded: boolean
}

export type WriteResult = { transactionHash: string; finality: 'finalized' }
type Progress = (finality: Finality, transactionHash?: string, detail?: string) => void
type ContractArgument = string | bigint

export interface BridgeDraftAdapter {
  listSessions(account: string): Promise<SessionSummary[]>
  getSession(id: string, account: string): Promise<SessionSummary>
  getTerms(id: string): Promise<Term[]>
  createSession(input: { partyA: string; partyB: string; title: string; collectDeadline: number; ratifyDeadline: number }): Promise<WriteResult>
  submitConstraint(input: { sessionId: string; sequence: number; text: string }): Promise<WriteResult>
  requestReview(sessionId: string): Promise<WriteResult>
  retryReview(sessionId: string): Promise<WriteResult>
  ratify(input: { sessionId: string; draftDigest: string }): Promise<WriteResult>
  withdrawCredit(sessionId: string): Promise<WriteResult>
  refundExpired(sessionId: string): Promise<WriteResult>
}

export class ContractNotConfiguredError extends Error {
  constructor(message = 'BridgeDraft needs a valid deployed Studio Dev contract address. No transaction was submitted.') {
    super(message)
  }
}

export class ContractTransactionError extends Error {}

const studioDevChain = () => ({
  ...studioDevnet,
  id: STUDIO_DEV_CHAIN_ID,
  rpcUrls: { default: { http: [STUDIO_DEV_RPC] } },
  blockExplorers: { default: { name: 'Studio Dev Explorer', url: 'https://explorer-studio-dev.genlayer.com/' } },
})

function contractAddress(value: string | undefined): Address {
  if (!value || !isAddress(value)) throw new ContractNotConfiguredError()
  return value
}

function accountAddress(value: string): Address {
  if (!isAddress(value)) throw new ContractNotConfiguredError('The selected wallet address is invalid. No transaction was submitted.')
  return value
}

function asTransactionHash(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ContractTransactionError('The wallet returned an invalid transaction hash.')
  return value as `0x${string}`
}

function formatGen(value: bigint): string {
  const whole = value / GEN
  const fraction = (value % GEN).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`
}

function asSessionPhase(value: unknown): SessionPhase {
  const phases: SessionPhase[] = ['COLLECTING', 'BALANCED_DRAFT', 'A_RATIFIED', 'B_RATIFIED', 'RETRYABLE', 'CONFLICTING', 'RATIFIED', 'EXPIRED_REFUNDED']
  if (typeof value !== 'string' || !phases.includes(value as SessionPhase)) throw new ContractTransactionError('The contract returned an unknown session phase.')
  return value as SessionPhase
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractTransactionError('The contract returned malformed session data.')
  return value as Record<string, unknown>
}

function stringField(record: Record<string, unknown>, name: string): string {
  if (typeof record[name] !== 'string') throw new ContractTransactionError(`The contract returned an invalid ${name} field.`)
  return record[name]
}

function numberField(record: Record<string, unknown>, name: string): number {
  const value = record[name]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new ContractTransactionError(`The contract returned an invalid ${name} field.`)
  return value
}

function boolField(record: Record<string, unknown>, name: string): boolean {
  if (typeof record[name] !== 'boolean') throw new ContractTransactionError(`The contract returned an invalid ${name} field.`)
  return record[name]
}

function coverageField(value: unknown): SessionSummary['coverage'] {
  if (typeof value !== 'string') throw new ContractTransactionError('The contract returned invalid coverage data.')
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' || typeof item.term_id !== 'string' || (item.status !== 'SATISFIED' && item.status !== 'UNSATISFIED'))) {
    throw new ContractTransactionError('The contract returned malformed coverage data.')
  }
  return parsed as SessionSummary['coverage']
}

async function ensureStudioDevChain(provider: Eip1193Provider): Promise<void> {
  const chainId = `0x${STUDIO_DEV_CHAIN_ID.toString(16)}`
  const current = await provider.request({ method: 'eth_chainId' })
  if (current === chainId) return
  const params = {
    chainId,
    chainName: 'GenLayer Studio Dev',
    nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
    rpcUrls: [STUDIO_DEV_RPC],
    blockExplorerUrls: ['https://explorer-studio-dev.genlayer.com/'],
  }
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch {
    await provider.request({ method: 'wallet_addEthereumChain', params: [params] })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  }
}

function parseTerms(value: unknown): Term[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.term_id !== 'string' || (item.role !== 'A' && item.role !== 'B') || typeof item.text !== 'string')) {
    throw new ContractTransactionError('The contract returned malformed terms.')
  }
  return value as Term[]
}

export function createBridgeDraftAdapter(config: { contractAddress?: string; rpcUrl?: string; account: string; provider: Eip1193Provider; onProgress?: Progress }): BridgeDraftAdapter {
  const address = contractAddress(config.contractAddress)
  const account = accountAddress(config.account)
  const rpcUrl = config.rpcUrl || '/genlayer-rpc'
  if (!rpcUrl.startsWith('/')) throw new ContractNotConfiguredError('The browser IC RPC must use a same-origin proxy path.')
  const readClient = createClient({ chain: studioDevChain(), endpoint: rpcUrl })
  const writeClient = createClient({ chain: studioDevChain(), endpoint: rpcUrl, account, provider: config.provider })
  const progress = config.onProgress ?? (() => undefined)

  const getSession = async (id: string, requestedAccount: string): Promise<SessionSummary> => {
    const raw = asRecord(await readClient.readContract({ address, functionName: 'get_session', args: [id] }))
    const actionResult = await readClient.readContract({ address, functionName: 'get_actionability', args: [id, accountAddress(requestedAccount)] })
    if (!Array.isArray(actionResult) || actionResult.some(action => typeof action !== 'string')) throw new ContractTransactionError('The contract returned malformed available actions.')
    const requested = accountAddress(requestedAccount).toLowerCase()
    const isA = stringField(raw, 'party_a').toLowerCase() === requested
    return {
      id: stringField(raw, 'session_id'),
      title: stringField(raw, 'title'),
      phase: asSessionPhase(raw.phase),
      sponsor: stringField(raw, 'sponsor'),
      partyA: stringField(raw, 'party_a'),
      partyB: stringField(raw, 'party_b'),
      collectDeadline: numberField(raw, 'collect_deadline'),
      ratifyDeadline: numberField(raw, 'ratify_deadline'),
      verdict: stringField(raw, 'verdict'),
      draft: stringField(raw, 'draft'),
      draftDigest: stringField(raw, 'draft_digest'),
      coverage: coverageField(raw.coverage),
      eligibleActions: actionResult as ContractAction[],
      lockedGen: numberField(raw, 'locked_gen'),
      creditGen: numberField(raw, isA ? 'a_credit_gen' : 'b_credit_gen'),
      withdrawn: boolField(raw, isA ? 'a_withdrawn' : 'b_withdrawn'),
      refunded: boolField(raw, 'refunded'),
    }
  }

  const submit = async (functionName: string, args: ContractArgument[], value?: bigint): Promise<WriteResult> => {
    await ensureStudioDevChain(config.provider)
    try {
      progress('quoting')
      const write = { address, functionName, args, ...(value === undefined ? {} : { value }) }
      const fees = await writeClient.estimateTransactionFeesForWrite(write)
      progress('quoting', undefined, `Current Studio Dev network fee: ${formatGen(fees.feeValue)}.`)
      const transactionHash = await writeClient.writeContract({
        ...write,
        fees: { distribution: fees.distribution, messageAllocations: fees.messageAllocations, feeValue: fees.feeValue },
        ...(value === undefined ? {} : { value }),
      }) as string
      if (typeof transactionHash !== 'string' || !transactionHash.startsWith('0x')) throw new ContractTransactionError('The wallet returned no transaction hash.')
      progress('submitted', transactionHash)
      const hash = asTransactionHash(transactionHash) as unknown as Parameters<typeof readClient.waitForDecision>[0]['hash']
      await readClient.waitForDecision({ hash })
      progress('accepted', transactionHash)
      const finalReceipt = await readClient.waitForFinalization({ hash }) as { execution_result?: { result_code?: number }; result?: { execution_result?: { result_code?: number } } }
      const resultCode = finalReceipt.execution_result?.result_code ?? finalReceipt.result?.execution_result?.result_code
      if (resultCode !== undefined && resultCode !== 0) throw new ContractTransactionError('The transaction finalized without a successful contract execution result.')
      progress('finalized', transactionHash)
      return { transactionHash, finality: 'finalized' }
    } catch (error) {
      progress('failed', undefined, error instanceof Error ? error.message : 'The wallet or network rejected the transaction.')
      throw error
    }
  }

  return {
    async listSessions(requestedAccount) {
      const ids = await readClient.readContract({ address, functionName: 'get_sessions_for_account', args: [accountAddress(requestedAccount)] })
      if (!Array.isArray(ids)) throw new ContractTransactionError('The contract returned malformed session identifiers.')
      const sessionIds: string[] = []
      for (const id of ids) {
        if (typeof id !== 'string') throw new ContractTransactionError('The contract returned malformed session identifiers.')
        sessionIds.push(id)
      }
      return Promise.all(sessionIds.map(id => getSession(id, requestedAccount)))
    },
    getSession,
    async getTerms(id) {
      return parseTerms(await readClient.readContract({ address, functionName: 'get_terms', args: [id] }))
    },
    createSession(input) {
      if (!isAddress(input.partyA) || !isAddress(input.partyB)) throw new ContractNotConfiguredError('Party A and Party B must each be valid EVM addresses.')
      return submit('create_session', [input.partyA, input.partyB, input.title, BigInt(input.collectDeadline), BigInt(input.ratifyDeadline)], 2n * GEN)
    },
    submitConstraint(input) {
      return submit('submit_constraint', [input.sessionId, BigInt(input.sequence), input.text])
    },
    requestReview(sessionId) {
      return submit('request_review', [sessionId])
    },
    retryReview(sessionId) {
      return submit('retry_review', [sessionId])
    },
    ratify(input) {
      return submit('ratify', [input.sessionId, input.draftDigest])
    },
    withdrawCredit(sessionId) {
      return submit('withdraw_credit', [sessionId])
    },
    refundExpired(sessionId) {
      return submit('refund_expired', [sessionId])
    },
  }
}
