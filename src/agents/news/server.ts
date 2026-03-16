import 'dotenv/config'
import express from 'express'
import { paymentMiddleware, Network, Resource } from '@x402/express'
import { createX402Fetch } from '../../x402client.js'
import { analyzeNews } from './analyze.js'
import type { AnalyzeRequest } from '../../types.js'

const PORT = 3001
const PRICE = '$0.03'

const agentPrivateKey = process.env.AGENT_NEWS_PRIVATE_KEY
if (!agentPrivateKey) {
  console.error('AGENT_NEWS_PRIVATE_KEY not set')
  process.exit(1)
}

const app = express()
app.use(express.json())

// x402 payment middleware — requires 0.03 USDC on Base Sepolia to access /analyze
app.use(
  paymentMiddleware(
    PRICE,
    {
      description: 'News & macro analysis for prediction markets',
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
  const { question, marketUrl } = req.body as AnalyzeRequest

  if (!question) {
    return res.status(400).json({ error: 'question is required' })
  }

  // Use orchestrator's key to call upstream x402 services
  const orchestratorKey = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!orchestratorKey) {
    return res.status(500).json({ error: 'ORCHESTRATOR_PRIVATE_KEY not set' })
  }

  try {
    const x402Fetch = createX402Fetch(orchestratorKey)
    const analysis = await analyzeNews(question, x402Fetch)
    return res.json(analysis)
  } catch (err) {
    console.error('[news] analyze error:', err)
    return res.status(500).json({ error: 'Internal error', details: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ agent: 'news', status: 'ok', port: PORT }))

app.listen(PORT, () => {
  console.log(`[news] Agent server listening on port ${PORT} (price: ${PRICE} USDC)`)
})
