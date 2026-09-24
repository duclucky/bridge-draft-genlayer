import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

if (!process.argv.includes('--confirm-network-write')) throw new Error('Refusing 1 GEN withdrawal writes without --confirm-network-write.')

const root = resolve(import.meta.dirname, '..')
const deployment = JSON.parse(readFileSync(resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json'), 'utf8'))
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', `withdraw-attempt-${deployment.contract_address.toLowerCase()}.json`)
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
const GEN = 10n ** 18n
const readBalance = async address => BigInt(await reader.request({ method: 'eth_getBalance', params: [address, 'latest'] }))
const waitForBalance = async (address, expected, label) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const balance = await readBalance(address)
    if (balance === expected) return balance
    await new Promise(resolve => setTimeout(resolve, 4000))
  }
  const actual = await readBalance(address)
  throw new Error(`${label} balance did not reach the expected value; expected ${expected}, observed ${actual}.`)
}
const storedAttempt = existsSync(attemptPath) ? JSON.parse(readFileSync(attemptPath, 'utf8')) : {}
const attempts = Array.isArray(storedAttempt.attempts) ? storedAttempt.attempts : []
const send = async (role, account) => {
  const client = createClient({ chain, endpoint: rpc, account })
  const contractBalanceBefore = await readBalance(deployment.contract_address)
  const recipientBalanceBefore = await readBalance(account.address)
  if (contractBalanceBefore < GEN) throw new Error(`Withdrawal ${role} cannot be sent because the contract holds less than 1 GEN.`)
  const write = { address: deployment.contract_address, functionName: 'withdraw_credit', args: [sessionId] }
  const fee = await client.estimateTransactionFeesForWrite(write)
  const hash = await client.writeContract({ ...write, fees: { distribution: fee.distribution, messageAllocations: fee.messageAllocations, feeValue: fee.feeValue } })
  attempts.push({ role, recipient: account.address, transaction_hash: hash, transfer_gen: 1, status: 'SUBMITTED', contract_balance_before_gen: Number(contractBalanceBefore / GEN), recipient_balance_before_base_units: recipientBalanceBefore.toString() })
  mkdirSync(dirname(attemptPath), { recursive: true })
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts }, null, 2) + '\n', 'utf8')
  const receipt = await client.waitForFinalization({ hash, fullTransaction: false })
  if (!isSuccessful(receipt)) throw new Error(`Withdrawal ${role} finalized without successful execution.`)
  const contractBalanceAfter = await waitForBalance(deployment.contract_address, contractBalanceBefore - GEN, `Withdrawal ${role} contract`)
  const recipientBalanceAfter = await readBalance(account.address)
  if (recipientBalanceAfter < recipientBalanceBefore + GEN) throw new Error(`Withdrawal ${role} did not increase the recipient balance by 1 GEN.`)
  attempts[attempts.length - 1].status = 'FINALIZED_SUCCESS'
  attempts[attempts.length - 1].contract_balance_after_gen = Number(contractBalanceAfter / GEN)
  attempts[attempts.length - 1].recipient_balance_after_base_units = recipientBalanceAfter.toString()
  attempts[attempts.length - 1].recipient_balance_delta_gen = Number((recipientBalanceAfter - recipientBalanceBefore) / GEN)
  writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', session_id: sessionId, attempts }, null, 2) + '\n', 'utf8')
}
const initial = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
if (initial.phase !== 'RATIFIED') throw new Error('Session is not legally withdrawable.')
if (initial.a_credit_gen === 1) await send('A', accountFor('STUDIONET_INTEGRATOR_PRIVATE_KEY'))
const afterA = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
if (afterA.b_credit_gen === 1) await send('B', accountFor('STUDIONET_STEWARD_PRIVATE_KEY'))
const finalSession = await reader.readContract({ address: deployment.contract_address, functionName: 'get_session', args: [sessionId] })
const finalContractBalance = await readBalance(deployment.contract_address)
if (finalContractBalance !== 0n) throw new Error(`Final contract balance is not zero: ${finalContractBalance}.`)
writeFileSync(attemptPath, JSON.stringify({ network: 'Studio Dev', contract_address: deployment.contract_address, session_id: sessionId, attempts, canonical_state: { phase: finalSession.phase, locked_gen: finalSession.locked_gen, a_credit_gen: finalSession.a_credit_gen, b_credit_gen: finalSession.b_credit_gen, contract_balance_gen: 0 } }, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify({ network: 'Studio Dev', contract_address: deployment.contract_address, session_id: sessionId, submitted: attempts, phase: finalSession.phase, locked_gen: finalSession.locked_gen, a_credit_gen: finalSession.a_credit_gen, b_credit_gen: finalSession.b_credit_gen, contract_balance_gen: 0 }) + '\n')
