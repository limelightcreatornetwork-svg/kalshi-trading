import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kalshi Trading Platform",
  description: "Trading tools for Kalshi prediction markets",
};

function Navigation() {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-white text-lg hover:text-green-400 transition-colors">
            📈 Kalshi Trading
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/arbitrage"
              className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
            >
              🎯 Arbitrage Scanner
            </Link>
            <Link
              href="/api/markets"
              className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
            >
              📊 Markets API
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-white`}
      >
        <Navigation />
        {children}
      </body>
    </html>
  );
}
