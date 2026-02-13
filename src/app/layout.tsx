import type { Metadata } from 'next'
import { IBM_Plex_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'CSUB Sales Intelligence Platform',
  description: 'Subsea contract awards and market intelligence dashboard',
}

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" className={`${sourceSans.variable} ${sourceSerif.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased bg-[var(--bg-dark)] text-gray-100 selection:bg-[#4db89e] selection:text-[#0e2620]">
        {children}
      </body>
    </html>
  )
}
