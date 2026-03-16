#!/usr/bin/env tsx
import 'dotenv/config'
import { runOrchestrator } from './orchestrator.js'
import { deliberate } from './council.js'
import type { AgentResponse } from '../types.js'
import { postFeedback } from './feedback.js'

const AGENT_COLORS: Record<string, string> = {
  news:      '\x1b[36m',  // cyan
  market:    '\x1b[32m',  // green
  sentiment: '\x1b[33m',  // yellow
  arbitrage: '\x1b[35m',  // magenta
}
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function agentLine(a: AgentResponse): string {
  const color = AGENT_COLORS[a.agentId] ?? ''
  const status = a.txHash ? '✅' : (a.paidUSDC === '0' ? '❌' : '⚠️')
  const txStr = a.txHash ? `tx ${a.txHash.slice(0, 10)}...` : 'no tx'
  return `  ${status} ${color}[${a.agentId.padEnd(10)}]${RESET} paid ${a.paidUSDC} USDC → ${txStr} → P(YES)=${(a.probability * 100).toFixed(0)}% confidence=${(a.confidence * 100).toFixed(0)}%`
}

async function main() {
  const question = process.argv.slice(2).join(' ')

  if (!question) {
    console.error('Usage: pnpm ask "<question>"')
    console.error('  e.g. pnpm ask "Will ETH hit $4k before July 2025?"')
    process.exit(1)
  }

  console.log(`\n${BOLD}Prediction Market Council${RESET}`)
  console.log(`Question: ${question}\n`)
  console.log('Querying 4 specialist agents...\n')

  const startTime = Date.now()
  const agents = await runOrchestrator({ question })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Print per-agent results as they come in
  for (const agent of agents) {
    console.log(agentLine(agent))
    console.log(`      → ${agent.reasoning}`)
  }

  const verdict = deliberate(agents)

  // ERC-8004 reputation feedback (non-blocking)
  postFeedback(agents).catch(() => {})

  const recColor = verdict.recommendation === 'YES' ? '\x1b[32m'
    : verdict.recommendation === 'NO' ? '\x1b[31m'
    : '\x1b[33m'

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`${BOLD}COUNCIL VERDICT: ${recColor}${verdict.recommendation}${RESET}${BOLD} (${(verdict.weightedProbability * 100).toFixed(1)}% probability)${RESET}`)

  if (verdict.recommendation !== 'SKIP') {
    console.log(`Suggested bet: $${verdict.suggestedBetUSDC} (${(verdict.kellyFraction * 100).toFixed(1)}% of $100 bankroll)`)
  } else {
    console.log('Market too close to call — skip this one.')
  }

  console.log(`Total spent on analysis: $${verdict.totalSpentUSDC} USDC`)
  console.log(`Analysis time: ${elapsed}s`)
  console.log(`${'═'.repeat(50)}\n`)

  // Agent breakdown
  console.log('Agent breakdown:')
  console.log('  Agent       P(YES)   Conf   Reasoning')
  console.log('  ' + '─'.repeat(70))
  for (const a of verdict.breakdown) {
    const p = `${(a.probability * 100).toFixed(0)}%`.padEnd(8)
    const c = `${(a.confidence * 100).toFixed(0)}%`.padEnd(6)
    console.log(`  ${a.agentId.padEnd(12)}${p} ${c} ${a.reasoning.slice(0, 60)}`)
  }
  console.log()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
