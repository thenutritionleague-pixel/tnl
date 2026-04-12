import type { Metadata } from 'next'
import { Instrument_Serif, Instrument_Sans } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const instrumentSerif = Instrument_Serif({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
})

const instrumentSans = Instrument_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Yi Nutrition League | Admin',
  description: 'Yi Nutrition League Admin Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${instrumentSerif.variable} ${instrumentSans.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
        <Toaster richColors />
      </body>
    </html>
  )
}
