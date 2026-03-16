import { NextRequest } from 'next/server'

const AGENT_CONFIGS = [
  { id: 'news',      url: 'http://localhost:3001/analyze', price: '0.03' },
  { id: 'market',    url: 'http://localhost:3002/analyze', price: '0.05' },
  { id: 'sentiment', url: 'http://localhost:3003/analyze', price: '0.02' },
  { id: 'arbitrage', url: 'http://localhost:3004/analyze', price: '0.001' },
]

function kelly(weightedProb: number, marketPrice: number): number {
  if (marketPrice <= 0 || marketPrice >= 1) return 0
  const b = (1 / marketPrice) - 1
  if (b <= 0) return 0
  const f = (b * weightedProb - (1 - weightedProb)) / b
  return Math.max(0, Math.min(0.25, f))
}

function deliberate(agents: AgentResult[]) {
  const active = agents.filter(a => a.confidence > 0)
  const num = active.reduce((s, a) => s + a.probability * a.confidence, 0)
  const den = active.reduce((s, a) => s + a.confidence, 0)
  const weighted = den > 0 ? num / den : 0.5

  const market = agents.find(a => a.agentId === 'market')
  const marketPrice = market && market.confidence > 0.1 ? market.probability : weighted
  const kf = kelly(weighted, marketPrice)

  return {
    weightedProbability: weighted,
    recommendation: weighted > 0.55 ? 'YES' : weighted < 0.45 ? 'NO' : 'SKIP',
    kellyFraction: kf,
    suggestedBetUSDC: parseFloat((kf * 100).toFixed(2)),
    totalSpentUSDC: agents.reduce((s, a) => s + parseFloat(a.paidUSDC || '0'), 0).toFixed(4),
  }
}

interface AgentResult {
  agentId: string
  probability: number
  confidence: number
  reasoning: string
  paidUSDC: string
  txHash: string
  error?: string
}

export async function POST(req: NextRequest) {
  const { question, marketUrl } = await req.json() as { question: string; marketUrl?: string }

  if (!question?.trim()) {
    return new Response(JSON.stringify({ error: 'question is required' }), { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      send('start', { question })

      // Call all agents in parallel, stream each result as it arrives
      const agentResults: AgentResult[] = []

      await Promise.allSettled(
        AGENT_CONFIGS.map(async (config) => {
          try {
            const res = await fetch(config.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question, marketUrl }),
            })

            const payHeader = res.headers.get('X-PAYMENT-RESPONSE') ?? ''
            let txHash = ''
            let paidUSDC = config.price
            if (payHeader) {
              try {
                const p = JSON.parse(payHeader) as { txHash?: string; amount?: string }
                txHash = p.txHash ?? ''
                paidUSDC = p.amount ?? config.price
              } catch { /* ignore */ }
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data = await res.json() as { probability: number; confidence: number; reasoning: string }
            const result: AgentResult = {
              agentId: config.id,
              probability: data.probability,
              confidence: data.confidence,
              reasoning: data.reasoning,
              paidUSDC,
              txHash,
            }
            agentResults.push(result)
            send('agent', result)
          } catch (err) {
            const result: AgentResult = {
              agentId: config.id,
              probability: 0.5,
              confidence: 0.05,
              reasoning: `Agent offline: ${err instanceof Error ? err.message : String(err)}`,
              paidUSDC: '0',
              txHash: '',
              error: String(err),
            }
            agentResults.push(result)
            send('agent', result)
          }
        })
      )

      const verdict = deliberate(agentResults)
      send('verdict', { ...verdict, breakdown: agentResults })
      send('done', {})
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
