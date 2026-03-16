import 'dotenv/config'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm'
import { getAccount } from './wallet.js'

// Base Sepolia CAIP-2 network ID
const BASE_SEPOLIA = 'eip155:84532'

/**
 * Returns a fetch function pre-configured with x402 auto-payment.
 * Any 402 response is automatically paid and retried.
 */
export function createX402Fetch(privateKey: string): typeof fetch {
  const account = getAccount(privateKey)
  const signer = toClientEvmSigner(account)
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      { network: BASE_SEPOLIA, client: new ExactEvmScheme(signer) },
    ],
  })
}
