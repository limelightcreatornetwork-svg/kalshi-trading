/**
 * Search all sports and Super Bowl related markets
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

async function main() {
  console.log('=== SEARCHING FOR ALL SPORTS/MVP/GAME-RELATED MARKETS ===\n');
  
  // Search for multi-game and sports event markets 
  let cursor = '';
  let allMarkets: any[] = [];
  
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const path = `/trade-api/v2/markets?${params.toString()}`;
    const res = await fetch(`${BASE_URL}/markets?${params.toString()}`, { 
      headers: getAuthHeaders('GET', path) 
    });
    const data = await res.json();
    allMarkets = allMarkets.concat(data.markets || []);
    cursor = data.cursor || '';
    if (!cursor) break;
  }
  
  console.log('Total markets fetched:', allMarkets.length);
  
  // Filter for sports, mvp, game-related markets
  const sportsKeywords = ['mvp', 'sport', 'game', 'nfl', 'bowl', 'football', 'seahawk', 'patriot', 'champion', 'touchdown', 'pass', 'rush', 'new england', 'seattle'];
  
  const relevant = allMarkets.filter((m: any) => {
    const ticker = (m.ticker || '').toLowerCase();
    const title = (m.title || '').toLowerCase();
    const eventTicker = (m.event_ticker || '').toLowerCase();
    return sportsKeywords.some(k => ticker.includes(k) || title.includes(k) || eventTicker.includes(k));
  });
  
  console.log('\nRelevant sports markets found:', relevant.length);
  
  // Show markets with liquidity
  const liquid = relevant.filter((m: any) => m.volume > 0 || (m.yes_bid > 0 && m.yes_ask < 100));
  console.log('Markets with some liquidity:', liquid.length);
  
  // Sort by volume
  liquid.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));
  
  console.log('\n=== TOP LIQUID SPORTS MARKETS ===');
  for (const m of liquid.slice(0, 20)) {
    console.log('\n' + m.ticker);
    console.log('  Title:', m.title);
    console.log('  Event:', m.event_ticker);
    console.log('  YES bid/ask:', m.yes_bid + '¢ / ' + m.yes_ask + '¢');
    console.log('  NO bid/ask:', m.no_bid + '¢ / ' + m.no_ask + '¢');
    console.log('  Spread:', (m.yes_ask - m.yes_bid) + '¢');
    console.log('  Volume:', m.volume);
    console.log('  Status:', m.status);
  }
  
  // Also search for KXMVE events (multi-event sports)
  const mveMarkets = allMarkets.filter((m: any) => 
    (m.ticker || '').includes('KXMVE') || (m.event_ticker || '').includes('KXMVE'));
  console.log('\n=== MVE (Multi-Event) Sports Markets ===');
  console.log('Total MVE markets:', mveMarkets.length);
  
  // Get unique event tickers
  const mveEvents = [...new Set(mveMarkets.map((m: any) => m.event_ticker))];
  console.log('Unique MVE events:', mveEvents.length);
  
  // Show first few events with their markets
  for (const ev of mveEvents.slice(0, 5)) {
    console.log('\nEvent:', ev);
    const evMarkets = mveMarkets.filter((m: any) => m.event_ticker === ev);
    console.log('Markets in event:', evMarkets.length);
    for (const m of evMarkets.slice(0, 3)) {
      console.log('  -', m.ticker);
      console.log('   ', m.title?.substring(0, 80));
      console.log('   YES:', m.yes_bid + '/' + m.yes_ask, '| Vol:', m.volume);
    }
  }
  
  // Check balance
  console.log('\n=== ACCOUNT STATUS ===');
  const balPath = '/trade-api/v2/portfolio/balance';
  const balRes = await fetch(`${BASE_URL}/portfolio/balance`, {
    headers: getAuthHeaders('GET', balPath),
  });
  const balance = await balRes.json();
  console.log('Balance:', JSON.stringify(balance, null, 2));
  
  // Check existing orders
  console.log('\n=== EXISTING ORDERS ===');
  const ordPath = '/trade-api/v2/portfolio/orders';
  const ordRes = await fetch(`${BASE_URL}/portfolio/orders`, {
    headers: getAuthHeaders('GET', ordPath),
  });
  const orders = await ordRes.json();
  for (const o of (orders.orders || [])) {
    console.log('\nOrder:', o.order_id);
    console.log('  Ticker:', o.ticker);
    console.log('  Status:', o.status);
    console.log('  Side:', o.side, '|', o.action);
    console.log('  Price:', o.yes_price + '¢');
    console.log('  Count:', o.fill_count, '/', o.initial_count);
  }
}

main().catch(console.error);
