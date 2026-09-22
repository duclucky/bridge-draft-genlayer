import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing network writes without --confirm-network-write.')

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
const accountFor = name => {
  const key = values[name]
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) throw new Error(`Authorized ${name} is unavailable.`)
  return createAccount(key)
}
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: ['https://studio-next.genlayer.com/api'] } } }
const sessionId = '0xc495ef51618d03267a1f227afe5b27b38c748272:1'
const send = async (account, sequence, text) => {
  const client = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api', account })
  const write = { address: deployment.contract_address, functionName: 'submit_constraint', args: [sessionId, BigInt(sequence), text] }
  const estimate = await client.estimateTransactionFeesForWrite(write)
  const hash = await client.writeContract({ ...write, fees: { distribution: estimate.distribution, messageAllocations: estimate.messageAllocations, feeValue: estimate.feeValue } })
  const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
  if (!isSuccessful(receipt)) throw new Error(`submit_constraint ${sequence} finalized without successful execution.`)
  return hash
}
const partyAHash = await send(accountFor('STUDIONET_INTEGRATOR_PRIVATE_KEY'), 1, 'Keep the rollback owner named')
const partyBHash = await send(accountFor('STUDIONET_STEWARD_PRIVATE_KEY'), 1, 'Keep incident handoff observable')
const reader = createClient({ chain, endpoint: 'https://studio-next.genlayer.com/api' })
const terms = await reader.readContract({ address: deployment.contract_address, functionName: 'get_terms', args: [sessionId] })
process.stdout.write(JSON.stringify({ network: 'Studio Dev', session_id: sessionId, party_a_tx: partyAHash, party_b_tx: partyBHash, term_count: Array.isArray(terms) ? terms.length : null }) + '\n')
