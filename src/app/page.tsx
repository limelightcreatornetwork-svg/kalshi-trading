import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-900 to-black text-white">
      <Card className="w-[500px] bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">📈 Kalshi Trading</CardTitle>
          <CardDescription className="text-gray-400">
            US-regulated prediction market platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-3 text-sm text-emerald-300">
            ✓ CFTC-regulated • No crypto required • Trade with USD
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-gray-700 rounded">
              <p className="text-gray-400">Mode</p>
              <p className="font-semibold text-yellow-500">Demo</p>
            </div>
            <div className="p-3 bg-gray-700 rounded">
              <p className="text-gray-400">Account</p>
              <p className="font-semibold text-red-500">Not Connected</p>
            </div>
          </div>
          <Link href="/explorer">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg">
              Explore Markets →
            </Button>
          </Link>
          <p className="text-xs text-center text-gray-500">
            Connect your Kalshi account to enable trading
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
