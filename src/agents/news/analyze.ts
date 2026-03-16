import 'dotenv/config'
import Groq from 'groq-sdk'
import type { AgentAnalysis } from '../../types.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

/** Map tickers to full names for NewsAPI search */
const ASSET_NAMES: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binance',
  XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche', MATIC: 'polygon',
  DOT: 'polkadot', LINK: 'chainlink', DOGE: 'dogecoin', LTC: 'litecoin',
}

function extractAsset(question: string): { ticker: string; name: string } {
  const m = question.match(/\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|MATIC|DOT|LINK|LTC|bitcoin|ethereum|solana|binance|ripple|cardano|polkadot|polygon|chainlink|dogecoin)\b/i)
  if (!m) return { ticker: 'crypto', name: 'cryptocurrency' }
  const ticker = m[1].toUpperCase()
  // If full name matched, map to ticker
  const fullNames: Record<string, string> = { BITCOIN:'BTC', ETHEREUM:'ETH', SOLANA:'SOL', BINANCE:'BNB', RIPPLE:'XRP', CARDANO:'ADA', POLKADOT:'DOT', POLYGON:'MATIC', CHAINLINK:'LINK', DOGECOIN:'DOGE' }
  const normalTicker = fullNames[ticker] ?? ticker
  return { ticker: normalTicker, name: ASSET_NAMES[normalTicker] ?? m[1].toLowerCase() }
}

export async function analyzeNews(
  question: string,
  _x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  const { ticker, name } = extractAsset(question)
  const apiKey = process.env.NEWSAPI_KEY
  let rawData: unknown = null

  if (apiKey) {
    try {
      // Build a targeted query: asset name + "price" for price questions
      const isPriceQ = /price|hit|\$|k\b|thousand|million|ath|high/i.test(question)
      const query = isPriceQ ? `${name} price` : name
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=relevancy&pageSize=5&apiKey=${apiKey}`
      const res = await fetch(url)
      if (res.ok) rawData = await res.json()
    } catch (err) {
      console.warn('[news] NewsAPI unavailable:', err instanceof Error ? err.message : err)
    }
  }

  // Format articles
  let newsText = 'No news data available.'
  if (rawData) {
    type Article = { title?: string; description?: string; publishedAt?: string; source?: { name?: string } }
    const articles = ((rawData as { articles?: Article[] }).articles ?? [])
    if (articles.length > 0) {
      newsText = articles.map((a, i) =>
        `${i + 1}. [${a.publishedAt?.slice(0, 10) ?? ''}] ${a.title ?? ''}: ${a.description ?? ''}`
      ).join('\n')
    }
  }

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 220,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a prediction market analyst specialising in ${name} and crypto markets.
If the news articles are clearly unrelated to the question, set probability=0.5 and confidence=0.05 and state this.
Do not fabricate a probability from unrelated context. Use your general crypto knowledge if news is weak.
Always respond with valid JSON only.`,
      },
      {
        role: 'user',
        content: `Estimate the probability (0–1) that this resolves YES: "${question}"

Recent ${ticker} news:
${newsText}

Return JSON: {"probability": <0-1>, "confidence": <0-1>, "reasoning": "<1-2 sentences>"}`,
      },
    ],
  })

  const text = completion.choices[0]?.message?.content ?? ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no json')
    const parsed = JSON.parse(jsonMatch[0]) as { probability: number; confidence: number; reasoning: string }
    return {
      probability: Math.max(0, Math.min(1, Number(parsed.probability) || 0.5)),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.3)),
      reasoning: String(parsed.reasoning ?? ''),
      rawData,
    }
  } catch {
    return { probability: 0.5, confidence: 0.15, reasoning: 'LLM analysis inconclusive.', rawData }
  }
}
