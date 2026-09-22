interface ImportMetaEnv {
  readonly VITE_BRIDGEDRAFT_CONTRACT_ADDRESS?: string
  readonly VITE_GENLAYER_IC_RPC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
