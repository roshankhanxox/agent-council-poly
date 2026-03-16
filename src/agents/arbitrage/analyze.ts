import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

// Manifold Markets API — no auth required
const MANIFOLD_API = 'https://manifold.markets/api/v0'

export async function analyzeArbitrage(
  question: string,
  _x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  let rawData: unknown = null

  try {
    const res = await fetch(
      `${MANIFOLD_API}/search-markets?term=${encodeURIComponent(question.slice(0, 80))}&limit=5`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) throw new Error(`Manifold API returned ${res.status}`)
    rawData = await res.json()
  } catch (err) {
    console.warn('[arbitrage] Manifold API unavailable:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.08,
      reasoning: 'Cross-market data unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  type ManifoldMarket = {
    question?: string
    probability?: number
    pool?: { YES?: number; NO?: number }
    totalLiquidity?: number
    volume?: number
    isResolved?: boolean
  }

  const markets = (rawData as ManifoldMarket[]) ?? []
  const active = markets.filter(m => !m.isResolved && typeof m.probability === 'number')

  if (active.length === 0) {
    return {
      probability: 0.5,
      confidence: 0.1,
      reasoning: 'No matching Manifold markets found for cross-market comparison.',
      rawData,
    }
  }

  // Weighted average by volume/liquidity across markets
  let weightedSum = 0
  let totalWeight = 0

  for (const m of active) {
    const weight = (m.totalLiquidity ?? 0) + (m.volume ?? 0) + 1
    weightedSum += (m.probability ?? 0.5) * weight
    totalWeight += weight
  }

  const probability = Math.max(0.01, Math.min(0.99, weightedSum / totalWeight))

  // Confidence based on spread across markets (low spread = high consensus)
  const probs = active.map(m => m.probability ?? 0.5)
  const spread = Math.max(...probs) - Math.min(...probs)
  const confidence = Math.max(0.1, Math.min(0.7, 0.6 - spread))

  // Detect arbitrage: if Manifold prob differs significantly from base (0.5 placeholder)
  const arbNote = spread > 0.15 && active.length > 1
    ? ` Spread of ${(spread * 100).toFixed(0)}pp across ${active.length} markets suggests potential arb.`
    : ''

  return {
    probability,
    confidence,
    reasoning: `Cross-market consensus (${active.length} Manifold markets): ${(probability * 100).toFixed(0)}% YES.${arbNote}`,
    rawData,
  }
}
