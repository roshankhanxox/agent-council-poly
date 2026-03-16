# Prediction Market Council Agent — Implementation Plan

> **Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Context

Building a multi-agent prediction market advisor that answers "Should I bet YES on X?" by coordinating 4 specialist agents, each paid via **x402** on **Base Sepolia**. The demo showcases the full x402 machine-to-machine payment loop: orchestrator discovers agents → pays per call → receives analysis → council votes → outputs recommendation + bet size.

ERC-8004 loop is now **free and gasless** via Ultraviolet DAO's facilitator API — no custom contracts needed. Agents register via `POST /register`, orchestrator submits post-analysis feedback via `POST /feedback`, discovery works via `/discovery/resources`. This means the full ERC-8004 + x402 loop is production-ready out of the box.

**Facilitator:** `https://facilitator.ultravioletadao.xyz` (Ultraviolet DAO — 19 mainnets, 8+ testnets, has built-in ERC-8004 `/register` + `/reputation` endpoints, discovery via `/discovery/resources`, escrow via x402r. Docs at `/docs`)

**Key live x402 services on Base Sepolia being used:**
- **Gloria AI** → macro/news analysis
- **Firecrawl** → scrape Polymarket/Metaculus for live market data
- **Einstein AI** → whale tracking, sentiment signals
- **DiamondClaws** → DeFi/arbitrage risk scoring

---

## Project Structure

```
agents/
├── context.md
├── implementation_plan.md
├── .env
├── package.json
├── tsconfig.json
│
├── src/
│   ├── types.ts
│   ├── wallet.ts
│   ├── x402client.ts
│   │
│   ├── orchestrator/
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   ├── council.ts
│   │   └── feedback.ts
│   │
│   └── agents/
│       ├── news/
│       │   ├── server.ts             ← port 3001, 0.03 USDC
│       │   └── analyze.ts
│       ├── market/
│       │   ├── server.ts             ← port 3002, 0.05 USDC
│       │   └── analyze.ts
│       ├── sentiment/
│       │   ├── server.ts             ← port 3003, 0.02 USDC
│       │   └── analyze.ts
│       └── arbitrage/
│           ├── server.ts             ← port 3004, 0.001 USDC
│           └── analyze.ts
│
└── scripts/
    ├── fund-wallets.ts
    ├── register-agents.ts
    └── start-all.ts
```

---

## Phase 0 — Project Bootstrap

- [x] **0.1** Init pnpm project, install deps (`@x402/express`, `@x402/fetch`, `@x402/evm`, `viem`, `express`, `dotenv`, `tsx`, `@anthropic-ai/sdk`, `typescript`, `@types/express`, `@types/node`)
- [x] **0.2** `tsconfig.json` with `moduleResolution: bundler`, `target: ES2022`
- [x] **0.3** `.env` scaffold with all required keys
- [x] **0.4** `context.md` at project root
- [ ] **0.5** Fund all 5 wallets with Base Sepolia ETH + testnet USDC (manual step — run `pnpm fund` after filling `.env`)

**Checkpoint 0 ✓** — `pnpm tsx src/agents/news/server.ts` starts without error

---

## Phase 1 — Shared Types & Wallet

- [x] **1.1** `src/types.ts` — `AgentResponse`, `CouncilVerdict`, `AnalyzeRequest`, `AgentAnalysis`
- [x] **1.2** `src/wallet.ts` — viem `privateKeyToAccount` helper, wallet + public client on Base Sepolia
- [x] **1.3** `src/x402client.ts` — x402 fetch factory using `wrapFetchWithPaymentFromConfig` + `ExactEvmScheme` (v2 API)

**Checkpoint 1 ✓** — types compile clean, wallet connects to Base Sepolia

---

## Phase 2 — Agent Servers (x402 protected endpoints)

Each agent: `POST /analyze { question, marketUrl? }` → 402 if unpaid → 200 if paid

### Agent 1 — News (port 3001)
- [x] **2.1** `agents/news/server.ts` — Express + x402 middleware, price: **0.03 USDC**
- [x] **2.2** `agents/news/analyze.ts` — calls Gloria AI via x402Fetch, LLM summarizes → probability

### Agent 2 — Market Data (port 3002)
- [x] **2.3** `agents/market/server.ts` — price: **0.05 USDC**
- [x] **2.4** `agents/market/analyze.ts` — calls Firecrawl via x402Fetch → scrapes Polymarket for live YES price

