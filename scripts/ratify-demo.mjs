import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing ratification writes without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', `ratify-attempt-${deployment.contract_address.toLowerCase()}.json`)
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
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
const accountFor = keyName => {
  const key = values[keyName]
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error(`Authorized ${keyName} is unavailable.`)
  return createAccount(key)
}
const rpc = 'https://studio-next.genlayer.com/api'
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } } }
const reader = createClient({ chain, endpoint: rpc })
const storedAttempt = existsSync(attemptPath) ? JSON.parse(readFileSync(attemptPath, 'utf8')) : {}
const attempts = Array.isArray(storedAttempt.attempts) ? storedAttempt.attempts : []
const send = async (role, account, digest) => {
  const client = createClient({ chain, endpoint: rpc, account })
  const write = { address: deployment.contract_address, functionName: 'ratify', args: [sessionId, digest] }
  const fee = await client.estimateTransactionFeesForWrite(write)
  const hash = await client.writeContract({ ...write, fees: { distribution: fee.distribution, messageAllocations: fee.messageAllocations, feeValue: fee.feeValue } })
  attempts.push({ role, transaction_hash: hash, status: 'SUBMITTED' })
  mkdirSync(dirname(attemptPath), { recursive: true })
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts }, null, 2) + '\n', 'utf8')
  const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
  if (!isSuccessful(receipt)) throw new Error(`Ratification ${role} finalized without successful execution.`)
  attempts[attempts.length - 1].status = 'FINALIZED_SUCCESS'
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts }, null, 2) + '\n', 'utf8')
}
const initial = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
if (initial.phase !== 'RATIFIED' && initial.phase !== 'BALANCED_DRAFT' && initial.phase !== 'A_RATIFIED' && initial.phase !== 'B_RATIFIED') throw new Error('Session is not legally ratifiable.')
if (initial.phase !== 'RATIFIED' && !initial.a_ratified) await send('A', accountFor('STUDIONET_INTEGRATOR_PRIVATE_KEY'), initial.draft_digest)
const afterA = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
if (afterA.phase !== 'RATIFIED' && !afterA.b_ratified) await send('B', accountFor('STUDIONET_STEWARD_PRIVATE_KEY'), afterA.draft_digest)
const finalSession = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts, canonical_state: { phase: finalSession.phase, a_credit_gen: finalSession.a_credit_gen, b_credit_gen: finalSession.b_credit_gen } }, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify({ network: 'Studio Dev', session_id: sessionId, submitted: attempts, phase: finalSession.phase, a_credit_gen: finalSession.a_credit_gen, b_credit_gen: finalSession.b_credit_gen }) + '\n')
