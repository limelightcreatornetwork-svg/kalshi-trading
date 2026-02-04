'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';

interface MarketRow {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle?: string;
  status: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  closeTime?: string;
  expirationTime: string;
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async (nextCursor?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', '25');
      if (status) params.set('status', status);
      if (query) params.set('tickers', query);
      if (nextCursor) params.set('cursor', nextCursor);

      const res = await apiFetch(`/api/markets?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch markets');
      }

      setMarkets(json.data.markets || []);
      setCursor(json.data.cursor || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    fetchMarkets(null);
  }, [fetchMarkets]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">📊 Markets</h1>
            <p className="text-zinc-400">Live markets feed from Kalshi</p>
          </div>
          <button
            onClick={() => fetchMarkets(null)}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 transition-colors"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">Tickers (comma-separated)</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="KXBTC, KXETH"
              className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="settled">Settled</option>
              <option value="">All</option>
            </select>
          </div>
          <button
            onClick={() => fetchMarkets(null)}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 transition-colors"
          >
            Apply Filters
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-auto border border-zinc-800 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="text-left px-4 py-3">Ticker</th>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3">Yes Bid/Ask</th>
                <th className="text-left px-4 py-3">No Bid/Ask</th>
                <th className="text-left px-4 py-3">Volume 24h</th>
                <th className="text-left px-4 py-3">Open Interest</th>
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    No markets found.
                  </td>
                </tr>
              ) : (
                markets.map((market) => (
                  <tr key={market.ticker} className="border-t border-zinc-800">
                    <td className="px-4 py-3 font-mono text-emerald-300">{market.ticker}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{market.title}</div>
                      <div className="text-xs text-zinc-500">{market.subtitle}</div>
                    </td>
                    <td className="px-4 py-3">
                      {market.yesBid}/{market.yesAsk}
                    </td>
                    <td className="px-4 py-3">
                      {market.noBid}/{market.noAsk}
                    </td>
                    <td className="px-4 py-3">{market.volume24h}</td>
                    <td className="px-4 py-3">{market.openInterest}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            {markets.length} markets loaded
          </div>
          <button
            onClick={() => fetchMarkets(cursor)}
            disabled={!cursor || loading}
            className="px-4 py-2 rounded border border-zinc-700 text-zinc-300 disabled:opacity-50"
          >
            Load More
          </button>
        </div>
      </div>
    </div>
  );
}
