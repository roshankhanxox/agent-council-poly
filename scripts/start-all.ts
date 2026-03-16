#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'

const __dirname = new URL('.', import.meta.url).pathname

const AGENTS = [
  { name: 'news',      file: 'src/agents/news/server.ts',      port: 3001 },
  { name: 'market',    file: 'src/agents/market/server.ts',    port: 3002 },
  { name: 'sentiment', file: 'src/agents/sentiment/server.ts', port: 3003 },
  { name: 'arbitrage', file: 'src/agents/arbitrage/server.ts', port: 3004 },
]

const procs: ChildProcess[] = []

function spawnAgent(agent: typeof AGENTS[number]): Promise<void> {
  return new Promise((resolveReady) => {
    const filePath = resolve(__dirname, '..', agent.file)
    const proc = spawn('npx', ['tsx', filePath], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    procs.push(proc)

    const prefix = `[${agent.name.padEnd(10)}]`

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) {
        console.log(`${prefix} ${line}`)
        if (line.includes(`port ${agent.port}`)) {
          resolveReady()
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.error(`${prefix} [err] ${line}`)
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        console.error(`${prefix} exited with code ${code}`)
      }
    })

    // Resolve after 5s even if ready signal not seen
    setTimeout(resolveReady, 5000)
  })
}

async function main() {
  console.log('Starting all 4 agent servers...\n')

  await Promise.all(AGENTS.map(spawnAgent))

  console.log('\nAll agents ready. Use `pnpm ask "<question>"` in another terminal.\n')

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\nShutting down agents...')
    procs.forEach(p => p.kill())
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Failed to start agents:', err)
  process.exit(1)
})
