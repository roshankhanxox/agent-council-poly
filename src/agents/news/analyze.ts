import 'dotenv/config'
import Groq from 'groq-sdk'
import type { AgentAnalysis } from '../../types.js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Gloria AI x402 endpoint (Base Sepolia live service)
const GLORIA_AI_URL = 'https://api.gloria.ai/v1/news'

export async function analyzeNews(
  question: string,
  x402Fetch: typeof fetch
): Promise<AgentAnalysis> {
  let rawData: unknown = null

  try {
    const response = await x402Fetch(
      `${GLORIA_AI_URL}?q=${encodeURIComponent(question)}&limit=5`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    )
    if (!response.ok) throw new Error(`Gloria AI returned ${response.status}`)
    rawData = await response.json()
  } catch (err) {
    console.warn('[news] Gloria AI unavailable, using fallback:', err instanceof Error ? err.message : err)
    return {
      probability: 0.5,
      confidence: 0.1,
      reasoning: 'News service unavailable; returning neutral estimate.',
      rawData: null,
    }
  }

  const newsText = JSON.stringify(rawData, null, 2).slice(0, 3000)

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `You are a prediction market analyst. Based on the following recent news, estimate the probability (0 to 1) that this will resolve YES: "${question}"

News data:
${newsText}

Reply in JSON only: {"probability": <0-1>, "confidence": <0-1>, "reasoning": "<1-2 sentences>"}`,
      },
    ],
  })

  const text = completion.choices[0]?.message?.content ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { probability: 0.5, confidence: 0.15, reasoning: 'Failed to parse LLM output.', rawData }
  }

  const parsed = JSON.parse(jsonMatch[0]) as { probability: number; confidence: number; reasoning: string }
  return {
    probability: Math.max(0, Math.min(1, parsed.probability ?? 0.5)),
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.3)),
    reasoning: parsed.reasoning ?? '',
    rawData,
  }
}
