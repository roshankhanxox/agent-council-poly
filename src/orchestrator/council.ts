import type { AgentResponse, CouncilVerdict } from '../types.js'

const BANKROLL = 100  // default bankroll in USDC for bet sizing
const MAX_KELLY = 0.25  // cap at 25% of bankroll

/**
 * Compute weighted probability:
 *   P = Σ(probability_i × confidence_i) / Σ(confidence_i)
 */
function weightedProbability(agents: AgentResponse[]): number {
  const activeAgents = agents.filter(a => a.confidence > 0)
  if (activeAgents.length === 0) return 0.5

  const numerator = activeAgents.reduce((sum, a) => sum + a.probability * a.confidence, 0)
  const denominator = activeAgents.reduce((sum, a) => sum + a.confidence, 0)

  return denominator > 0 ? numerator / denominator : 0.5
}

/**
 * Kelly Criterion bet sizing:
 *   b = (1 / marketPrice) - 1    ← implied odds
 *   f = (b × P - (1 - P)) / b
 *   f = clamp(f, 0, MAX_KELLY)
 *
 * marketPrice comes from the 'market' agent's probability (which reflects
 * the Polymarket YES price directly).
 */
function kellyFraction(weightedProb: number, marketPrice: number): number {
  // Avoid division by zero or degenerate cases
  if (marketPrice <= 0 || marketPrice >= 1) return 0

  const b = (1 / marketPrice) - 1  // implied odds for a $1 YES share

  if (b <= 0) return 0

  const f = (b * weightedProb - (1 - weightedProb)) / b
  return Math.max(0, Math.min(MAX_KELLY, f))
}

export function deliberate(agents: AgentResponse[]): CouncilVerdict {
  const weighted = weightedProbability(agents)

  // Use market agent's probability as the reference market price
  // (Polymarket price IS the market's implied probability)
  const marketAgent = agents.find(a => a.agentId === 'market')
  const marketPrice = marketAgent && marketAgent.confidence > 0.1
    ? marketAgent.probability
    : weighted  // fall back to weighted prob if market agent is offline

  const kelly = kellyFraction(weighted, marketPrice)
  const suggestedBet = parseFloat((kelly * BANKROLL).toFixed(2))

  let recommendation: 'YES' | 'NO' | 'SKIP'
  if (weighted > 0.55) recommendation = 'YES'
  else if (weighted < 0.45) recommendation = 'NO'
  else recommendation = 'SKIP'

  const totalSpent = agents
    .reduce((sum, a) => sum + parseFloat(a.paidUSDC || '0'), 0)
    .toFixed(4)

  return {
    weightedProbability: weighted,
    recommendation,
    kellyFraction: kelly,
    suggestedBetUSDC: suggestedBet,
    breakdown: agents,
    totalSpentUSDC: totalSpent,
  }
}
