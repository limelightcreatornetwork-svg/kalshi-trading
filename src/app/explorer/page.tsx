"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

// Demo markets data (Kalshi-style)
const demoMarkets = [
  {
    ticker: "FED-26MAR-T5.00",
    title: "Fed rate above 5.00% on March 26",
    category: "Economics",
    yesPrice: 0.35,
    volume: 12500,
    expirationTime: "2026-03-26",
  },
  {
    ticker: "RAIN-NYC-26FEB01",
    title: "Rain in NYC on Feb 1, 2026",
    category: "Weather",
    yesPrice: 0.72,
    volume: 8200,
    expirationTime: "2026-02-01",
  },
  {
    ticker: "BTC-100K-26Q1",
    title: "Bitcoin above $100K end of Q1 2026",
    category: "Crypto",
    yesPrice: 0.48,
    volume: 45000,
    expirationTime: "2026-03-31",
  },
];

export default function ExplorerPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">← Back</Button>
          </Link>
          <h1 className="text-3xl font-bold">Kalshi Market Explorer</h1>
        </div>
        <Badge variant="outline" className="text-yellow-500 border-yellow-500">
          DEMO MODE
        </Badge>
      </div>

      {/* Info Banner */}
      <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4">
        <p className="text-emerald-300 text-sm">
          <strong>About Kalshi:</strong> The first CFTC-regulated exchange for trading on event outcomes. 
          Trade with USD — no crypto, no wallet needed. Markets settle based on real-world events.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Input placeholder="Search markets by ticker or title..." className="flex-1" />
            <Button>Search</Button>
          </div>
          <div className="flex gap-2 mt-3">
            {["All", "Economics", "Weather", "Politics", "Finance", "Sports"].map((cat) => (
              <Badge key={cat} variant="outline" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">
                {cat}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Account Balance</CardDescription>
            <CardTitle className="text-2xl">$0.00</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Positions</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total P&L</CardDescription>
            <CardTitle className="text-2xl">$0.00</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win Rate</CardDescription>
            <CardTitle className="text-2xl">--%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Active Markets */}
      <Card>
        <CardHeader>
          <CardTitle>Active Markets</CardTitle>
          <CardDescription>High-volume prediction markets on Kalshi</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Yes ¢</TableHead>
                <TableHead>No ¢</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demoMarkets.map((market) => (
                <TableRow key={market.ticker}>
                  <TableCell className="font-mono text-sm">{market.ticker}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{market.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{market.category}</Badge>
                  </TableCell>
                  <TableCell className="text-emerald-500 font-semibold">
                    {Math.round(market.yesPrice * 100)}¢
                  </TableCell>
                  <TableCell className="text-red-500 font-semibold">
                    {Math.round((1 - market.yesPrice) * 100)}¢
                  </TableCell>
                  <TableCell>{market.volume.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-gray-500">{market.expirationTime}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-600 hover:bg-emerald-50">
                        Buy Yes
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-600 hover:bg-red-50">
                        Buy No
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Connect your Kalshi API credentials to load live market data
          </p>
        </CardContent>
      </Card>

      {/* My Positions */}
      <Card>
        <CardHeader>
          <CardTitle>My Positions</CardTitle>
          <CardDescription>Your current holdings across all markets</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Contracts</TableHead>
                <TableHead>Avg Price</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No open positions — connect your Kalshi account to start trading
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* API Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle>🔑 Connect Your Kalshi Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>Create a Kalshi account at <a href="https://kalshi.com" className="text-emerald-500 underline" target="_blank">kalshi.com</a></li>
            <li>Go to Settings → API Keys and generate a new API key</li>
            <li>Add your credentials to <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">.env.local</code></li>
          </ol>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
            <div className="text-gray-500"># .env.local</div>
            <div>KALSHI_API_KEY_ID=your_key_id</div>
            <div>KALSHI_API_PRIVATE_KEY=your_private_key</div>
            <div>KALSHI_ENV=demo  # or production</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
