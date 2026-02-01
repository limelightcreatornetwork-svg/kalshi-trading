/**
 * Trend Aggregator
 * Combines signals from Reddit, News, and other sources
 */

import { redditClient, RedditPost } from "./reddit";
import { newsClient, NewsArticle } from "./news";

export interface TrendSignal {
  id: string;
  topic: string;
  category: string;
  score: number; // Combined engagement score
  sources: {
    reddit: RedditPost[];
    news: NewsArticle[];
  };
  keywords: string[];
  sentiment?: "positive" | "negative" | "neutral";
  updatedAt: Date;
}

export interface TrendQuery {
  categories?: string[];
  keywords?: string[];
  minScore?: number;
  limit?: number;
}

export class TrendAggregator {
  /**
   * Get current trending topics across all sources
   */
  async getTrends(query: TrendQuery = {}): Promise<TrendSignal[]> {
    const { categories, limit = 20 } = query;

    // Fetch from all sources in parallel
    const [redditPosts, newsArticles] = await Promise.all([
      redditClient.getTrendingTopics(categories),
      newsClient.getBreakingNews(),
    ]);

    // Extract and score topics
    const topicMap = new Map<string, TrendSignal>();

    // Process Reddit posts
    for (const post of redditPosts) {
      const keywords = this.extractKeywords(post.title);
      for (const keyword of keywords) {
        const existing = topicMap.get(keyword);
        if (existing) {
          existing.sources.reddit.push(post);
          existing.score += post.score / 1000 + post.numComments / 100;
        } else {
          topicMap.set(keyword, {
            id: `trend-${keyword}-${Date.now()}`,
            topic: keyword,
            category: this.inferCategory(keyword, post),
            score: post.score / 1000 + post.numComments / 100,
            sources: { reddit: [post], news: [] },
            keywords: [keyword],
            updatedAt: new Date(),
          });
        }
      }
    }

    // Process news articles
    for (const article of newsArticles) {
      const keywords = this.extractKeywords(article.title);
      for (const keyword of keywords) {
        const existing = topicMap.get(keyword);
        if (existing) {
          existing.sources.news.push(article);
          existing.score += 5; // News articles get flat score boost
        } else {
          topicMap.set(keyword, {
            id: `trend-${keyword}-${Date.now()}`,
            topic: keyword,
            category: article.category || "general",
            score: 5,
            sources: { reddit: [], news: [article] },
            keywords: [keyword],
            updatedAt: new Date(),
          });
        }
      }
    }

    // Sort by score and return top trends
    const trends = Array.from(topicMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return trends;
  }

  /**
   * Search for trends related to a specific query
   */
  async searchTrends(searchQuery: string): Promise<TrendSignal[]> {
    const [redditPosts, newsArticles] = await Promise.all([
      redditClient.searchPosts(searchQuery),
      newsClient.searchNews(searchQuery),
    ]);

    return [
      {
        id: `search-${searchQuery}-${Date.now()}`,
        topic: searchQuery,
        category: "search",
        score: redditPosts.length * 2 + newsArticles.length * 5,
        sources: { reddit: redditPosts, news: newsArticles },
        keywords: [searchQuery],
        updatedAt: new Date(),
      },
    ];
  }

  /**
   * Get trends for a specific Polymarket category
   */
  async getMarketTrends(marketCategory: string): Promise<TrendSignal[]> {
    const categoryMap: Record<string, string[]> = {
      politics: ["politics", "election", "congress", "president"],
      crypto: ["bitcoin", "ethereum", "crypto", "blockchain"],
      sports: ["nba", "nfl", "soccer", "sports"],
      entertainment: ["movies", "celebrity", "entertainment"],
    };

    const keywords = categoryMap[marketCategory] || [marketCategory];
    const trends: TrendSignal[] = [];

    for (const keyword of keywords) {
      const result = await this.searchTrends(keyword);
      trends.push(...result);
    }

    return trends.sort((a, b) => b.score - a.score);
  }

  private extractKeywords(text: string): string[] {
    // Remove common words and extract meaningful keywords
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "must", "shall",
      "can", "need", "dare", "ought", "used", "to", "of", "in",
      "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "during", "before", "after", "above", "below", "between", "under",
      "again", "further", "then", "once", "here", "there", "when", "where",
      "why", "how", "all", "each", "few", "more", "most", "other", "some",
      "such", "no", "nor", "not", "only", "own", "same", "so", "than",
      "too", "very", "just", "and", "but", "if", "or", "because", "until",
      "while", "this", "that", "these", "those", "what", "which", "who",
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .slice(0, 5); // Top 5 keywords per text
  }

  private inferCategory(keyword: string, post: RedditPost): string {
    const categoryKeywords: Record<string, string[]> = {
      politics: ["trump", "biden", "election", "congress", "senate", "democrat", "republican"],
      crypto: ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain"],
      sports: ["nba", "nfl", "mlb", "soccer", "game", "team", "player"],
      tech: ["ai", "google", "apple", "microsoft", "tech", "software"],
      finance: ["stock", "market", "invest", "trading", "fed", "rate"],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((k) => keyword.includes(k) || post.subreddit.toLowerCase().includes(k))) {
        return category;
      }
    }

    return "general";
  }
}

export const trendAggregator = new TrendAggregator();