### Agent 3 — Sentiment (port 3003)
- [x] **2.5** `agents/sentiment/server.ts` — price: **0.02 USDC**
- [x] **2.6** `agents/sentiment/analyze.ts` — calls Einstein AI via x402Fetch → whale/social signal

### Agent 4 — Arbitrage (port 3004)
- [x] **2.7** `agents/arbitrage/server.ts` — price: **0.001 USDC**
- [x] **2.8** `agents/arbitrage/analyze.ts` — calls DiamondClaws via x402Fetch → cross-market consensus + risk score

- [ ] **2.9** Fix server files to use correct x402 v2 `paymentMiddleware` API (`RoutesConfig` + `x402ResourceServer` + `ExactEvmScheme` from `@x402/evm/exact/server`)

**Checkpoint 2 ✓** — `curl localhost:3001/analyze` returns `402 Payment Required` with correct x402 headers

---

## Phase 3 — Orchestrator

- [x] **3.1** `orchestrator/orchestrator.ts` — calls all 4 agents in parallel via `Promise.allSettled`, captures payment headers, returns `AgentResponse[]`
- [x] **3.2** `orchestrator/council.ts` — weighted vote + Kelly criterion bet sizing
- [x] **3.3** `orchestrator/index.ts` — CLI entrypoint with pretty terminal output
- [x] **3.4** `orchestrator/feedback.ts` — posts ERC-8004 reputation feedback post-vote

**Checkpoint 3 ✓** — full run produces verdict, all 4 x402 payments confirmed on Base Sepolia explorer

---

## Phase 4 — Start Script & DX

- [x] **4.1** `scripts/start-all.ts` — spawns all 4 agent servers, waits for ready signals
- [x] **4.2** `package.json` scripts: `dev`, `ask`, `register`, `fund`
- [x] **4.3** Pretty terminal output with live payment events and council verdict table

**Checkpoint 4 ✓** — `pnpm dev` then `pnpm ask "..."` gives full output in one command

---

## Phase 5 — ERC-8004 Loop (via Ultraviolet DAO facilitator)

- [x] **5.1** `scripts/register-agents.ts` — `POST /register` for each agent + orchestrator, outputs agentIds for `.env`
- [x] **5.2** Discovery registration — `POST /discovery/register` for each agent service
- [x] **5.3** `orchestrator/feedback.ts` — post-vote reputation feedback via `POST /feedback`
- [ ] **5.4** Dynamic discovery on startup — `GET /discovery/resources` to find agents instead of hardcoded ports

**Checkpoint 5 ✓** — `GET https://facilitator.ultravioletadao.xyz/identity/base-sepolia/{agentId}` returns registered agent

---

## Phase 6 — Polish & Hackathon Readiness

- [ ] **6.1** Graceful fallbacks verified end-to-end (upstream service down → degraded low-confidence response)
- [ ] **6.2** Expose orchestrator as its own x402-protected HTTP endpoint
- [ ] **6.3** `README.md` — setup guide, architecture diagram, Base Sepolia explorer links
- [ ] **6.4** Demo run with real tx hashes on Base Sepolia

**Checkpoint 6 ✓** — demo ready, all payments verifiable on https://sepolia.basescan.org

---

## Open Items

- [ ] Fix agent servers to use x402 v2 `paymentMiddleware` API correctly (in progress)
- [ ] Verify Gloria AI / Einstein AI / DiamondClaws testnet endpoints are live on Base Sepolia
- [ ] Verify Firecrawl x402 endpoint rate limits for testnet
- [ ] Fill in `.env` private keys + fund wallets

---

## Verification Checklist

- [ ] All 4 agent payments show up on Base Sepolia explorer with correct USDC amounts
- [ ] `Promise.allSettled` handles one agent being offline gracefully
- [ ] Kelly fraction is capped and never recommends >25% of bankroll
- [ ] Council verdict changes meaningfully between different questions
- [ ] Total cost per query is under $0.15 USDC
- [ ] `GET https://facilitator.ultravioletadao.xyz/identity/base-sepolia/{agentId}` returns registered agent NFT
- [ ] `GET https://facilitator.ultravioletadao.xyz/reputation/base-sepolia/{agentId}` shows feedback after a run
- [ ] `GET https://facilitator.ultravioletadao.xyz/discovery/resources` lists all 4 agents + orchestrator
