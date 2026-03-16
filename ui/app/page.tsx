'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type Status = 'idle' | 'loading' | 'done' | 'error'

interface AgentResult {
  agentId: string
  probability: number
  confidence: number
  reasoning: string
  paidUSDC: string
  txHash: string
  error?: string
}

interface Verdict {
  weightedProbability: number
  recommendation: 'YES' | 'NO' | 'SKIP'
  kellyFraction: number
  suggestedBetUSDC: number
  totalSpentUSDC: string
  breakdown: AgentResult[]
}

const AGENT_META: Record<string, { label: string; color: string; glow: string; border: string; bg: string }> = {
  news:      { label: 'NEWS',      color: '#22d3ee', glow: 'shadow-[0_0_12px_#22d3ee40]', border: 'border-cyan-400/50',    bg: 'bg-cyan-400/5' },
  market:    { label: 'MARKET',    color: '#4ade80', glow: 'shadow-[0_0_12px_#4ade8040]', border: 'border-green-400/50',   bg: 'bg-green-400/5' },
  sentiment: { label: 'SENTIMENT', color: '#facc15', glow: 'shadow-[0_0_12px_#facc1540]', border: 'border-yellow-400/50',  bg: 'bg-yellow-400/5' },
  arbitrage: { label: 'ARBITRAGE', color: '#e879f9', glow: 'shadow-[0_0_12px_#e879f940]', border: 'border-fuchsia-400/50', bg: 'bg-fuchsia-400/5' },
}

const AGENT_ORDER = ['news', 'market', 'sentiment', 'arbitrage']

function ProbArc({ value, color }: { value: number; color: string }) {
  const r = 36
  const circumference = Math.PI * r
  const offset = circumference * (1 - value)
  return (
    <svg width="88" height="52" viewBox="0 0 88 52" className="overflow-visible">
      <path d="M 8 44 A 36 36 0 0 1 80 44" fill="none" stroke="#1a1a1f" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M 8 44 A 36 36 0 0 1 80 44"
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
      />
    </svg>
  )
}

