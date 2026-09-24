import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing network writes without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'constraint-attempts.json')
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
const accountFor = name => {
  const key = values[name]
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error(`Authorized ${name} is unavailable.`)
  return createAccount(key)
}
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: ['https://studio-next.genlayer.com/api'] } } }
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
const reader = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api' })
const sent = []
const send = async (role, account, functionName, args) => {
  const client = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api', account })
  const write = { address: deployment.contract_address, functionName, args }
  const estimate = await client.estimateTransactionFeesForWrite(write)
  const hash = await client.writeContract({ ...write, fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue } })
  sent.push({ role, action: functionName, transaction_hash: hash, status: 'SUBMITTED' })
  mkdirSync(resolve(root, 'docs', 'evidence', 'studio-dev'), { recursive: true })
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts: sent }, null, 2) + '\n', 'utf8')
  const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
  if (!isSuccessful(receipt)) throw new Error(`${functionName} finalized without successful execution.`)
  sent[sent.length - 1].status = 'FINALIZED_SUCCESS'
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts: sent }, null, 2) + '\n', 'utf8')
  return hash
}
const existingTerms = await reader.readContract({ address: deployment.contract_address, functionName: 'get_terms', args: [sessionId] })
const existingRoles = new Set(Array.isArray(existingTerms) ? existingTerms.map(term => term.role) : [])
const partyA = accountFor('STUDIONET_INTEGRATOR_PRIVATE_KEY')
const partyB = accountFor('STUDIONET_STEWARD_PRIVATE_KEY')
if (!existingRoles.has('A')) await send('A', partyA, 'submit_constraint', [sessionId, 1n, 'Keep the rollback owner named'])
if (!existingRoles.has('B')) await send('B', partyB, 'submit_constraint', [sessionId, 1n, 'Keep incident handoff observable'])
const beforeCompletion = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
if (!beforeCompletion.a_collection_complete) await send('A', partyA, 'mark_collection_complete', [sessionId])
if (!beforeCompletion.b_collection_complete) await send('B', partyB, 'mark_collection_complete', [sessionId])
const terms = await reader.readContract({ address: deployment.contract_address, functionName: 'get_terms', args: [sessionId] })
const session = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
process.stdout.write(JSON.stringify({ network: 'Studio Dev', session_id: sessionId, submitted: sent, term_count: Array.isArray(terms) ? terms.length : null, bilateral_collection_complete: Boolean(session.a_collection_complete && session.b_collection_complete) }) + '\n')
