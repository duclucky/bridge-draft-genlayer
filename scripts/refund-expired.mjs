import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing a value-moving refund without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const oldDeploymentPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'attempts', 'deployment-replaced-0x2d586812a8f9cd34bafb92353faef66f3d53031f-26c24339de26.json')
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'old-revision-refund-attempt.json')
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
const rpc = 'https://studio-next.genlayer.com/api'

const parse = path => {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}

if (!existsSync(oldDeploymentPath)) throw new Error('Archived old revision evidence is unavailable.')
const oldDeployment = JSON.parse(readFileSync(oldDeploymentPath, 'utf8'))
const values = { ...parse(resolve(root, '..', '.env')), ...parse(resolve(root, '.env')) }
const key = values.STUDIONET_PRIVATE_KEY
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('Authorized sponsor configuration is unavailable.')
const account = createAccount(key)
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } } }
const client = createClient({ chain, endpoint: rpc, account })
const actions = await client.readContract({ address: oldDeployment.contract_address, functionName: 'get_actionability', args: [sessionId, sessionId.slice(0, 42)] })
if (!Array.isArray(actions) || !actions.includes('refund_expired')) throw new Error('Old revision is not yet legally refundable; no transaction was sent.')
const write = { address: oldDeployment.contract_address, functionName: 'refund_expired', args: [sessionId] }
const fee = await client.estimateTransactionFeesForWrite(write)
const hash = await client.writeContract({ ...write, fees: { distribution: fee.distribution, messageAllocations: fee.messageAllocations, feeValue: fee.feeValue } })
mkdirSync(dirname(attemptPath), { recursive: true })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', old_contract_address: oldDeployment.contract_address, session_id: sessionId, transaction_hash: hash, status: 'SUBMITTED' }, null, 2) + '\n', 'utf8')
const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
if (!isSuccessful(receipt)) throw new Error('Refund finalized without successful execution.')
const session = await client.readContract({ address: oldDeployment.contract_address, functionName: 'get_session', args: [sessionId] })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', old_contract_address: oldDeployment.contract_address, session_id: sessionId, transaction_hash: hash, status: 'FINALIZED_SUCCESS', phase: session.phase ?? null, locked_gen: session.locked_gen ?? null }, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify({ network: 'Studio Dev', transaction_hash: hash, status: 'FINALIZED_SUCCESS', phase: session.phase ?? null, locked_gen: session.locked_gen ?? null }) + '\n')
