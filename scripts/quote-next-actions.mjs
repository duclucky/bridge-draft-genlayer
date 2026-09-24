import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createAccount, createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const parse = path => {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}
const values = { ...parse(resolve(root, '..', '.env')), ...parse(resolve(root, '.env')) }
const key = name => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(values[name] ?? '')) throw new Error(`Authorized ${name} is unavailable.`)
  return values[name]
}
const partyA = createAccount(key('STUDIONET_INTEGRATOR_PRIVATE_KEY'))
const partyB = createAccount(key('STUDIONET_STEWARD_PRIVATE_KEY'))
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: ['https://studio-next.genlayer.com/api'] } } }
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
const quote = async (account, functionName, args) => {
  const client = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api', account })
  const estimate = await client.estimateTransactionFeesForWrite({ address: deployment.contract_address, functionName, args })
  const whole = estimate.feeValue / (10n ** 18n)
  const fraction = (estimate.feeValue % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`
}
try {
  const quotes = {
    party_a_complete_collection: await quote(partyA, 'mark_collection_complete', [sessionId]),
    party_b_complete_collection: await quote(partyB, 'mark_collection_complete', [sessionId]),
    party_a_request_review: await quote(partyA, 'request_review', [sessionId]),
  }
  process.stdout.write(JSON.stringify({ network: 'Studio Dev', session_id: sessionId, quotes }) + '\n')
} catch (error) {
  const message = error instanceof Error ? error.shortMessage ?? error.message : 'Unknown quote failure.'
  process.stdout.write(JSON.stringify({ network: 'Studio Dev', session_id: sessionId, quote: 'FAILED', message: message.slice(0, 180) }) + '\n')
  process.exitCode = 1
}
