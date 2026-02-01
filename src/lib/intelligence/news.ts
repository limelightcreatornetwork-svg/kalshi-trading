/**
 * News Intelligence Client
 * Fetches breaking news and trends from multiple sources
 */

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: Date;
  category?: string;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export class NewsClient {
  private braveApiKey: string;

  constructor() {
    this.braveApiKey = process.env.BRAVE_API_KEY || "";
  }

  /**
   * Search news using Brave Search API
   */
  async searchNews(query: string, count = 10): Promise<NewsArticle[]> {
    if (!this.braveApiKey) {
      console.warn("BRAVE_API_KEY not configured");
      return [];
    }

    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&count=${count}`,
        {
          headers: {
            "X-Subscription-Token": this.braveApiKey,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Brave API error: ${response.status}`);
      }

      const data = await response.json();
      return (data.results || []).map((result: any, index: number) => ({
        id: `brave-${Date.now()}-${index}`,
        title: result.title,
        description: result.description || "",
        url: result.url,
        source: result.meta_url?.hostname || "unknown",
        publishedAt: result.age ? this.parseAge(result.age) : new Date(),
        category: this.inferCategory(query),
      }));
    } catch (error) {
      console.error("Error fetching news:", error);
      return [];
    }
  }

  /**
   * Get breaking news across categories
   */
  async getBreakingNews(): Promise<NewsArticle[]> {
    const queries = [
      "breaking news today",
      "politics news",
      "crypto bitcoin news",
      "sports news",
      "technology news",
    ];

    const allArticles: NewsArticle[] = [];

    for (const query of queries) {
      const articles = await this.searchNews(query, 5);
      allArticles.push(...articles);
      await new Promise((r) => setTimeout(r, 500)); // Rate limiting
    }

    // Dedupe by URL
    const seen = new Set<string>();
    return allArticles.filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    });
  }

  /**
   * Search for news related to a specific market/topic
   */
  async getMarketNews(topic: string): Promise<NewsArticle[]> {
    return this.searchNews(`${topic} latest news`, 10);
  }

  private parseAge(age: string): Date {
    const now = new Date();
    const match = age.match(/(\d+)\s*(hour|minute|day|week)/i);
    if (!match) return now;

    const [, num, unit] = match;
    const amount = parseInt(num);

    switch (unit.toLowerCase()) {
      case "minute":
        return new Date(now.getTime() - amount * 60 * 1000);
      case "hour":
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case "day":
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      case "week":
        return new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  private inferCategory(query: string): string {
    const q = query.toLowerCase();
    if (q.includes("politic")) return "politics";
    if (q.includes("crypto") || q.includes("bitcoin")) return "crypto";
    if (q.includes("sport")) return "sports";
    if (q.includes("tech")) return "tech";
    return "general";
  }
}

export const newsClient = new NewsClient();
