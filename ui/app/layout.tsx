import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prediction Market Council',
  description: 'Multi-agent AI council for prediction market advice, powered by x402 on Base Sepolia',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body className={`${GeistMono.className} antialiased`}>{children}</body>
    </html>
  )
}
