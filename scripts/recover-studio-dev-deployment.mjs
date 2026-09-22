import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { createClient } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'

const root = resolve(import.meta.dirname, '..')
const attemptPath = resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment-attempt.json')
const evidencePath = resolve(root, 'docs', 'evidence', 'studio-dev', 'deployment.json')
const frontendEnvPath = resolve(root, 'frontend', '.env')
const rpc = 'https://studio-next.genlayer.com/api'
const chain = { ...studioDevnet, id: 61997, rpcUrls: { default: { http: [rpc] } }, blockExplorers: { default: { name: 'Studio Dev Explorer', url: 'https://explorer-studio-dev.genlayer.com/' } } }

if (existsSync(evidencePath)) throw new Error('Active deployment evidence already exists.')
if (!existsSync(attemptPath)) throw new Error('No deployment attempt is available for recovery.')
const attempt = JSON.parse(readFileSync(attemptPath, 'utf8'))
if (typeof attempt.deployment_tx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(attempt.deployment_tx)) throw new Error('The attempt does not contain a transaction hash.')
const client = createClient({ chain, endpoint: rpc })
const transaction = await client.request({ method: 'eth_getTransactionByHash', params: [attempt.deployment_tx] })
if (!transaction || transaction.status !== 'FINALIZED' || transaction.txExecutionResultName !== 'FINISHED_WITH_RETURN') throw new Error('The deployment transaction is not a finalized successful execution.')
const contractAddress = transaction.recipient
if (typeof contractAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error('The successful deployment transaction has no valid contract recipient.')
const schema = await client.request({ method: 'gen_getContractSchema', params: [contractAddress] })
if (!schema?.methods?.create_session || !schema?.methods?.get_session || !schema?.methods?.withdraw_credit) throw new Error('The recipient schema is not BridgeDraft.')
const source = readFileSync(resolve(root, 'contracts', 'bridge_draft.py'), 'utf8')
let commit = 'UNCOMMITTED'
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
const evidence = {
  network: 'Studio Dev',
  chain_id: 61997,
  rpc,
  explorer: 'https://explorer-studio-dev.genlayer.com/',
  status: 'FINALIZED_SUCCESS',
  deployment_tx: attempt.deployment_tx,
  contract_address: contractAddress,
  source_commit: commit,
  source_sha256: createHash('sha256').update(source).digest('hex'),
  runner: 'py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng',
  schema_methods: Object.keys(schema.methods).sort(),
}
mkdirSync(dirname(evidencePath), { recursive: true })
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
writeFileSync(frontendEnvPath, `VITE_BRIDGEDRAFT_CONTRACT_ADDRESS=${contractAddress}\nVITE_GENLAYER_IC_RPC=/genlayer-rpc\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: evidence.status, contract_address: contractAddress, deployment_tx: attempt.deployment_tx }) + '\n')
