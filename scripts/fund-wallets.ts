#!/usr/bin/env tsx
/**
 * Displays all wallet addresses so you can fund them with Base Sepolia ETH + USDC.
 * Faucets:
 *   ETH:  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
 *   USDC: https://faucet.circle.com (select Base Sepolia)
 */
import 'dotenv/config'
import { getAccount, getPublicClient } from '../src/wallet.js'
import { formatEther, formatUnits } from 'viem'

// Base Sepolia USDC contract
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const WALLETS = [
  { name: 'orchestrator', envKey: 'ORCHESTRATOR_PRIVATE_KEY' },
  { name: 'news agent',      envKey: 'AGENT_NEWS_PRIVATE_KEY' },
  { name: 'market agent',    envKey: 'AGENT_MARKET_PRIVATE_KEY' },
  { name: 'sentiment agent', envKey: 'AGENT_SENTIMENT_PRIVATE_KEY' },
  { name: 'arbitrage agent', envKey: 'AGENT_ARBITRAGE_PRIVATE_KEY' },
]

async function main() {
  const client = getPublicClient()

  console.log('Wallet addresses and balances (Base Sepolia):\n')
  console.log('  Wallet            Address                                    ETH         USDC')
  console.log('  ' + '─'.repeat(85))

  for (const w of WALLETS) {
    const privateKey = process.env[w.envKey]
    if (!privateKey) {
      console.log(`  ${w.name.padEnd(18)} (${w.envKey} not set)`)
      continue
    }

    const account = getAccount(privateKey)
    const address = account.address

    const [ethBalance, usdcBalance] = await Promise.all([
      client.getBalance({ address }),
      client.readContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as Promise<bigint>,
    ])

    const ethStr = parseFloat(formatEther(ethBalance)).toFixed(6).padEnd(12)
    const usdcStr = parseFloat(formatUnits(usdcBalance, 6)).toFixed(2).padEnd(10)

    console.log(`  ${w.name.padEnd(18)} ${address}  ${ethStr} ${usdcStr}`)
  }

  console.log('\nFaucet links:')
  console.log('  ETH:  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet')
  console.log('  USDC: https://faucet.circle.com  (select "Base Sepolia")')
  console.log()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
