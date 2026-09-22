import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createAccount, createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

const root = resolve(import.meta.dirname, '..')
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment-attempt.json')
const rpc = 'https://studio-next.genlayer.com/api'
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } } }
const parse = path => {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(([, name, value]) => [name, value.replace(/^['"]|['"]$/g, '')]))
}
const values = { ...parse(resolve(root, '..', '.env')), ...parse(resolve(root, '.env')) }
const name = ['BRIDGEDRAFT_DEPLOYER_PRIVATE_KEY', 'GENLAYER_STUDIO_DEV_PRIVATE_KEY', 'GENLAYER_PRIVATE_KEY', 'PRIVATE_KEY', 'ACCOUNT_PRIVATE_KEY'].find(key => values[key]) ?? Object.keys(values).find(key => /private.*key|key.*private/i.test(key) && values[key])
if (!name || !/^0x[0-9a-fA-F]{64}$/.test(values[name])) throw new Error('Authorized deployer configuration is missing or invalid.')
const account = createAccount(values[name])
const client = createClient({ chain, endpoint: rpc, account })
const chainId = await client.request({ method: 'eth_chainId', params: [] })
const nonce = await client.getCurrentNonce({ address: account.address })
const feeQuote = await client.estimateTransactionFees()
const latestNonce = await client.request({ method: 'eth_getTransactionCount', params: [account.address, 'latest'] })
const balance = await client.request({ method: 'eth_getBalance', params: [account.address, 'latest'] })
const units = BigInt(balance)
const whole = units / (10n ** 18n)
const fraction = (units % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '')
const balanceGen = fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`
const feeWhole = feeQuote.feeValue / (10n ** 18n)
const feeFraction = (feeQuote.feeValue % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '')
const deploymentFeeGen = feeFraction ? `${feeWhole}.${feeFraction} GEN` : `${feeWhole} GEN`
const latestBlock = BigInt(await client.request({ method: 'eth_blockNumber', params: [] }))
const recent = []
for (let offset = 0n; offset < 16n; offset += 1n) {
  const block = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${(latestBlock - offset).toString(16)}`, true] })
  for (const transaction of block?.transactions ?? []) {
    if (typeof transaction?.from === 'string' && transaction.from.toLowerCase() === account.address.toLowerCase()) {
      recent.push({ hash: transaction.hash, to: transaction.to ?? null, nonce: transaction.nonce, block: block.number })
    }
  }
}
const attemptText = existsSync(attemptPath) ? readFileSync(attemptPath, 'utf8') : ''
const attemptedHash = attemptText.match(/0x[0-9a-fA-F]{64}/)?.[0]
let attemptedTransaction = null
if (attemptedHash) {
  const transaction = await client.request({ method: 'eth_getTransactionByHash', params: [attemptedHash] })
  attemptedTransaction = transaction ? {
    hash: attemptedHash,
    status: transaction.status ?? transaction.status_name ?? transaction.statusName ?? null,
    execution: transaction.tx_execution_result ?? transaction.txExecutionResult ?? transaction.result ?? transaction.execution_result ?? null,
    from: transaction.from ?? null,
    to: transaction.to ?? null,
  } : { hash: attemptedHash, status: 'NOT_FOUND', execution: null }
}
process.stdout.write(JSON.stringify({ network: 'Studio Dev', chain_id: chainId, deployer: account.address, latest_nonce: latestNonce, pending_nonce: nonce, balance_gen: balanceGen, deployment_fee_quote: deploymentFeeGen, recent_transactions: recent, attempted_transaction: attemptedTransaction }) + '\n')
