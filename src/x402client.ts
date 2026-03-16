import 'dotenv/config'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm'
import { getAccount } from './wallet.js'

// Base Sepolia chain ID in EIP-155 format
const BASE_SEPOLIA_NETWORK = 'eip155:84532'

/**
 * Returns a fetch function pre-configured with x402 auto-payment using the
 * provided private key. Any 402 response will be automatically paid and
 * retried, with payment details returned in response headers.
 */
export function createX402Fetch(privateKey: string): typeof fetch {
  const account = getAccount(privateKey)
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: BASE_SEPOLIA_NETWORK,
        client: new ExactEvmScheme(account),
      },
    ],
  })
}
