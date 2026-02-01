/**
 * Reddit API Client
 * Fetches trending posts and sentiment from relevant subreddits
 */

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  numComments: number;
  url: string;
  created: Date;
  author: string;
}

export interface SubredditConfig {
  name: string;
  category: string; // politics, crypto, sports, etc.
}

// Subreddits relevant for prediction markets
export const PREDICTION_SUBREDDITS: SubredditConfig[] = [
  { name: "politics", category: "politics" },
  { name: "worldnews", category: "news" },
  { name: "news", category: "news" },
  { name: "cryptocurrency", category: "crypto" },
  { name: "bitcoin", category: "crypto" },
  { name: "wallstreetbets", category: "finance" },
  { name: "stocks", category: "finance" },
  { name: "sports", category: "sports" },
  { name: "nba", category: "sports" },
  { name: "nfl", category: "sports" },
  { name: "soccer", category: "sports" },
  { name: "technology", category: "tech" },
  { name: "science", category: "science" },
];

export class RedditClient {
  private baseUrl = "https://www.reddit.com";
  private userAgent = "OpenClaw-Intelligence/1.0";

  async getHotPosts(subreddit: string, limit = 25): Promise<RedditPost[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/r/${subreddit}/hot.json?limit=${limit}`,
        {
          headers: {
            "User-Agent": this.userAgent,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data.children.map((child: any) => ({
        id: child.data.id,
        subreddit: child.data.subreddit,
        title: child.data.title,
        selftext: child.data.selftext || "",
        score: child.data.score,
        numComments: child.data.num_comments,
        url: child.data.url,
        created: new Date(child.data.created_utc * 1000),
        author: child.data.author,
      }));
    } catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error);
      return [];
    }
  }

  async searchPosts(query: string, limit = 25): Promise<RedditPost[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance&t=day`,
        {
          headers: {
            "User-Agent": this.userAgent,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data.children.map((child: any) => ({
        id: child.data.id,
        subreddit: child.data.subreddit,
        title: child.data.title,
        selftext: child.data.selftext || "",
        score: child.data.score,
        numComments: child.data.num_comments,
        url: child.data.url,
        created: new Date(child.data.created_utc * 1000),
        author: child.data.author,
      }));
    } catch (error) {
      console.error(`Error searching Reddit:`, error);
      return [];
    }
  }

  async getTrendingTopics(categories?: string[]): Promise<RedditPost[]> {
    const subreddits = categories
      ? PREDICTION_SUBREDDITS.filter((s) => categories.includes(s.category))
      : PREDICTION_SUBREDDITS;

    const allPosts: RedditPost[] = [];

    for (const sub of subreddits) {
      const posts = await this.getHotPosts(sub.name, 10);
      allPosts.push(...posts);
      // Rate limiting - Reddit allows ~60 requests/min for unauthenticated
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Sort by engagement (score + comments)
    return allPosts.sort((a, b) => 
      (b.score + b.numComments * 2) - (a.score + a.numComments * 2)
    );
  }
}

export const redditClient = new RedditClient();
