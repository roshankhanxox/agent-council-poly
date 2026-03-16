import 'dotenv/config'
import { createX402Fetch } from '../x402client.js'
import type { AgentResponse, AgentId, AnalyzeRequest } from '../types.js'

interface AgentConfig {
  id: AgentId
  url: string
  price: string
}

const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'news',      url: 'http://localhost:3001/analyze', price: '0.03' },
  { id: 'market',    url: 'http://localhost:3002/analyze', price: '0.05' },
  { id: 'sentiment', url: 'http://localhost:3003/analyze', price: '0.02' },
  { id: 'arbitrage', url: 'http://localhost:3004/analyze', price: '0.001' },
]

async function callAgent(
  config: AgentConfig,
  request: AnalyzeRequest,
  x402Fetch: typeof fetch
): Promise<AgentResponse> {
  const response = await x402Fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Agent ${config.id} returned ${response.status}: ${await response.text()}`)
  }

  // Extract payment details from x402 response headers
  const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE') ?? ''
  let txHash = ''
  let paidUSDC = config.price

  if (paymentResponseHeader) {
    try {
      const paymentData = JSON.parse(paymentResponseHeader) as { txHash?: string; amount?: string }
      txHash = paymentData.txHash ?? ''
      paidUSDC = paymentData.amount ?? config.price
    } catch {
      // Header parsing failed, use defaults
    }
  }

  const data = await response.json() as {
    probability: number
    confidence: number
    reasoning: string
    rawData?: unknown
  }

  return {
    agentId: config.id,
    probability: data.probability,
    confidence: data.confidence,
    reasoning: data.reasoning,
    rawData: data.rawData ?? null,
    paidUSDC,
    txHash,
  }
}

export async function runOrchestrator(request: AnalyzeRequest): Promise<AgentResponse[]> {
  const orchestratorKey = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!orchestratorKey) {
    throw new Error('ORCHESTRATOR_PRIVATE_KEY not set in .env')
  }

  const x402Fetch = createX402Fetch(orchestratorKey)

  // Call all 4 agents in parallel — don't fail if one is down
  const results = await Promise.allSettled(
    AGENT_CONFIGS.map(config => callAgent(config, request, x402Fetch))
  )

  const responses: AgentResponse[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const config = AGENT_CONFIGS[i]

    if (result.status === 'fulfilled') {
      responses.push(result.value)
    } else {
      console.warn(`[orchestrator] Agent ${config.id} failed: ${result.reason}`)
      // Push a degraded response so council still has something to work with
      responses.push({
        agentId: config.id,
        probability: 0.5,
        confidence: 0.05,
        reasoning: `Agent offline: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        rawData: null,
        paidUSDC: '0',
        txHash: '',
      })
    }
  }

  return responses
}
