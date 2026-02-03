/**
 * Super Bowl LX Market Analysis & Betting Script
 * Fetches current odds and places bet if value is found
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

async function getBalance(): Promise<{ available: number; total: number }> {
  const path = '/trade-api/v2/portfolio/balance';
  const response = await fetch(`${BASE_URL}/portfolio/balance`, {
    headers: getAuthHeaders('GET', path),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Balance API error ${response.status}: ${text}`);
  }
  
  const data = await response.json();
  return {
    available: data.balance / 100,
    total: (data.balance + data.portfolio_value) / 100,
  };
}

async function searchMarkets(query: string): Promise<any[]> {
  const params = new URLSearchParams({ limit: '100' });
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
  const markets = data.markets || [];
  
  // Filter for Super Bowl related markets
  return markets.filter((m: any) => 
    m.title?.toLowerCase().includes('super bowl') ||
    m.event_ticker?.toLowerCase().includes('superbowl') ||
    m.event_ticker?.toLowerCase().includes('sb') ||
    m.title?.toLowerCase().includes('nfl champion') ||
    m.title?.toLowerCase().includes('seattle') ||
    m.title?.toLowerCase().includes('new england') ||
    m.title?.toLowerCase().includes('seahawks') ||
    m.title?.toLowerCase().includes('patriots')
  );
}

async function searchEvents(query: string): Promise<any[]> {
  const params = new URLSearchParams({ limit: '100' });
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
  const events = data.events || [];
  
  // Filter for Super Bowl related events
  return events.filter((e: any) => 
    e.title?.toLowerCase().includes('super bowl') ||
    e.event_ticker?.toLowerCase().includes('superbowl') ||
    e.event_ticker?.toLowerCase().includes('sb-') ||
    e.title?.toLowerCase().includes('nfl champion')
  );
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

async function createOrder(params: {
  ticker: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  type: 'market' | 'limit';
  count: number;
  yes_price?: number;
}): Promise<any> {
  const path = '/trade-api/v2/portfolio/orders';
  
  const body: any = {
    ticker: params.ticker,
    action: params.action,
    side: params.side,
    type: params.type,
    count: params.count,
  };
  
  if (params.type === 'limit' && params.yes_price !== undefined) {
    body.yes_price = params.yes_price;
  }
  
  const response = await fetch(`${BASE_URL}/portfolio/orders`, {
    method: 'POST',
    headers: getAuthHeaders('POST', path),
    body: JSON.stringify(body),
  });
  
  const responseText = await response.text();
  
  if (!response.ok) {
    throw new Error(`Order API error ${response.status}: ${responseText}`);
  }
  
  return JSON.parse(responseText);
}

async function main() {
  console.log('=== Super Bowl LX Market Analysis ===\n');
  
  // Check balance first
  console.log('📊 Checking account balance...');
  try {
    const balance = await getBalance();
    console.log(`   Available: $${balance.available.toFixed(2)}`);
    console.log(`   Total: $${balance.total.toFixed(2)}\n`);
  } catch (error) {
    console.error('   Balance check failed:', error);
    return;
  }
  
  // Search for Super Bowl events
  console.log('🔍 Searching for Super Bowl events...');
  const events = await searchEvents('super bowl');
  console.log(`   Found ${events.length} potential events\n`);
  
  for (const event of events) {
    console.log(`   📅 ${event.event_ticker}: ${event.title}`);
  }
  
  // Search for Super Bowl markets directly
  console.log('\n🔍 Searching for Super Bowl markets...');
  const markets = await searchMarkets('super bowl');
  console.log(`   Found ${markets.length} potential markets\n`);
  
  // If we found events, get their markets
  for (const event of events) {
    console.log(`\n📈 Markets for event: ${event.event_ticker}`);
    const eventMarkets = await getMarketsByEvent(event.event_ticker);
    
    for (const market of eventMarkets) {
      console.log(`\n   🎯 ${market.ticker}`);
      console.log(`      Title: ${market.title}`);
      console.log(`      YES bid/ask: ${market.yes_bid}¢ / ${market.yes_ask}¢`);
      console.log(`      NO bid/ask: ${market.no_bid}¢ / ${market.no_ask}¢`);
      console.log(`      Last price: ${market.last_price}¢`);
      console.log(`      Volume: ${market.volume?.toLocaleString() || 'N/A'}`);
      console.log(`      Status: ${market.status}`);
      
      // Look for New England / Patriots market
      const title = market.title?.toLowerCase() || '';
      if (title.includes('new england') || title.includes('patriots')) {
        markets.push(market);
      }
    }
  }
  
  // Display all found markets
  if (markets.length > 0) {
    console.log('\n\n=== ALL SUPER BOWL RELATED MARKETS ===\n');
    for (const market of markets) {
      console.log(`🎯 ${market.ticker}`);
      console.log(`   Title: ${market.title}`);
      console.log(`   YES bid/ask: ${market.yes_bid}¢ / ${market.yes_ask}¢`);
      console.log(`   NO bid/ask: ${market.no_bid}¢ / ${market.no_ask}¢`);
      console.log(`   Last price: ${market.last_price}¢`);
      console.log(`   Volume: ${market.volume?.toLocaleString() || 'N/A'}`);
      console.log(`   Status: ${market.status}`);
      console.log('');
    }
  }
  
  // Look for a New England market to bet on
  const neMarket = markets.find((m: any) => {
    const title = m.title?.toLowerCase() || '';
    const ticker = m.ticker?.toLowerCase() || '';
    return (title.includes('new england') || title.includes('patriots') || 
            ticker.includes('ne-') || ticker.includes('patriots')) &&
           m.status === 'active';
  });
  
  if (neMarket) {
    console.log('\n=== NEW ENGLAND MARKET FOUND ===');
    console.log(`Ticker: ${neMarket.ticker}`);
    console.log(`Title: ${neMarket.title}`);
    console.log(`Current YES ask: ${neMarket.yes_ask}¢`);
    
    // Calculate implied probability and value
    const askPrice = neMarket.yes_ask;
    const impliedProb = askPrice / 100;
    const impliedOdds = 100 / askPrice;
    
    console.log(`\n📊 Value Analysis:`);
    console.log(`   Implied probability: ${(impliedProb * 100).toFixed(1)}%`);
    console.log(`   Implied odds: ${impliedOdds.toFixed(2)}:1`);
    
    // Place a $25 bet (25 contracts at current ask)
    const betAmount = 25; // dollars
    const contracts = Math.floor((betAmount * 100) / askPrice);
    const totalCost = (contracts * askPrice) / 100;
    const potentialPayout = contracts; // Each contract pays $1 if YES
    const potentialProfit = potentialPayout - totalCost;
    
    console.log(`\n💰 Proposed Bet:`);
    console.log(`   Contracts: ${contracts}`);
    console.log(`   Total cost: $${totalCost.toFixed(2)}`);
    console.log(`   Potential payout if NE wins: $${potentialPayout.toFixed(2)}`);
    console.log(`   Potential profit: $${potentialProfit.toFixed(2)}`);
    
    // Execute the bet
    console.log(`\n🎰 Placing bet...`);
    try {
      const order = await createOrder({
        ticker: neMarket.ticker,
        action: 'buy',
        side: 'yes',
        type: 'limit',
        count: contracts,
        yes_price: askPrice,
      });
      
      console.log(`✅ ORDER PLACED SUCCESSFULLY!`);
      console.log(`   Order ID: ${order.order?.order_id || 'N/A'}`);
      console.log(`   Status: ${order.order?.status || 'submitted'}`);
      console.log(JSON.stringify(order, null, 2));
    } catch (error) {
      console.error(`❌ Order failed:`, error);
    }
  } else {
    console.log('\n⚠️ No active New England market found');
    console.log('Available markets:', markets.map((m: any) => m.ticker).join(', '));
  }
}

main().catch(console.error);
