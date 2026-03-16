import 'dotenv/config'
import express from 'express'
import { paymentMiddlewareFromConfig } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { getAccount } from '../../wallet.js'
import { createX402Fetch } from '../../x402client.js'
import { analyzeArbitrage } from './analyze.js'
import type { AnalyzeRequest } from '../../types.js'

const PORT = 3004

const agentPrivateKey = process.env.AGENT_ARBITRAGE_PRIVATE_KEY
if (!agentPrivateKey) { console.error('AGENT_ARBITRAGE_PRIVATE_KEY not set'); process.exit(1) }

const agentAddress = getAccount(agentPrivateKey).address

const app = express()
app.use(express.json())

app.use(
  paymentMiddlewareFromConfig(
    {
      'POST /analyze': {
        accepts: {
          scheme: 'exact',
          price: '$0.001',
          network: 'eip155:84532',
          payTo: agentAddress,
        },
        description: 'DeFi/arbitrage risk scoring and cross-market price consensus',
      },
    },
    undefined,
    [{ network: 'eip155:84532', server: new ExactEvmScheme() }],
  )
)

app.post('/analyze', async (req, res) => {
  const { question } = req.body as AnalyzeRequest
  if (!question) return res.status(400).json({ error: 'question is required' })

  const orchKey = process.env.ORCHESTRATOR_PRIVATE_KEY
  if (!orchKey) return res.status(500).json({ error: 'ORCHESTRATOR_PRIVATE_KEY not set' })

  try {
    const analysis = await analyzeArbitrage(question, createX402Fetch(orchKey))
    return res.json(analysis)
  } catch (err) {
    console.error('[arbitrage] error:', err)
    return res.status(500).json({ error: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ agent: 'arbitrage', status: 'ok', port: PORT, payTo: agentAddress }))

app.listen(PORT, () => {
  console.log(`[arbitrage] listening on port ${PORT} · payTo ${agentAddress} · price $0.001 USDC`)
})
