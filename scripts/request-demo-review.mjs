import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing a network write without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', `review-attempt-${deployment.contract_address.toLowerCase()}.json`)
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
const key = values.STUDIONET_INTEGRATOR_PRIVATE_KEY
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error('Authorized Party A configuration is unavailable.')
const account = createAccount(key)
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: ['https://studio-next.genlayer.com/api'] } } }
const client = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api', account })
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
const saveFinalized = async hash => {
  const phase = await client.readContract({ address: deployment.contract_address, functionName: 'get_session_phase', args: [sessionId] })
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, transaction_hash: hash, status: 'FINALIZED_SUCCESS', phase }, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify({ network: 'Studio Dev', transaction_hash: hash, status: 'FINALIZED_SUCCESS', phase }) + '\n')
}
if (existsSync(attemptPath)) {
  const previous = JSON.parse(readFileSync(attemptPath, 'utf8'))
  if (previous.status === 'FINALIZED_SUCCESS') {
    process.stdout.write(JSON.stringify(previous) + '\n')
    process.exit(0)
  }
  if (previous.status === 'SUBMITTED' && /^0x[0-9a-fA-F]{64}$/.test(previous.transaction_hash ?? '')) {
    const transaction = await client.request({ method: 'eth_getTransactionByHash', params: [previous.transaction_hash] })
    if (transaction?.status !== 'FINALIZED') throw new Error(`Existing review is still ${transaction?.status ?? 'UNKNOWN'}; no replacement transaction was sent.`)
    if (transaction.txExecutionResultName !== 'FINISHED_WITH_RETURN') throw new Error('Existing review finalized without successful execution; no replacement transaction was sent.')
    await saveFinalized(previous.transaction_hash)
    process.exit(0)
  }
}
const write = { address: deployment.contract_address, functionName: 'request_review', args: [sessionId] }
const fee = await client.estimateTransactionFeesForWrite(write)
const hash = await client.writeContract({ ...write, fees: { distribution: fee.distribution, messageAllocations: fee.messageAllocations, feeValue: fee.feeValue } })
mkdirSync(dirname(attemptPath), { recursive: true })
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, transaction_hash: hash, status: 'SUBMITTED' }, null, 2) + '\n', 'utf8')
const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
if (!isSuccessful(receipt)) throw new Error('request_review finalized without successful execution.')
await saveFinalized(hash)
