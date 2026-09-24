import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { createAccount, createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

const root = resolve(import.meta.dirname, '..')
const evidencePath = resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json')
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment-attempt.json')
const frontendEnvPath = resolve(root, 'frontend', '.env')
const rpc = 'https://studio-next.genlayer.com/api'
const chain = {
  ...studioDevnet,
  id: 61997,
  rpcUrls: { default: { http: [rpc] } },
  blockExplorers: { default: { name: 'Studio Dev Explorer', url: 'https://explorer-studio-dev.genlayer.com/' } },
}

function loadEnvironment(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}

function authorizedKey() {
  const project = loadEnvironment(resolve(root, '.env'))
  const parent = loadEnvironment(resolve(root, '..', '.env'))
  const values = { ...parent, ...project }
  const preferred = ['BRIDGEDRAFT_DEPLOYER_PRIVATE_KEY', 'GENLAYER_STUDIO_DEV_PRIVATE_KEY', 'GENLAYER_PRIVATE_KEY', 'PRIVATE_KEY', 'ACCOUNT_PRIVATE_KEY']
  const keyName = preferred.find(name => typeof values[name] === 'string' && values[name].length > 0)
    ?? Object.keys(values).find(name => /private.*key|key.*private/i.test(name) && typeof values[name] === 'string' && values[name].length > 0)
  if (!keyName) throw new Error('No authorized deployer key was found in the project or parent ignored environment file.')
  const key = values[keyName]
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('The authorized deployer key has an invalid format.')
  return key
}

function sourceCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return 'UNCOMMITTED' }
}

function getContractAddress(receipt) {
  const candidates = [receipt?.contract_address, receipt?.contractAddress, receipt?.created_contract_address, receipt?.recipient, receipt?.result?.contract_address, receipt?.result?.contractAddress]
  return candidates.find(value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value))
}

function formatGen(value) {
  const whole = value / (10n ** 18n)
  const fraction = (value % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`
}

const attempt = { network: 'Studio Dev', status: 'STARTED', deployment_tx: null }
function saveAttempt(error) {
  mkdirSync(dirname(attemptPath), { recursive: true })
  const detail = error === undefined ? '' : error instanceof Error ? error.message : String(error)
  writeFileSync(attemptPath, JSON.stringify({ ...attempt, ...(detail ? { error: detail.slice(0, 300) } : {}) }, null, 2) + '\n', 'utf8')
}
process.on('unhandledRejection', error => { attempt.status = 'FAILED'; saveAttempt(error); process.exitCode = 1 })
process.on('uncaughtException', error => { attempt.status = 'FAILED'; saveAttempt(error); process.exitCode = 1 })

const quoteOnly = process.argv.includes('--quote-only')
const replaceActiveRevision = process.argv.includes('--replace-active-revision')
if (!process.argv.includes('--confirm-network-write') && !quoteOnly) {
  throw new Error('Refusing a network write without --confirm-network-write.')
}

if (!quoteOnly && existsSync(evidencePath)) {
  const previous = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (previous.status === 'FINALIZED_SUCCESS' && typeof previous.contract_address === 'string') {
    if (!replaceActiveRevision) {
      process.stdout.write(JSON.stringify({ status: 'REUSED', contract_address: previous.contract_address, deployment_tx: previous.deployment_tx }) + '\n')
      process.exit(0)
    }
    const archivePath = resolve(
      root,
      'docs',
      'evidence',
      'studio-dev',
      'attempts',
      `deployment-replaced-${previous.contract_address.toLowerCase()}-${String(previous.source_sha256 ?? 'unknown').slice(0, 12)}.json`,
    )
    if (!existsSync(archivePath)) {
      mkdirSync(dirname(archivePath), { recursive: true })
      writeFileSync(archivePath, JSON.stringify({
        ...previous,
        archived_status: 'ABANDONED_BROKEN_TRANSFER',
        replacement_reason: 'The internal ledger recorded both withdrawals, but the revision used gl.chain.Account instead of the EOA external-message interface. Its 2 GEN native balance has no remaining recovery path; do not send further value.',
        remaining_contract_balance_gen: 2,
      }, null, 2) + '\n', 'utf8')
    }
  }
  else {
    throw new Error('Existing deployment evidence is incomplete or unsuccessful. Archive it before a replacement deployment.')
  }
}

const source = readFileSync(resolve(root, 'contracts', 'bridge_draft.py'), 'utf8')
const sourceHash = createHash('sha256').update(source).digest('hex')
const account = createAccount(authorizedKey())
const client = createClient({ chain, endpoint: rpc, account })
const feeQuote = await client.estimateTransactionFees()
if (quoteOnly) {
  process.stdout.write(JSON.stringify({ network: 'Studio Dev', fee: formatGen(feeQuote.feeValue), action: 'deployment quote only' }) + '\n')
  process.exit(0)
}
saveAttempt()
attempt.status = 'QUOTED'
attempt.fee = formatGen(feeQuote.feeValue)
saveAttempt()
const deploymentTx = await client.deployContract({ code: source, fees: { distribution: feeQuote.distribution, messageAllocations: feeQuote.messageAllocations, feeValue: feeQuote.feeValue } })
attempt.status = 'SUBMITTED'
attempt.deployment_tx = deploymentTx
saveAttempt()
const receipt = await client.waitForFinalization({ hash: deploymentTx, fullTransaction: false })
if (!isSuccessful(receipt)) throw new Error('Deployment finalized without a successful execution result.')
const contractAddress = getContractAddress(receipt)
if (!contractAddress) throw new Error('Deployment succeeded but the sanitized receipt projection did not contain a contract address.')

const evidence = {
  network: 'Studio Dev',
  chain_id: 61997,
  rpc,
  explorer: 'https://explorer-studio-dev.genlayer.com/',
  status: 'FINALIZED_SUCCESS',
  deployment_tx: deploymentTx,
  contract_address: contractAddress,
  source_commit: sourceCommit(),
  source_sha256: sourceHash,
  runner: 'py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng',
}
mkdirSync(dirname(evidencePath), { recursive: true })
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
attempt.status = 'FINALIZED_SUCCESS'
saveAttempt()
writeFileSync(frontendEnvPath, `VITE_BRIDGEDRAFT_CONTRACT_ADDRESS=${contractAddress}\nVITE_GENLAYER_IC_RPC=/genlayer-rpc\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: evidence.status, deployment_tx: deploymentTx, contract_address: contractAddress }) + '\n')
