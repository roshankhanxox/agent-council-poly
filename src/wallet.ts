import { createWalletClient, createPublicClient, http, type WalletClient } from 'viem'
import { privateKeyToAccount, type LocalAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

export function getAccount(privateKey: string): LocalAccount {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  return privateKeyToAccount(key as `0x${string}`)
}

export function getWalletClient(privateKey: string): WalletClient {
  const account = getAccount(privateKey)
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPublicClient(): any {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'),
  })
}

export { baseSepolia }
