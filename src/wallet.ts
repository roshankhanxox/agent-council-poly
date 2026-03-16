import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient, type Chain, type Account } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

export function getAccount(privateKey: string): Account {
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

export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'),
  })
}

export { baseSepolia }
