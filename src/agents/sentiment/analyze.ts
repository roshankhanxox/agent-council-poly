import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

// Alternative.me Crypto Fear & Greed Index — no auth required
const FNG_URL = 'https://api.alternative.me/fng/?limit=3&format=json'

export async function analyzeSentiment(
  question: string,
  _x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  let rawData: unknown = null

  try {
    const res = await fetch(FNG_URL, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Fear & Greed API returned ${res.status}`)
    rawData = await res.json()
  } catch (err) {
    console.warn('[sentiment] Fear & Greed API unavailable:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.1,
      reasoning: 'Sentiment data unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  type FngEntry = { value: string; value_classification: string; timestamp: string }
  type FngResponse = { data?: FngEntry[] }

  const fng = rawData as FngResponse
  const entries = fng.data ?? []

  if (entries.length === 0) {
    return { probability: 0.5, confidence: 0.2, reasoning: 'No sentiment data returned.', rawData }
  }

  // Average the last 3 days (or fewer)
  const avgScore = entries.reduce((s, e) => s + parseInt(e.value, 10), 0) / entries.length
  const latest = entries[0]
  const classification = latest.value_classification ?? 'Neutral'

  // Fear & Greed: 0 = Extreme Fear, 100 = Extreme Greed
  // Map to probability: crypto sentiment is loosely correlated with bullish outcomes
  // but we moderate the signal — sentiment alone is weak evidence
  const rawProb = avgScore / 100

  // Detect if question is crypto-related for higher confidence
  const isCrypto = /btc|eth|bitcoin|ethereum|crypto|defi|nft|sol|bnb|usdc|token/i.test(question)
  const confidence = isCrypto ? 0.45 : 0.25

  // Moderate toward 0.5 for non-crypto questions
  const probability = isCrypto
    ? Math.max(0.1, Math.min(0.9, rawProb))
    : 0.5 + (rawProb - 0.5) * 0.3

  return {
    probability,
    confidence,
    reasoning: `Crypto Fear & Greed Index: ${avgScore.toFixed(0)}/100 (${classification}). ${isCrypto ? 'Relevant crypto sentiment signal.' : 'Weak signal for non-crypto market.'}`,
    rawData,
  }
}
