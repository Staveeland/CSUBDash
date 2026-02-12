import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CSUB Sales Intelligence Platform',
  description: 'Subsea contract awards and market intelligence dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" className="dark">
      <body className={`${inter.className} antialiased bg-slate-950 text-slate-200`}>
        {children}
      </body>
    </html>
  )
}
