/**
 * Comprehensive Super Bowl Market Search
 */

import crypto from 'crypto';

const API_KEY_ID = 'f67f0b70-0c13-4bf1-9e7e-3a9734bb086f';
const PRIVATE_KEY = `MIIEowIBAAKCAQEAwBvPDME+xQJ4qKRaC36V6fSKdgNiG5UWSmRHVb8+JbAfWz2m
4QUjvNvMAv3VkLgEz4Fxx9bfCmD4QPtmPphfYToM/Hz7HhqMob40z+Qy9ueXvuij
3spc3LI+om/o93xXabMCRsE/XZwbmVAGwwSxSEaB/Ja8ioOfjAB/CHnhQiOFguGj
Is3thihBT/QgMZi2/YahOZUylFl5uVyp0cEiY7AmTnlMNTS0dNOXI3h4viG3q9ot
1/XSFY1nmT/7iMl6kVbrpQdFf8ve3UnlpXpg3M9CfL6IPq3e6sfMolNsAceQNNIh
RXN9swBIrUdq33O3ibqHSnG6vN88tTGYB4LHmwIDAQABAoIBAFaGT+eZRBm8prai
K5JAxem1RAWqOW5d5EfGSaDTvXyBCmZwarCvvWxq/MSeKin/z97cGPCelR+aFEZE
VMU9oLvsRvwTmJDy+UNCJYw65j9xiNWp92C5eUDHoVFNITsSjFZlk1Fl6ZHSZVXU
hu8gNm7sntAy3iFu7hXDBXQ+XNgJ2loyiIcQT643ajYYYBcgZb12A8JTR7u8B0Tb
3AQcbbECrII3ngT+skpdXVJL7Vl5J5W5Y3phi3GPf4imdZGx0/gHQJW1hv9V7yaF
PStbZr+2MkNhedBHk3n01akddIGle+E1s8JOBXIgK2ZhLub07VfcUhAGrUNrbQA5
8PuuFDECgYEAzZu3TxUYY25FpIwLyCovY1/n2IGGcTm7g3dVokwwUOq64a7onhu+
pJWZ7nwdqIIIl59/ghcqmDtZGGliEFakQb0sqeXPXSp7MbGiOeHzSepvdK2zI4su
Kr2LObKFu4uOPGuNioXKmnCSmu28gllb2pgGkwPMJBzkVkVtgxGnhVECgYEA7zEZ
CYBKoKADUpG2f+KHxhJ4pu91k041UwcZTvXENxEC2pcgGtRjksrBiv7g8i0z2Y+a
xAEaRYeG3pLNWO+jhdp0jTNpWpX69FO7p+P5+ApKPlegWO4QImmNqw1MeenI92FE
X0/bH3TNsxpu3L6xivhx1DWkRZ2X6eDdR2i8cysCgYACATWtWLhPJ+EX9KGcxwSF
RIcfLkwgSH7SjlRQa8vAzjkaQDlWaVDXi/nfQGiNnw70Y4K7wvwQVevNeCGTpTSe
y3hnA62c6/AdkOzTAaf8nYOOsK7hdtbxZb24x0vUg0zUu/u6UQmjrdtQFWdUIgjq
Pbc6sbvI0ltLmAu0TnTCsQKBgC/uidLil5Hanu/T7VtxPL4Pg4gIYmpTeNIbkRHG
pDxYt1awhCl8ODv5T5GYA+Hj9wj5Aw2WHvqh7v/5MRdKZl1zannFPK5/cZu2j9tU
DwqKnVgi3SoVAryypEYL0zB3DeOs5TOoYAPMt0/V0zN/LzrnEIBzA2lD7GZcvlsJ
/QGjAoGBAIp/JZi+lOz4MDcn6BpXlDUcPrp+UeYdQqDhzqPADgM64zz0fOdPO5zu
0WxhlJKRxUoFWfVSNmsurtJizM/yg6K+XSbRY5oOeB2iuBkQAzFIbIFxPyUiUVDC
SwKntpeeJg/dkS9XKRL0PGse/CkApSF0Y8IoNayd/tPDcuRVTncE`;

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

function formatPrivateKey(key: string): string {
  const cleanKey = key.replace(/\s/g, '');
  const lines: string[] = [];
  for (let i = 0; i < cleanKey.length; i += 64) {
    lines.push(cleanKey.slice(i, i + 64));
  }
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
}

