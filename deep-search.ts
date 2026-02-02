/**
 * Deep market search - paginate through all markets
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

async function getMarkets(cursor?: string): Promise<{ markets: any[], cursor?: string }> {
  const params = new URLSearchParams({ limit: '200' });
  if (cursor) params.set('cursor', cursor);
  
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
  return { markets: data.markets || [], cursor: data.cursor };
}

async function getSeries(): Promise<any[]> {
  const path = `/trade-api/v2/series`;
  
  const response = await fetch(`${BASE_URL}/series`, {
    headers: getAuthHeaders('GET', path),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Series API error ${response.status}: ${text}`);
  }
  
  const data = await response.json();
  return data.series || [];
}

async function main() {
  console.log('=== Deep Market Search ===\n');
  
  // Get series first
  console.log('📚 Fetching series...');
  try {
    const series = await getSeries();
    console.log(`Found ${series.length} series\n`);
    
    const sportsSeries = series.filter((s: any) => {
      const title = s.title?.toLowerCase() || '';
      const ticker = s.ticker?.toLowerCase() || '';
      const category = s.category?.toLowerCase() || '';
      return title.includes('nfl') || title.includes('football') || title.includes('super bowl') ||
             ticker.includes('nfl') || ticker.includes('sb') || category.includes('sport');
    });
    
    console.log(`Sports-related series: ${sportsSeries.length}`);
    for (const s of sportsSeries) {
      console.log(`   - ${s.ticker}: ${s.title} [${s.category}]`);
    }
  } catch (e) {
    console.log('Series endpoint not available');
  }
  
  // Paginate through all markets
  console.log('\n📊 Fetching all markets (paginated)...');
  let allMarkets: any[] = [];
  let cursor: string | undefined;
  let page = 0;
  
  do {
    const result = await getMarkets(cursor);
    allMarkets = allMarkets.concat(result.markets);
    cursor = result.cursor;
    page++;
    console.log(`   Page ${page}: ${result.markets.length} markets (total: ${allMarkets.length})`);
  } while (cursor && page < 50); // Safety limit
  
  console.log(`\n✅ Total markets fetched: ${allMarkets.length}`);
  
  // Search for NFL/Football/Super Bowl terms
  const searchTerms = ['nfl', 'super bowl', 'superbowl', 'football', 'seahawk', 'patriot', 
                       'seattle', 'new england', 'touchdown', 'quarterback', 'sb-', 'sblx'];
  
  const matchingMarkets = allMarkets.filter((m: any) => {
    const title = m.title?.toLowerCase() || '';
    const ticker = m.ticker?.toLowerCase() || '';
    const eventTicker = m.event_ticker?.toLowerCase() || '';
    return searchTerms.some(term => 
      title.includes(term) || ticker.includes(term) || eventTicker.includes(term)
    );
  });
  
  console.log(`\n🏈 NFL/Super Bowl related markets: ${matchingMarkets.length}`);
  
  // Group by event
  const byEvent = new Map<string, any[]>();
  for (const m of matchingMarkets) {
    const event = m.event_ticker || 'unknown';
    if (!byEvent.has(event)) byEvent.set(event, []);
    byEvent.get(event)!.push(m);
  }
  
  for (const [event, markets] of byEvent) {
    console.log(`\n   Event: ${event} (${markets.length} markets)`);
    
    // Sort by volume
    markets.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    
    for (const m of markets.slice(0, 5)) {
      console.log(`\n      🎯 ${m.ticker}`);
      console.log(`         ${m.title}`);
      console.log(`         YES: ${m.yes_bid}¢ / ${m.yes_ask}¢  |  NO: ${m.no_bid}¢ / ${m.no_ask}¢`);
      console.log(`         Last: ${m.last_price}¢  |  Volume: ${m.volume?.toLocaleString() || 'N/A'}`);
      console.log(`         Status: ${m.status}  |  Expires: ${m.expiration_time || 'N/A'}`);
    }
  }
  
  // Look specifically for main winner markets (high volume, simple titles)
  console.log('\n\n=== HIGH VOLUME MARKETS (potential main bets) ===');
  const highVolumeMatches = matchingMarkets
    .filter((m: any) => (m.volume || 0) > 1000 && m.status === 'active')
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  
  for (const m of highVolumeMatches.slice(0, 10)) {
    console.log(`\n🎯 ${m.ticker}`);
    console.log(`   ${m.title}`);
    console.log(`   YES: ${m.yes_bid}¢ / ${m.yes_ask}¢  |  NO: ${m.no_bid}¢ / ${m.no_ask}¢`);
    console.log(`   Volume: ${m.volume?.toLocaleString()}`);
  }
  
  // Also check for Sports category in all high-volume markets
  console.log('\n\n=== TOP VOLUME ACTIVE MARKETS (ANY CATEGORY) ===');
  const topVolume = allMarkets
    .filter((m: any) => m.status === 'active' && (m.volume || 0) > 10000)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  
  for (const m of topVolume.slice(0, 15)) {
    console.log(`\n${m.ticker}`);
    console.log(`   ${m.title}`);
    console.log(`   YES: ${m.yes_bid}¢ / ${m.yes_ask}¢  Volume: ${m.volume?.toLocaleString()}`);
  }
}

main().catch(console.error);
