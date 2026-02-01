"use client";

import { useState, useEffect } from "react";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  importance: number;
  relatedMarkets: string[];
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  category: string;
  publishedAt: string;
}

interface MarketTrend {
  ticker: string;
  title: string;
  category: string;
  yesPrice: number;
  priceChange24h: number;
  volume24h: number;
  sentiment: "bullish" | "bearish" | "neutral";
}

const categories = ["All", "Politics", "Economics", "Sports", "Entertainment", "Science", "Weather"];

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState<"calendar" | "news" | "trends">("calendar");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [trends, setTrends] = useState<MarketTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo calendar events
    const demoEvents: CalendarEvent[] = [
      { id: "1", title: "Federal Reserve Interest Rate Decision", description: "FOMC announces interest rate decision", date: "2024-02-01", category: "Economics", importance: 5, relatedMarkets: ["FED-RATE-FEB", "SP500-FEB"] },
      { id: "2", title: "Super Bowl LVIII", description: "Kansas City Chiefs vs San Francisco 49ers", date: "2024-02-11", category: "Sports", importance: 5, relatedMarkets: ["NFL-SUPERBOWL", "NFL-MVP"] },
      { id: "3", title: "Nevada Caucus", description: "2024 Presidential Primary", date: "2024-02-08", category: "Politics", importance: 4, relatedMarkets: ["POTUS-2024", "REPNOM-2024"] },
      { id: "4", title: "CPI Report", description: "January Consumer Price Index release", date: "2024-02-13", category: "Economics", importance: 5, relatedMarkets: ["CPI-JAN", "FED-RATE-MAR"] },
      { id: "5", title: "Oscars 2024", description: "96th Academy Awards", date: "2024-03-10", category: "Entertainment", importance: 3, relatedMarkets: ["OSCAR-PICTURE", "OSCAR-ACTOR"] },
      { id: "6", title: "Q4 Earnings: NVDA", description: "NVIDIA earnings report", date: "2024-02-21", category: "Economics", importance: 4, relatedMarkets: ["NVDA-BEAT-Q4"] },
    ];
    setEvents(demoEvents);

    // Demo news
    const demoNews: NewsItem[] = [
      { id: "1", title: "Fed Signals Patience on Rate Cuts", summary: "Powell indicates the central bank needs more confidence inflation is heading to 2%", source: "Bloomberg", url: "#", category: "Economics", publishedAt: new Date().toISOString() },
      { id: "2", title: "Trump Dominates NH Primary", summary: "Former President wins New Hampshire, Haley vows to continue", source: "AP News", url: "#", category: "Politics", publishedAt: new Date().toISOString() },
      { id: "3", title: "Chiefs Favored in Super Bowl", summary: "Vegas odds favor Kansas City by 2.5 points", source: "ESPN", url: "#", category: "Sports", publishedAt: new Date().toISOString() },
      { id: "4", title: "Tech Stocks Rally on AI Optimism", summary: "Semiconductor companies lead gains as AI demand surges", source: "CNBC", url: "#", category: "Economics", publishedAt: new Date().toISOString() },
    ];
    setNews(demoNews);

    // Demo trending markets
    const demoTrends: MarketTrend[] = [
      { ticker: "POTUS-2024-DEM", title: "Will Biden win 2024 election?", category: "Politics", yesPrice: 0.42, priceChange24h: -0.03, volume24h: 125000, sentiment: "bearish" },
      { ticker: "FED-RATE-MAR", title: "Fed cuts rates in March?", category: "Economics", yesPrice: 0.08, priceChange24h: -0.12, volume24h: 89000, sentiment: "bearish" },
      { ticker: "NFL-SUPERBOWL-KC", title: "Chiefs win Super Bowl?", category: "Sports", yesPrice: 0.55, priceChange24h: 0.04, volume24h: 342000, sentiment: "bullish" },
      { ticker: "NVDA-400-FEB", title: "NVIDIA above $400 end of Feb?", category: "Economics", yesPrice: 0.72, priceChange24h: 0.08, volume24h: 56000, sentiment: "bullish" },
      { ticker: "BITCOIN-50K-FEB", title: "Bitcoin above $50k end of Feb?", category: "Economics", yesPrice: 0.65, priceChange24h: 0.05, volume24h: 234000, sentiment: "bullish" },
      { ticker: "OSCAR-OPPEN", title: "Oppenheimer wins Best Picture?", category: "Entertainment", yesPrice: 0.78, priceChange24h: 0.02, volume24h: 18000, sentiment: "bullish" },
    ];
    setTrends(demoTrends);

    setLoading(false);
  }, []);

  const filteredEvents = selectedCategory === "All" 
    ? events 
    : events.filter(e => e.category === selectedCategory);

  const filteredNews = selectedCategory === "All"
    ? news
    : news.filter(n => n.category === selectedCategory);

  const filteredTrends = selectedCategory === "All"
    ? trends
    : trends.filter(t => t.category === selectedCategory);

  const getImportanceColor = (importance: number) => {
    if (importance >= 5) return "bg-red-500";
    if (importance >= 4) return "bg-orange-500";
    if (importance >= 3) return "bg-yellow-500";
    return "bg-gray-500";
  };

  const getSentimentIcon = (sentiment: string) => {
    if (sentiment === "bullish") return "📈";
    if (sentiment === "bearish") return "📉";
    return "➡️";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔬 Research Center</h1>
        <div className="flex space-x-2">
          {(["calendar", "news", "trends"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {tab === "calendar" ? "📅 Calendar" : tab === "news" ? "📰 News" : "📊 Trends"}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {activeTab === "calendar" && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium">📅 Upcoming Events</h3>
              <p className="text-sm text-gray-400">Events that could move prediction markets</p>
            </div>
            <div className="divide-y divide-gray-800">
              {filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((event) => (
                <div key={event.id} className="p-4 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <div className={`w-2 h-2 rounded-full ${getImportanceColor(event.importance)}`}></div>
                        <span className="text-xs text-gray-400">{new Date(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">{event.category}</span>
                      </div>
                      <h4 className="font-medium mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-400 mb-2">{event.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {event.relatedMarkets.map((market) => (
                          <span key={market} className="px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded text-xs">
                            {market}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">
                        {Math.ceil((new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "news" && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium">📰 Market News</h3>
              <p className="text-sm text-gray-400">News relevant to prediction markets</p>
            </div>
            <div className="divide-y divide-gray-800">
              {filteredNews.map((item) => (
                <div key={item.id} className="p-4 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">{item.category}</span>
                        <span className="text-xs text-gray-500">{item.source}</span>
                      </div>
                      <h4 className="font-medium mb-1">{item.title}</h4>
                      <p className="text-sm text-gray-400">{item.summary}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "trends" && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium">📊 Trending Markets</h3>
              <p className="text-sm text-gray-400">High volume and moving markets</p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Market</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Yes Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">24h Change</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Volume</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Sentiment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredTrends.map((market) => (
                  <tr key={market.ticker} className="hover:bg-gray-800/50 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium">{market.title}</div>
                      <div className="text-xs text-gray-500">{market.ticker}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">{market.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-lg">
                      {Math.round(market.yesPrice * 100)}¢
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${market.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {market.priceChange24h >= 0 ? "+" : ""}{Math.round(market.priceChange24h * 100)}¢
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">
                      ${(market.volume24h / 1000).toFixed(0)}k
                    </td>
                    <td className="px-4 py-3 text-center text-xl">
                      {getSentimentIcon(market.sentiment)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