function signRequest(method: string, path: string, timestampMs: string): string {
  const pathWithoutQuery = path.split('?')[0];
  const message = `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`;
  
  const pemKey = formatPrivateKey(PRIVATE_KEY);
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  const signature = sign.sign({
    key: pemKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  
  return signature.toString('base64');
}

function getAuthHeaders(method: string, path: string): Record<string, string> {
  const timestampMs = Date.now().toString();
  const signature = signRequest(method, path, timestampMs);
  
  return {
    'Content-Type': 'application/json',
    'KALSHI-ACCESS-KEY': API_KEY_ID,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestampMs,
  };
}

async function getAllEvents(): Promise<any[]> {
  const params = new URLSearchParams({ limit: '200' });
  const queryString = params.toString();
  const path = `/trade-api/v2/events?${queryString}`;
  
  const response = await fetch(`${BASE_URL}/events?${queryString}`, {
    headers: getAuthHeaders('GET', path),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Events API error ${response.status}: ${text}`);
  }
  
  const data = await response.json();
  return data.events || [];
}

async function getMarketsByEvent(eventTicker: string): Promise<any[]> {
  const params = new URLSearchParams({ event_ticker: eventTicker, limit: '100' });
  const queryString = params.toString();
  const path = `/trade-api/v2/markets?${queryString}`;
  
  const response = await fetch(`${BASE_URL}/markets?${queryString}`, {
    headers: getAuthHeaders('GET', path),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Markets API error ${response.status}: ${text}`);
  }
  
  const data = await response.json();
  return data.markets || [];
}

async function getMarket(ticker: string): Promise<any> {
  const path = `/trade-api/v2/markets/${ticker}`;
  
  const response = await fetch(`${BASE_URL}/markets/${ticker}`, {
    headers: getAuthHeaders('GET', path),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Market API error ${response.status}: ${text}`);
  }
  
  return response.json();
}

async function main() {
  console.log('=== Comprehensive Super Bowl Market Search ===\n');
  
  // Get all events
  console.log('📅 Fetching all events...');
  const allEvents = await getAllEvents();
  console.log(`   Total events: ${allEvents.length}\n`);
  
  // Search for NFL/Football/Super Bowl related events
  const searchTerms = ['nfl', 'super', 'bowl', 'football', 'champion', 'sb-', 'sb60', 'sblx'];
  const matchingEvents = allEvents.filter((e: any) => {
    const title = e.title?.toLowerCase() || '';
    const ticker = e.event_ticker?.toLowerCase() || '';
    return searchTerms.some(term => title.includes(term) || ticker.includes(term));
  });
  
  console.log(`🏈 NFL/Super Bowl related events found: ${matchingEvents.length}`);
  for (const event of matchingEvents) {
    console.log(`   - ${event.event_ticker}: ${event.title}`);
  }
  
  // Also list sports-related events
  const sportsEvents = allEvents.filter((e: any) => {
    const title = e.title?.toLowerCase() || '';
    const ticker = e.event_ticker?.toLowerCase() || '';
    const category = e.category?.toLowerCase() || '';
    return category.includes('sport') || title.includes('sport') || 
           ticker.includes('sport') || ticker.includes('nfl') ||
           ticker.includes('nba') || ticker.includes('mlb');
  });
  
  console.log(`\n⚽ Sports-related events: ${sportsEvents.length}`);
  for (const event of sportsEvents.slice(0, 20)) {
    console.log(`   - ${event.event_ticker}: ${event.title} [${event.category || 'uncategorized'}]`);
  }
  
  // Show all categories
  const categories = [...new Set(allEvents.map((e: any) => e.category).filter(Boolean))];
  console.log(`\n📂 Available categories: ${categories.join(', ')}`);
  
  // List some event tickers to understand the format
  console.log('\n📋 Sample event tickers:');
  for (const event of allEvents.slice(0, 30)) {
    console.log(`   - ${event.event_ticker}: ${event.title?.substring(0, 60)}... [${event.category || 'uncategorized'}]`);
  }
  
  // Try specific tickers that might be Super Bowl
  const tryTickers = ['SBLX', 'SB-LX', 'SUPERBOWL', 'SUPERBOWLLX', 'NFL-SB', 'NFLSB60', 'KXSBLX'];
  console.log('\n🎯 Trying specific market/event tickers...');
  
  for (const ticker of tryTickers) {
    try {
      const market = await getMarket(ticker);
      console.log(`   ✅ Found: ${ticker}`);
      console.log(JSON.stringify(market, null, 2));
    } catch (e) {
      // Ignore not found
    }
  }
  
  // Get markets from matching events
  if (matchingEvents.length > 0) {
    console.log('\n📈 Markets from matching events:');
    for (const event of matchingEvents) {
      const markets = await getMarketsByEvent(event.event_ticker);
      console.log(`\n   Event: ${event.event_ticker}`);
      
      // Show markets with liquidity (non-zero prices)
      const liquidMarkets = markets.filter((m: any) => m.yes_bid > 0 || m.yes_ask > 0);
      console.log(`   Markets with liquidity: ${liquidMarkets.length} / ${markets.length}`);
      
      for (const m of liquidMarkets.slice(0, 10)) {
        console.log(`\n      🎯 ${m.ticker}`);
        console.log(`         ${m.title}`);
        console.log(`         YES: ${m.yes_bid}¢ / ${m.yes_ask}¢  |  NO: ${m.no_bid}¢ / ${m.no_ask}¢`);
        console.log(`         Last: ${m.last_price}¢  |  Volume: ${m.volume?.toLocaleString()}`);
      }
    }
  }
}

main().catch(console.error);
