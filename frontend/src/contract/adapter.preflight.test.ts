import { afterEach, describe, expect, it, vi } from 'vitest'

import { GEN, createBridgeDraftAdapter, type Eip1193Provider } from './adapter'


const ACCOUNT = '0x1111111111111111111111111111111111111111'
const PARTY_A = '0x2222222222222222222222222222222222222222'
const PARTY_B = '0x3333333333333333333333333333333333333333'
const CONTRACT = '0x4444444444444444444444444444444444444444'
const HASH = `0x${'a'.repeat(64)}`

afterEach(() => vi.unstubAllGlobals())

describe('BridgeDraft SDK wallet preflight', () => {
  it('uses the selected provider account, a real fee quote, and the fixed 2 GEN contract value without a per-call account override', async () => {
    const providerCalls: Array<{ method: string; params?: unknown[] }> = []
    const provider: Eip1193Provider = {
      request: vi.fn(async request => {
        providerCalls.push(request)
        if (request.method === 'eth_chainId') return '0xf22d'
        if (request.method === 'eth_sendTransaction') return HASH
        throw new Error(`unexpected provider method ${request.method}`)
      }),
    }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string }
      const resultByMethod: Record<string, unknown> = {
        sim_getFeeConfig: {
          enabled: true,
          policy: {
            genPerTimeUnit: '1',
            storageUnitPrice: '1',
            receiptGasPrice: '1',
            timeUnitOverlayBps: '0',
          },
        },
        gen_call: '0x00',
        eth_getTransactionCount: '0x0',
        eth_estimateGas: '0x5208',
        eth_gasPrice: '0x1',
        eth_getTransactionReceipt: { status: '0x1', transactionHash: HASH, blockHash: HASH, blockNumber: '0x1', logs: [] },
        eth_getTransactionByHash: { hash: HASH, status: 'FINALIZED', result: 'SUCCESS' },
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: resultByMethod[request.method] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createBridgeDraftAdapter({ contractAddress: CONTRACT, account: ACCOUNT, provider })

    await adapter.createSession({ partyA: PARTY_A, partyB: PARTY_B, title: 'handoff', collectDeadline: 1_900_000_000, ratifyDeadline: 1_900_003_600 })
    await adapter.markCollectionComplete('session-1')

    const submission = providerCalls.find(call => call.method === 'eth_sendTransaction')
    expect(submission).toBeDefined()
    const transaction = submission?.params?.[0] as { from: string; to: string; value: string }
    expect(transaction.from).toBe(ACCOUNT)
    expect(transaction.to).not.toBe(CONTRACT)
    expect(BigInt(transaction.value)).toBeGreaterThan(2n * GEN)
    expect(providerCalls.filter(call => call.method === 'eth_sendTransaction')).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body)).method === 'sim_getFeeConfig')).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('rejects an invalid destination before provider or fetch activity', () => {
    const provider: Eip1193Provider = { request: vi.fn() }
    expect(() => createBridgeDraftAdapter({ contractAddress: 'undefined', account: ACCOUNT, provider })).toThrow('valid deployed Studio Dev contract address')
    expect(provider.request).not.toHaveBeenCalled()
  })
})
