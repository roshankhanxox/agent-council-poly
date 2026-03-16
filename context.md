# Prediction Market Council Agent

## Overview

A multi-agent prediction market advisor that answers "Should I bet YES on X?" by coordinating 4 specialist agents, each paid via **x402** on **Base Sepolia**.

The demo showcases the full x402 machine-to-machine payment loop:
1. Orchestrator discovers agents
2. Pays per call (USDC on Base Sepolia)
3. Receives analysis from each specialist
4. Council votes using weighted probability
5. Outputs recommendation + Kelly-criterion bet size

## Architecture

```
User → Orchestrator → [News Agent (port 3001)]
                    → [Market Agent (port 3002)]
                    → [Sentiment Agent (port 3003)]
                    → [Arbitrage Agent (port 3004)]
       ← Council Verdict (weighted vote + Kelly)
```

## Specialist Agents

| Agent | Port | Cost | Upstream | Signal |
|-------|------|------|----------|--------|
| News | 3001 | 0.03 USDC | Gloria AI | Macro/news analysis |
| Market | 3002 | 0.05 USDC | Firecrawl | Live Polymarket data |
| Sentiment | 3003 | 0.02 USDC | Einstein AI | Whale/sentiment signals |
| Arbitrage | 3004 | 0.001 USDC | DiamondClaws | DeFi risk + cross-market arb |

## ERC-8004 / x402 Stack

- **Facilitator:** `https://facilitator.ultravioletadao.xyz`
- **Network:** Base Sepolia
- **Payment asset:** USDC (testnet)
- Agents register via `POST /register` — gasless ERC-721 mint
- Discovery via `GET /discovery/resources`
- Reputation feedback via `POST /feedback`

## Voting Logic

```
weightedProbability = Σ(p_i × c_i) / Σ(c_i)

Kelly fraction:
  b = (1 / marketPrice) - 1
  f = (b × P - (1 - P)) / b
  f = clamp(f, 0, 0.25)          ← never risk more than 25% of bankroll

Recommendation:
  P > 0.55  → YES
  P < 0.45  → NO
  else      → SKIP
```

## Usage

```bash
# Install deps
pnpm install

# Fill in .env private keys
cp .env .env.local

# Start all 4 agent servers
pnpm dev

# Ask the council
pnpm ask "Will ETH hit $4k before July 2025?"

# Register agents on ERC-8004 registry (one-time)
pnpm register
```
