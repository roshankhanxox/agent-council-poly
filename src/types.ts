export type AgentId = 'news' | 'market' | 'sentiment' | 'arbitrage'

export interface AgentResponse {
  agentId: AgentId
  probability: number   // 0-1, agent's YES probability estimate
  confidence: number    // 0-1, how confident the agent is
  reasoning: string     // 1-2 sentence summary
  rawData: unknown      // raw upstream response
  paidUSDC: string      // amount paid in this x402 call
  txHash: string        // payment tx hash
}

export interface CouncilVerdict {
  weightedProbability: number
  recommendation: 'YES' | 'NO' | 'SKIP'
  kellyFraction: number      // suggested bet as fraction of bankroll
  suggestedBetUSDC: number   // given a $100 bankroll default
  breakdown: AgentResponse[]
  totalSpentUSDC: string
}

export interface AnalyzeRequest {
  question: string
  marketUrl?: string
}

export interface AgentAnalysis {
  probability: number
  confidence: number
  reasoning: string
  rawData?: unknown
}
