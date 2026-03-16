import 'dotenv/config'
import type { AgentResponse } from '../types.js'

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://facilitator.ultravioletadao.xyz'

const AGENT_IDS: Record<string, string | undefined> = {
  news:      process.env.AGENT_NEWS_ID,
  market:    process.env.AGENT_MARKET_ID,
  sentiment: process.env.AGENT_SENTIMENT_ID,
  arbitrage: process.env.AGENT_ARBITRAGE_ID,
}

/**
 * Post per-agent feedback to ERC-8004 facilitator to build reputation over time.
 * Called after council deliberation — non-blocking, failures are silently ignored.
 */
export async function postFeedback(agents: AgentResponse[]): Promise<void> {
  const promises = agents.map(async (agent) => {
    const agentId = AGENT_IDS[agent.agentId]
    if (!agentId) return  // not registered yet

    try {
      const value = Math.round(agent.confidence * 100)
      await fetch(`${FACILITATOR_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          network: 'base-sepolia',
          tag1: agent.confidence > 0.3 ? 'starred' : 'low-confidence',
          value,
        }),
      })
    } catch {
      // Non-critical — don't crash if facilitator is unreachable
    }
  })

  await Promise.allSettled(promises)
}
