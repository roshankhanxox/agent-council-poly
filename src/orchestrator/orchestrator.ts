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

  // Extract payment details from x402 v2 response header (base64-encoded JSON)
  const paymentResponseHeader = response.headers.get('PAYMENT-RESPONSE') ?? ''
  let txHash = ''
  const paidUSDC = config.price

  if (paymentResponseHeader) {
    try {
      const decoded = Buffer.from(paymentResponseHeader, 'base64').toString('utf8')
      const paymentData = JSON.parse(decoded) as { transaction?: string; txHash?: string }
      txHash = paymentData.transaction ?? paymentData.txHash ?? ''
    } catch {
      // ignore
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

  // Run agents sequentially — facilitator can't settle concurrent EIP-3009
  // payments from the same wallet. Each result streams to the UI as it completes.
  const responses: AgentResponse[] = []

  for (const config of AGENT_CONFIGS) {
    try {
      const result = await callAgent(config, request, createX402Fetch(orchestratorKey))
      responses.push(result)
    } catch (err) {
      console.warn(`[orchestrator] Agent ${config.id} failed: ${err}`)
      responses.push({
        agentId: config.id,
        probability: 0.5,
        confidence: 0.05,
        reasoning: `Agent offline: ${err instanceof Error ? err.message : String(err)}`,
        rawData: null,
        paidUSDC: '0',
        txHash: '',
      })
    }
  }

  return responses
}
