import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

// Einstein AI x402 endpoint for whale/sentiment tracking
const EINSTEIN_AI_URL = 'https://api.einstein.ai/v1/sentiment'

export async function analyzeSentiment(
  question: string,
  x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  let rawData: unknown = null

  try {
    const response = await x402Fetch(EINSTEIN_AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, signals: ['whale', 'social', 'onchain'] }),
    })

    if (!response.ok) {
      throw new Error(`Einstein AI returned ${response.status}`)
    }

    rawData = await response.json()
  } catch (err) {
    console.warn('[sentiment] Einstein AI unavailable, using fallback:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.1,
      reasoning: 'Sentiment service unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  // Parse Einstein AI response: expected shape { bullish: 0-1, bearish: 0-1, whaleActivity: "high"|"medium"|"low" }
  type EinsteinResponse = {
    bullish?: number
    bearish?: number
    whaleActivity?: string
    score?: number
    sentiment?: string
  }

  const data = rawData as EinsteinResponse
  let probability = 0.5
  let confidence = 0.4

  if (typeof data.score === 'number') {
    // Normalized -1 to 1 → 0 to 1
    probability = (data.score + 1) / 2
    confidence = 0.55
  } else if (typeof data.bullish === 'number' && typeof data.bearish === 'number') {
    const total = data.bullish + data.bearish
    probability = total > 0 ? data.bullish / total : 0.5
    confidence = Math.min(0.7, total)
  } else if (data.sentiment) {
    const s = data.sentiment.toLowerCase()
    if (s === 'bullish' || s === 'positive') { probability = 0.65; confidence = 0.4 }
    else if (s === 'bearish' || s === 'negative') { probability = 0.35; confidence = 0.4 }
  }

  // Whale activity boosts confidence
  if (data.whaleActivity === 'high') confidence = Math.min(0.9, confidence + 0.2)
  else if (data.whaleActivity === 'low') confidence = Math.max(0.1, confidence - 0.1)

  probability = Math.max(0.01, Math.min(0.99, probability))

  const signal = probability > 0.55 ? 'bullish' : probability < 0.45 ? 'bearish' : 'neutral'
  const whaleNote = data.whaleActivity ? ` Whale activity: ${data.whaleActivity}.` : ''

  return {
    probability,
    confidence,
    reasoning: `Sentiment signal is ${signal} (score: ${(probability * 100).toFixed(0)}%).${whaleNote}`,
    rawData,
  }
}
