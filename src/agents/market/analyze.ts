import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

// Firecrawl x402 endpoint for web scraping
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape'

export async function analyzeMarket(
  question: string,
  marketUrl: string | undefined,
  x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  // Derive a Polymarket search URL if no specific market URL provided
  const targetUrl = marketUrl ?? `https://polymarket.com/markets?q=${encodeURIComponent(question)}`

  let rawData: unknown = null

  try {
    const response = await x402Fetch(FIRECRAWL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`Firecrawl returned ${response.status}`)
    }

    rawData = await response.json()
  } catch (err) {
    console.warn('[market] Firecrawl unavailable, using fallback:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.1,
      reasoning: 'Market data service unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  // Extract price signal from scraped Polymarket page
  const content = (rawData as { data?: { markdown?: string } })?.data?.markdown ?? JSON.stringify(rawData)

  // Look for percentage patterns typical in Polymarket (e.g. "72% YES", "0.72")
  const percentMatch = content.match(/(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:YES|yes|chance|probability)/i)
  const decimalMatch = content.match(/\b0\.(\d{2})\b/)

  let probability = 0.5
  let confidence = 0.2

  if (percentMatch) {
    probability = parseFloat(percentMatch[1]) / 100
    confidence = 0.85  // High confidence — this is live market pricing
  } else if (decimalMatch) {
    probability = parseFloat(`0.${decimalMatch[1]}`)
    confidence = 0.6
  }

  probability = Math.max(0.01, Math.min(0.99, probability))

  return {
    probability,
    confidence,
    reasoning: percentMatch
      ? `Polymarket shows ${(probability * 100).toFixed(0)}% YES. Market price directly reflects crowd probability.`
      : 'Could not extract precise market price; using scraped content heuristics.',
    rawData,
  }
}
