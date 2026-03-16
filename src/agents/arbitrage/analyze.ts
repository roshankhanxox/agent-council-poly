import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

// DiamondClaws x402 endpoint for DeFi/arbitrage risk scoring
const DIAMONDCLAWS_URL = 'https://api.diamondclaws.xyz/v1/risk'

export async function analyzeArbitrage(
  question: string,
  x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  let rawData: unknown = null

  try {
    const response = await x402Fetch(DIAMONDCLAWS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: question,
        sources: ['polymarket', 'manifold', 'metaculus'],
        includeArb: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`DiamondClaws returned ${response.status}`)
    }

    rawData = await response.json()
  } catch (err) {
    console.warn('[arbitrage] DiamondClaws unavailable, using fallback:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.08,
      reasoning: 'Arbitrage/risk service unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  // Expected shape: { riskScore: 0-1, crossMarketPrices: [{source, price}], arbOpportunity: boolean }
  type DiamondClawsResponse = {
    riskScore?: number
    crossMarketPrices?: Array<{ source: string; price: number }>
    arbOpportunity?: boolean
    consensusPrice?: number
  }

  const data = rawData as DiamondClawsResponse
  let probability = 0.5
  let confidence = 0.35

  if (typeof data.consensusPrice === 'number') {
    probability = data.consensusPrice
    confidence = 0.6
  } else if (data.crossMarketPrices && data.crossMarketPrices.length > 0) {
    // Average cross-market prices
    const avg = data.crossMarketPrices.reduce((s, p) => s + p.price, 0) / data.crossMarketPrices.length
    probability = avg
    confidence = 0.5 + (data.crossMarketPrices.length * 0.05)  // more sources → more confidence
  }

  // High risk score (close to 1) means the market is risky/uncertain
  if (typeof data.riskScore === 'number') {
    confidence = Math.max(0.1, confidence - data.riskScore * 0.2)
  }

  probability = Math.max(0.01, Math.min(0.99, probability))
  confidence = Math.max(0.05, Math.min(0.95, confidence))

  const arbNote = data.arbOpportunity
    ? ' Cross-market arbitrage opportunity detected.'
    : ''

  const sourcesNote = data.crossMarketPrices?.length
    ? ` Consensus across ${data.crossMarketPrices.length} markets.`
    : ''

  return {
    probability,
    confidence,
    reasoning: `Risk-adjusted probability: ${(probability * 100).toFixed(0)}%.${sourcesNote}${arbNote}`,
    rawData,
  }
}
