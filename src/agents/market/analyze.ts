import 'dotenv/config'
import type { AgentAnalysis } from '../../types.js'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Map common tickers/names to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', BITCOIN: 'bitcoin',
  ETH: 'ethereum', ETHEREUM: 'ethereum',
  SOL: 'solana', SOLANA: 'solana',
  BNB: 'binancecoin', BINANCE: 'binancecoin',
  XRP: 'ripple', RIPPLE: 'ripple',
  ADA: 'cardano', CARDANO: 'cardano',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network', POLYGON: 'matic-network',
  DOT: 'polkadot', POLKADOT: 'polkadot',
  LINK: 'chainlink',
  DOGE: 'dogecoin',
}

/** Parse price from text: "$4k"→4000, "$4,000"→4000, "4000"→4000, "$10k"→10000 */
function parsePrice(s: string): number | null {
  const kMatch = s.match(/\$?([\d,]+\.?\d*)\s*k\b/i)
  if (kMatch) return parseFloat(kMatch[1].replace(',', '')) * 1000
  const numMatch = s.match(/\$\s*([\d,]{2,}\.?\d*)\b/)
  if (numMatch) return parseFloat(numMatch[1].replace(/,/g, ''))
  return null
}

/** Parse days-until-deadline from question text */
function parseDaysUntil(question: string): number {
  const now = new Date()
  // Match "before July 2026", "by July 2026", "before July 1, 2026", etc.
  const m = question.match(/(?:before|by|end of)\s+([A-Za-z]+)\s+(\d{4})/i)
  if (m) {
    const months: Record<string, number> = {
      january:0,february:1,march:2,april:3,may:4,june:5,july:6,
      august:7,september:8,october:9,november:10,december:11,
      jan:0,feb:1,mar:2,apr:3,may4:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
    }
    const month = months[m[1].toLowerCase()]
    if (month !== undefined) {
      const target = new Date(parseInt(m[2]), month, 1)
      return Math.max(1, Math.round((target.getTime() - now.getTime()) / 86400000))
    }
  }
  return 180 // default 6 months
}

/**
 * Estimate P(price hits target at some point before deadline) using the
 * reflection principle for geometric Brownian motion:
 *   P ≈ 2 * Φ(-d) where d = log(T/P₀) / (σ * √days)
 * If P₀ >= T already, return ~0.97
 */
function estimateHitProbability(currentPrice: number, targetPrice: number, daysLeft: number, dailyVol: number): number {
  if (currentPrice >= targetPrice) return 0.97
  const d = Math.log(targetPrice / currentPrice) / (dailyVol * Math.sqrt(daysLeft))
  // Standard normal CDF approximation (Abramowitz & Stegun)
  const phi = (x: number) => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x))
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2) * poly
    return x >= 0 ? cdf : 1 - cdf
  }
  return Math.max(0.01, Math.min(0.99, 2 * phi(-d)))
}

type GammaMarket = {
  question?: string
  outcomePrices?: string
  outcomes?: string
  volume?: string
  active?: boolean
  closed?: boolean
}

type GammaEvent = { markets?: GammaMarket[] }

