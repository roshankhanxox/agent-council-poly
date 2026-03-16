import 'dotenv/config'
import express from 'express'
import { paymentMiddlewareFromConfig } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { getAccount } from '../../wallet.js'
import { makeFacilitator } from '../../facilitator.js'
import { createX402Fetch } from '../../x402client.js'
import { analyzeNews } from './analyze.js'
import type { AnalyzeRequest } from '../../types.js'

const PORT = 3001

const agentPrivateKey = process.env.AGENT_NEWS_PRIVATE_KEY
if (!agentPrivateKey) { console.error('AGENT_NEWS_PRIVATE_KEY not set'); process.exit(1) }

const agentAddress = getAccount(agentPrivateKey).address

const app = express()
app.use(express.json())

app.use(
  paymentMiddlewareFromConfig(
    {
      'POST /analyze': {
        accepts: {
          scheme: 'exact',
          price: '$0.03',
          network: 'eip155:84532',
          payTo: agentAddress,
        },
        description: 'News & macro analysis for prediction markets',
      },
    },
    makeFacilitator(),
    [{ network: 'eip155:84532', server: new ExactEvmScheme() }],
  )
)

app.post('/analyze', async (req, res) => {
  const { question } = req.body as AnalyzeRequest
  if (!question) return res.status(400).json({ error: 'question is required' })

  const orchKey = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!orchKey) return res.status(500).json({ error: 'ORCHESTRATOR_PRIVATE_KEY not set' })

  try {
    const analysis = await analyzeNews(question, createX402Fetch(orchKey))
    return res.json(analysis)
  } catch (err) {
    console.error('[news] error:', err)
    return res.status(500).json({ error: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ agent: 'news', status: 'ok', port: PORT, payTo: agentAddress }))

app.listen(PORT, () => {
  console.log(`[news] listening on port ${PORT} · payTo ${agentAddress} · price $0.03 USDC`)
})
