import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing a 2 GEN session creation without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', `create-attempt-${deployment.contract_address.toLowerCase()}.json`)
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
const key = values.STUDIONET_PRIVATE_KEY
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('Authorized sponsor configuration is unavailable.')
const account = createAccount(key)
const rpc = 'https://studio-next.genlayer.com/api'
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } } }
const client = createClient({ chain, endpoint: rpc, account })
const now = Math.floor(Date.now() / 1000)
const write = {
  address: deployment.contract_address,
  functionName: 'create_session',
  args: ['0x45ad397c438397a702b53a7499a78d08961d39db', '0x45248be151f7f7e230150db23774733cd966eb45', 'Rollback and incident handoff', BigInt(now + 600), BigInt(now + 1800)],
  value: 2n * 10n ** 18n,
}
const fee = await client.estimateTransactionFeesForWrite(write)
const hash = await client.writeContract({ ...write, fees: { distribution: fee.distribution, messageAllocations: fee.messageAllocations, feeValue: fee.feeValue } })
mkdirSync(dirname(attemptPath), { recursive: true })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', contract_address: deployment.contract_address, transaction_hash: hash, status: 'SUBMITTED' }, null, 2) + '\n', 'utf8')
const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
if (!isSuccessful(receipt)) throw new Error('Session creation finalized without successful execution.')
const sponsor = '0xc495ef51618d03267a1f227afe5b27b38c748272'
const sessions = await client.readContract({ address: deployment.contract_address, functionName: 'get_sessions_for_account', args: [sponsor] })
const sessionId = sessions[sessions.length - 1]
const session = await client.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', contract_address: deployment.contract_address, transaction_hash: hash, status: 'FINALIZED_SUCCESS', session_id: sessionId, phase: session.phase ?? null, locked_gen: session.locked_gen ?? null }, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify({ network: 'Studio Dev', transaction_hash: hash, status: 'FINALIZED_SUCCESS', session_id: sessionId, phase: session.phase ?? null, locked_gen: session.locked_gen ?? null }) + '\n')