export async function analyzeMarket(
  question: string,
  marketUrl: string | undefined,
  _x402Fetch: typeof fetch
): Promise<AgentAnalysis> {

  // ── URL case: look up the specific Polymarket event ──────────────────────
  if (marketUrl) {
    const slugMatch = marketUrl.match(/polymarket\.com\/event\/([^/?#]+)/)
    if (slugMatch) {
      try {
        const slug = slugMatch[1]
        const res = await fetch(
          `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&limit=1`,
          { headers: { Accept: 'application/json' } }
        )
        if (res.ok) {
          const events = await res.json() as GammaEvent[]
          const markets = (events?.[0]?.markets ?? []).filter(m => !m.closed)

          if (markets.length > 0) {
            // Pick market closest to target price mentioned in question
            const targetPrice = parsePrice(question)
            let best: GammaMarket

            if (targetPrice !== null && markets.length > 1) {
              best = markets
                .map(m => ({ m, dist: Math.abs((parsePrice(m.question ?? '') ?? Infinity) - targetPrice) }))
                .sort((a, b) => a.dist - b.dist)[0].m
            } else {
              best = markets[0]
            }

            let probability = 0.5
            let confidence = 0.25
            try {
              const prices = JSON.parse(best.outcomePrices ?? '[]') as number[]
              const outcomes = JSON.parse(best.outcomes ?? '[]') as string[]
              const yesIdx = outcomes.findIndex(o => /yes|true/i.test(o))
              const yesPrice = yesIdx >= 0 ? prices[yesIdx] : prices[0]
              if (typeof yesPrice === 'number' && yesPrice > 0 && yesPrice < 1) {
                probability = yesPrice
                const vol = parseFloat(best.volume ?? '0')
                confidence = vol > 100000 ? 0.9 : vol > 10000 ? 0.8 : vol > 1000 ? 0.65 : 0.4
              }
            } catch { /* leave defaults */ }

            const volStr = best.volume ? ` Vol: $${parseFloat(best.volume).toLocaleString()}.` : ''
            return {
              probability,
              confidence,
              reasoning: `Polymarket: ${(probability * 100).toFixed(0)}% YES — "${best.question ?? question}".${volStr}`,
              rawData: markets,
            }
          }
        }
      } catch (err) {
        console.warn('[market] Event lookup failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  // ── No-URL case: statistical estimate from CoinGecko price data ──────────
  try {
    // Extract asset
    const assetMatch = question.match(/\b(BTC|ETH|SOL|BNB|XRP|ADA|AVAX|MATIC|DOT|LINK|DOGE|bitcoin|ethereum|solana|binance|ripple|cardano|polkadot|polygon)\b/i)
    const ticker = assetMatch ? assetMatch[1].toUpperCase() : null
    const coinId = ticker ? COINGECKO_IDS[ticker] : null

    if (!coinId) {
      return { probability: 0.5, confidence: 0.05, reasoning: 'Could not identify the asset in the question.', rawData: null }
    }

    // Get current price
    const priceRes = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`,
      { headers: { Accept: 'application/json' } }
    )
    if (!priceRes.ok) throw new Error(`CoinGecko price API returned ${priceRes.status}`)
    const priceData = await priceRes.json() as Record<string, { usd: number }>
    const currentPrice = priceData[coinId]?.usd
    if (!currentPrice) throw new Error('No price data returned')

    // Get 90-day OHLCV to estimate daily volatility
    const histRes = await fetch(
      `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=90&interval=daily`,
      { headers: { Accept: 'application/json' } }
    )
    let dailyVol = 0.04 // default 4% if historical fetch fails
    if (histRes.ok) {
      const histData = await histRes.json() as { prices: [number, number][] }
      const closes = histData.prices.map(p => p[1])
      if (closes.length > 5) {
        const logReturns = closes.slice(1).map((p, i) => Math.log(p / closes[i]))
        const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length
        const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length
        dailyVol = Math.sqrt(variance)
      }
    }

    const targetPrice = parsePrice(question)
    const daysLeft = parseDaysUntil(question)

    if (targetPrice === null) {
      return {
        probability: 0.5,
        confidence: 0.1,
        reasoning: `Current ${ticker} price: $${currentPrice.toLocaleString()}. No target price found in question to estimate probability.`,
        rawData: { currentPrice, dailyVol },
      }
    }

    const probability = estimateHitProbability(currentPrice, targetPrice, daysLeft, dailyVol)
    const pctNeeded = ((targetPrice / currentPrice - 1) * 100).toFixed(0)
    const direction = targetPrice > currentPrice ? `needs +${pctNeeded}%` : 'already above target'

    return {
      probability,
      confidence: 0.55,
      reasoning: `${ticker} is at $${currentPrice.toLocaleString()} (${direction} to reach $${targetPrice.toLocaleString()}). Statistical estimate over ${daysLeft} days with ${(dailyVol * 100).toFixed(1)}% daily vol.`,
      rawData: { currentPrice, targetPrice, daysLeft, dailyVol },
    }
  } catch (err) {
    console.warn('[market] CoinGecko fallback failed:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.05,
      reasoning: 'Market data unavailable; returning neutral estimate.',
      rawData: null,
    }
  }
}
