#!/usr/bin/env tsx
/**
 * Register all agents + orchestrator on the ERC-8004 facilitator.
 * Run once: pnpm register
 * Outputs agentId values to add to .env
 */
import 'dotenv/config'
import { getAccount } from '../src/wallet.js'

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://facilitator.ultravioletadao.xyz'

interface AgentRegistration {
  name: string
  envKey: string
  privateKeyEnv: string
  port: number | null
  description: string
  priceUSDC: string | null
}

const AGENTS: AgentRegistration[] = [
  {
    name: 'orchestrator',
    envKey: 'ORCHESTRATOR_ID',
    privateKeyEnv: 'ORCHESTRATOR_PRIVATE_KEY',
    port: null,
    description: 'Prediction Market Council orchestrator — coordinates 4 specialist agents',
    priceUSDC: null,
  },
  {
    name: 'news',
    envKey: 'AGENT_NEWS_ID',
    privateKeyEnv: 'AGENT_NEWS_PRIVATE_KEY',
    port: 3001,
    description: 'News & macro analysis agent — uses Gloria AI, $0.03 USDC per query',
    priceUSDC: '0.03',
  },
  {
    name: 'market',
    envKey: 'AGENT_MARKET_ID',
    privateKeyEnv: 'AGENT_MARKET_PRIVATE_KEY',
    port: 3002,
    description: 'Live Polymarket data agent — uses Firecrawl, $0.05 USDC per query',
    priceUSDC: '0.05',
  },
  {
    name: 'sentiment',
    envKey: 'AGENT_SENTIMENT_ID',
    privateKeyEnv: 'AGENT_SENTIMENT_PRIVATE_KEY',
    port: 3003,
    description: 'Whale tracking & sentiment agent — uses Einstein AI, $0.02 USDC per query',
    priceUSDC: '0.02',
  },
  {
    name: 'arbitrage',
    envKey: 'AGENT_ARBITRAGE_ID',
    privateKeyEnv: 'AGENT_ARBITRAGE_PRIVATE_KEY',
    port: 3004,
    description: 'Arbitrage risk scoring agent — uses DiamondClaws, $0.001 USDC per query',
    priceUSDC: '0.001',
  },
]

async function registerAgent(agent: AgentRegistration): Promise<string | null> {
  const privateKey = process.env[agent.privateKeyEnv]
  if (!privateKey) {
    console.warn(`  ⚠️  ${agent.name}: ${agent.privateKeyEnv} not set, skipping`)
    return null
  }

  const account = getAccount(privateKey)
  const walletAddress = account.address

  const body: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    walletAddress,
    network: 'base-sepolia',
  }

  if (agent.port) {
    body.endpoint = `http://localhost:${agent.port}/analyze`
    body.paymentRequirements = {
      asset: 'USDC',
      amount: agent.priceUSDC,
      network: 'base-sepolia',
    }
  }

  try {
    const res = await fetch(`${FACILITATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`  ❌ ${agent.name}: registration failed (${res.status}): ${text}`)
      return null
    }

    const data = await res.json() as { agentId?: string; id?: string }
    const agentId = data.agentId ?? data.id ?? null

    console.log(`  ✅ ${agent.name}: agentId=${agentId}  wallet=${walletAddress}`)
    return agentId as string
  } catch (err) {
    console.error(`  ❌ ${agent.name}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function registerDiscovery(agent: AgentRegistration, agentId: string): Promise<void> {
  if (!agent.port) return

  try {
    const res = await fetch(`${FACILITATOR_URL}/discovery/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        network: 'base-sepolia',
        endpoint: `http://localhost:${agent.port}/analyze`,
        paymentRequirements: {
          asset: 'USDC',
          amount: agent.priceUSDC,
          network: 'base-sepolia',
        },
        tags: ['prediction-market', 'council', agent.name],
      }),
    })

    if (res.ok) {
      console.log(`  📡 ${agent.name}: registered in discovery`)
    }
  } catch {
    // Non-critical
  }
}

async function main() {
  console.log(`Registering agents at ${FACILITATOR_URL}\n`)

  const envLines: string[] = []

  for (const agent of AGENTS) {
    const agentId = await registerAgent(agent)
    if (agentId) {
      envLines.push(`${agent.envKey}=${agentId}`)
      await registerDiscovery(agent, agentId)
    }
  }

  if (envLines.length > 0) {
    console.log('\nAdd these to your .env file:')
    console.log('─'.repeat(40))
    envLines.forEach(l => console.log(l))
    console.log('─'.repeat(40))
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Registration failed:', err)
  process.exit(1)
})
