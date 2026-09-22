import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createAccount, createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

const root = resolve(import.meta.dirname, '..')
const evidence = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
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
const keyName = ['BRIDGEDRAFT_DEPLOYER_PRIVATE_KEY', 'GENLAYER_STUDIO_DEV_PRIVATE_KEY', 'GENLAYER_PRIVATE_KEY', 'PRIVATE_KEY', 'ACCOUNT_PRIVATE_KEY'].find(name => values[name])
  ?? Object.keys(values).find(name => /private.*key|key.*private/i.test(name) && values[name])
if (!keyName || !/^0x[0-9a-fA-F]{64}$/.test(values[keyName])) throw new Error('Authorized simulation account configuration is unavailable.')
const account = createAccount(values[keyName])
const client = createClient({
  chain: { ...studioDevnet, id: 61997, rpcUrls: { default: { http: ['https://studio-next.genlayer.com/api'] } } },
  endpoint: 'https://studio-next.genlayer.com/api',
  account,
})
const now = Math.floor(Date.now() / 1000)
const write = {
  address: evidence.contract_address,
  functionName: 'create_session',
  args: ['0x45ad397c438397a702b53a7499a78d08961d39db', '0x45248be151f7f7e230150db23774733cd966eb45', 'browser flow validation', BigInt(now + 600), BigInt(now + 1800)],
  value: 2n * 10n ** 18n,
}
const baseline = await client.estimateTransactionFees()
const simulation = await client.simulateWriteContract({
  ...write,
  fees: { distribution: baseline.distribution, messageAllocations: baseline.messageAllocations, feeValue: baseline.feeValue },
  includeReceipt: true,
})
const fee = await client.estimateTransactionFeesFromSimulation({ simulation })
const whole = fee.feeValue / (10n ** 18n)
const fraction = (fee.feeValue % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '')
process.stdout.write(JSON.stringify({ simulation: 'ACCEPTED', contract_address: evidence.contract_address, fee: fraction ? `${whole}.${fraction} GEN` : `${whole} GEN` }) + '\n')