function AgentCard({ agentId, result }: { agentId: string; result: AgentResult | undefined }) {
  const meta = AGENT_META[agentId] ?? AGENT_META.news
  const loaded = !!result
  const pct = loaded ? Math.round(result.probability * 100) : 0
  const conf = loaded ? Math.round(result.confidence * 100) : 0
  const txShort = result?.txHash ? `${result.txHash.slice(0, 8)}…${result.txHash.slice(-4)}` : null

  return (
    <div
      className={`relative rounded-sm border bg-[#0d0d10] p-4 flex flex-col gap-3 transition-all duration-500 ${
        loaded
          ? `opacity-100 translate-y-0 ${meta.glow} ${meta.border} ${meta.bg}`
          : 'opacity-40 translate-y-2 border-white/5'
      }`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 rounded-sm border"
          style={{ color: meta.color, borderColor: `${meta.color}50`, backgroundColor: `${meta.color}10` }}
        >
          {meta.label}
        </span>
        {loaded ? (
          result.error ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5" />
              <path d="M5 5l6 6M11 5l-6 6" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#4ade80" strokeWidth="1.5" />
              <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        ) : (
          <span className="flex gap-1 items-center text-[10px] text-white/30">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: meta.color, opacity: 0.6 }} />
            querying
          </span>
        )}
      </div>

      {/* Probability arc + number */}
      <div className="flex flex-col items-center gap-1 my-1">
        <div className="relative">
          <ProbArc value={loaded ? result.probability : 0} color={meta.color} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center leading-none">
            <span
              className="text-2xl font-bold tabular-nums"
              style={{ color: meta.color, textShadow: `0 0 16px ${meta.color}60` }}
            >
              {loaded ? `${pct}%` : '—'}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-white/40 tracking-wider">P(YES)</span>
      </div>

      {/* Confidence bar */}
      {loaded && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30 tracking-widest">CONF</span>
          <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${conf}%`, backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}60` }}
            />
          </div>
          <span className="text-[10px] tabular-nums" style={{ color: meta.color }}>{conf}%</span>
        </div>
      )}

      {/* Reasoning */}
      <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3 min-h-[3em]">
        {loaded
          ? result.reasoning
          : <span className="animate-pulse text-white/20">awaiting response…</span>
        }
      </p>

      {/* Payment footer */}
      {loaded && (
        <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] text-white/25 tabular-nums">
            Paid <span className="text-white/40">{result.paidUSDC} USDC</span>
          </span>
          {txShort && (
            result.txHash
              ? <a
                  href={`https://sepolia.basescan.org/tx/${result.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-white/25 hover:text-white/60 transition-colors font-mono"
                >
                  tx {txShort} ↗
                </a>
              : <span className="text-[10px] text-white/20 font-mono">no tx</span>
          )}
        </div>
      )}
    </div>
  )
}

function VerdictCard({ verdict, visible }: { verdict: Verdict; visible: boolean }) {
  const rec = verdict.recommendation
  const recColor = rec === 'YES' ? '#4ade80' : rec === 'NO' ? '#f87171' : '#fbbf24'
  const recGlow  = rec === 'YES' ? '0 0 40px #4ade8060' : rec === 'NO' ? '0 0 40px #f8717160' : '0 0 40px #fbbf2460'
  const pct = Math.round(verdict.weightedProbability * 100)

  return (
    <div
      className={`rounded-sm border border-white/10 bg-[#0d0d10] overflow-hidden transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'
      }`}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <p className="text-[10px] text-white/30 tracking-[0.25em] mb-3">COUNCIL VERDICT</p>
        <div className="flex items-end gap-6 flex-wrap">
          <span
            className="text-7xl font-black tracking-tighter leading-none"
            style={{ color: recColor, textShadow: recGlow }}
          >
            {rec}
          </span>
          <div className="flex flex-col gap-1 pb-1">
            <span className="text-sm text-white/40">weighted probability</span>
            <div className="flex items-center gap-3">
              <div className="w-48 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 delay-300"
                  style={{
                    width: visible ? `${pct}%` : '0%',
                    backgroundColor: recColor,
                    boxShadow: `0 0 8px ${recColor}80`,
                  }}
                />
              </div>
              <span className="text-lg font-bold tabular-nums" style={{ color: recColor }}>{pct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats pills */}
      <div className="px-6 py-4 flex gap-4 flex-wrap border-b border-white/5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-white/[0.03] border border-white/5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] text-white/50">Suggested bet</span>
          <span className="text-[11px] text-white font-bold">${verdict.suggestedBetUSDC}</span>
          <span className="text-[10px] text-white/30">({(verdict.kellyFraction * 100).toFixed(1)}% of $100)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-white/[0.03] border border-white/5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#22d3ee" strokeWidth="1.5" />
            <path d="M6 3.5V6l1.5 1.5" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] text-white/50">Analysis cost</span>
          <span className="text-[11px] text-white font-bold">${verdict.totalSpentUSDC} USDC</span>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="px-6 py-4">
        <p className="text-[10px] text-white/20 tracking-[0.2em] mb-3">AGENT BREAKDOWN</p>
        <div className="w-full text-[11px] overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="text-[10px] text-white/25 tracking-widest border-b border-white/5">
                <th className="text-left pb-2 font-normal w-24">AGENT</th>
                <th className="text-left pb-2 font-normal w-16">P(YES)</th>
                <th className="text-left pb-2 font-normal w-14">CONF</th>
                <th className="text-left pb-2 font-normal">REASONING</th>
                <th className="text-right pb-2 font-normal w-20">TX</th>
              </tr>
            </thead>
            <tbody>
              {verdict.breakdown.map((a) => {
                const m = AGENT_META[a.agentId]
                return (
                  <tr key={a.agentId} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <span className="font-bold text-[10px] tracking-wider" style={{ color: m?.color }}>
                        {m?.label ?? a.agentId}
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-white/70">{Math.round(a.probability * 100)}%</td>
                    <td className="py-2 pr-3 tabular-nums text-white/50">{Math.round(a.confidence * 100)}%</td>
                    <td className="py-2 pr-4 text-white/40 leading-relaxed max-w-xs">
                      <span className="line-clamp-2">{a.reasoning}</span>
                    </td>
                    <td className="py-2 text-right">
                      {a.txHash
                        ? <a
                            href={`https://sepolia.basescan.org/tx/${a.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/25 hover:text-white/70 transition-colors"
                          >
                            {a.txHash.slice(0, 6)}… ↗
                          </a>
                        : <span className="text-white/15">—</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [question, setQuestion]   = useState('')
  const [marketUrl, setMarketUrl] = useState('')
  const [status, setStatus]       = useState<Status>('idle')
  const [agents, setAgents]       = useState<AgentResult[]>([])
  const [verdict, setVerdict]     = useState<Verdict | null>(null)
  const [error, setError]         = useState('')
  const abortRef   = useRef<AbortController | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const submit = useCallback(async () => {
    if (!question.trim() || status === 'loading') return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setStatus('loading')
    setAgents([])
    setVerdict(null)
    setError('')

    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), marketUrl: marketUrl.trim() || undefined }),
        signal: ctrl.signal,
      })

      if (!res.ok) throw new Error(`Server error ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.trim().split('\n')
          let eventType = ''
          let dataStr   = ''
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim()
            if (line.startsWith('data:'))  dataStr   = line.slice(5).trim()
          }
          if (!dataStr) continue
          try {
            const payload = JSON.parse(dataStr)
            if (eventType === 'agent') {
              setAgents(prev => [...prev.filter(a => a.agentId !== payload.agentId), payload])
            } else if (eventType === 'verdict') {
              setVerdict(payload as Verdict)
            } else if (eventType === 'done') {
              setStatus('done')
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message ?? 'Something went wrong')
      setStatus('error')
    }
  }, [question, marketUrl, status])

  // ⌘+Enter / Ctrl+Enter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [submit])

  const agentMap   = Object.fromEntries(agents.map(a => [a.agentId, a]))
  const showGrid   = status !== 'idle'
  const showVerdict = !!verdict && (status === 'done' || status === 'loading')

  return (
    <>
      {/* CRT scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 4px)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-40 h-11 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#0d0d0f]/90 backdrop-blur-sm">
        <span className="text-[11px] font-bold tracking-[0.2em] text-white/80">PREDICTION MARKET COUNCIL</span>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" style={{ boxShadow: '0 0 6px #4ade80' }} />
          </span>
          <span className="text-[11px] text-green-400 tracking-widest">LIVE</span>
        </div>
        <span className="text-[10px] text-white/20 tracking-wider hidden sm:block">powered by x402 · Base Sepolia</span>
      </header>

      {/* Main */}
      <main className="min-h-screen bg-[#0d0d0f] pt-11">
        {/* Subtle dot grid */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-4xl mx-auto px-4 py-16">

          {/* Hero heading */}
          <div className="text-center mb-10">
            <p className="text-[10px] tracking-[0.4em] text-white/15 mb-3">MULTI-AGENT INTELLIGENCE SYSTEM</p>
            <h1
              className="text-5xl font-black tracking-tight text-white/90 mb-3"
              style={{ textShadow: '0 0 80px rgba(74,222,128,0.12)' }}
            >
              Ask the Council
            </h1>
            <p className="text-[13px] text-white/30 tracking-wide">
              4 specialist agents · x402 micropayments · Kelly criterion bet sizing
            </p>
          </div>

          {/* Input card */}
          <section className="mb-12">
            <div
              className="border border-white/[0.07] rounded-sm bg-[#0d0d10] p-6"
              style={{ boxShadow: '0 0 60px rgba(74,222,128,0.04), inset 0 1px 0 rgba(255,255,255,0.04)' }}
            >
              <label className="block text-[10px] tracking-[0.25em] text-white/30 mb-3">ASK THE COUNCIL</label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Will ETH hit $4k before July 2025?"
                rows={3}
                className="w-full bg-transparent text-white/90 placeholder-white/15 text-[15px] resize-none outline-none leading-relaxed border-b border-white/[0.06] pb-3 mb-4"
                style={{ caretColor: '#4ade80' }}
              />
              <div className="flex gap-3 items-center flex-wrap">
                <input
                  value={marketUrl}
                  onChange={e => setMarketUrl(e.target.value)}
                  placeholder="Polymarket URL (optional)"
                  className="flex-1 min-w-[200px] bg-transparent text-white/60 placeholder-white/15 text-[12px] outline-none border border-white/[0.06] rounded-sm px-3 py-2"
                  style={{ caretColor: '#4ade80' }}
                />
                <button
                  onClick={submit}
                  disabled={!question.trim() || status === 'loading'}
                  className="px-5 py-2 text-[12px] tracking-[0.15em] font-bold rounded-sm border transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: '#4ade8070', color: '#4ade80', backgroundColor: 'transparent' }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.backgroundColor = '#4ade80'
                    el.style.color = '#0d0d0f'
                    el.style.boxShadow = '0 0 20px #4ade8050'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.backgroundColor = 'transparent'
                    el.style.color = '#4ade80'
                    el.style.boxShadow = 'none'
                  }}
                >
                  {status === 'loading' ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 24" />
                      </svg>
                      QUERYING…
                    </span>
                  ) : 'CONSULT THE COUNCIL →'}
                </button>
              </div>
              <p className="mt-3 text-[10px] text-white/15 tracking-wider">⌘↵ to submit</p>
            </div>
          </section>

          {/* Scroll anchor */}
          <div ref={resultsRef} />

          {/* Agent grid */}
          <section
            className={`mb-8 transition-all duration-500 ${showGrid ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 overflow-hidden'}`}
          >
            <p className="text-[10px] tracking-[0.25em] text-white/20 mb-4">SPECIALIST AGENTS</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {AGENT_ORDER.map(id => (
                <AgentCard key={id} agentId={id} result={agentMap[id]} />
              ))}
            </div>
          </section>

          {/* Verdict */}
          {verdict && <VerdictCard verdict={verdict} visible={showVerdict} />}

          {/* Error */}
          {status === 'error' && (
            <div className="border border-red-500/20 bg-red-500/5 rounded-sm px-4 py-3 text-[12px] text-red-400/70">
              <span className="font-bold text-red-400">ERROR</span> — {error || 'Failed to contact agents. Are they running?'}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
