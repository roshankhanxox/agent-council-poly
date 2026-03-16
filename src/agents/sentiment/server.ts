import 'dotenv/config'
import express from 'express'
import { paymentMiddleware, Network } from '@x402/express'
import { createX402Fetch } from '../../x402client.js'
import { analyzeSentiment } from './analyze.js'
import type { AnalyzeRequest } from '../../types.js'

const PORT = 3003
const PRICE = '$0.02'

const agentPrivateKey = process.env.AGENT_SENTIMENT_PRIVATE_KEY
if (!agentPrivateKey) {
  console.error('AGENT_SENTIMENT_PRIVATE_KEY not set')
  process.exit(1)
}

const app = express()
app.use(express.json())

app.use(
  paymentMiddleware(
    PRICE,
    {
      description: 'Whale tracking and social sentiment signals for prediction markets',
      mimeType: 'application/json',
      maxTimeoutSeconds: 30,
    },
    {
      network: Network.BaseSepolia,
      privateKey: agentPrivateKey as `0x${string}`,
    }
  )
)

app.post('/analyze', async (req, res) => {
  const { question } = req.body as AnalyzeRequest

  if (!question) {
    return res.status(400).json({ error: 'question is required' })
  }

  const orchestratorKey = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!orchestratorKey) {
    return res.status(500).json({ error: 'ORCHESTRATOR_PRIVATE_KEY not set' })
  }

  try {
    const x402Fetch = createX402Fetch(orchestratorKey)
    const analysis = await analyzeSentiment(question, x402Fetch)
    return res.json(analysis)
  } catch (err) {
    console.error('[sentiment] analyze error:', err)
    return res.status(500).json({ error: 'Internal error', details: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ agent: 'sentiment', status: 'ok', port: PORT }))

app.listen(PORT, () => {
  console.log(`[sentiment] Agent server listening on port ${PORT} (price: ${PRICE} USDC)`)
})
