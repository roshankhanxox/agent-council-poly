import 'dotenv/config'
import { HTTPFacilitatorClient } from '@x402/core/server'

export function makeFacilitator(): HTTPFacilitatorClient {
  const url = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator'
  return new HTTPFacilitatorClient({ url })
}
