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
  console.log('=== KALSHI SUPER BOWL BET STATUS ===\n');
  
  // Get balance
  const balancePath = '/trade-api/v2/portfolio/balance';
  const balanceRes = await fetch(`${BASE_URL}/portfolio/balance`, {
    headers: getAuthHeaders('GET', balancePath),
  });
  const balance = await balanceRes.json();
  console.log('💰 Account Balance:');
  console.log('   Available: $' + (balance.available_balance / 100).toFixed(2));
  console.log('   Total Portfolio: $' + ((balance.balance) / 100).toFixed(2));
  
  // Get order
  console.log('\n📋 Super Bowl Bet Order Status:');
  const orderPath = '/trade-api/v2/portfolio/orders/06c1f778-1587-4b8c-99fc-564af81a7057';
  const orderRes = await fetch(`${BASE_URL}/portfolio/orders/06c1f778-1587-4b8c-99fc-564af81a7057`, {
    headers: getAuthHeaders('GET', orderPath),
  });
  const order = await orderRes.json();
  console.log('   Order ID:', order.order?.order_id || 'N/A');
  console.log('   Status:', order.order?.status || 'N/A');
  console.log('   Side:', order.order?.side || 'N/A');
  console.log('   Price:', (order.order?.yes_price || 0) + '¢');
  console.log('   Initial Contracts:', order.order?.initial_count || 0);
  console.log('   Filled:', order.order?.fill_count || 0);
  console.log('   Remaining:', order.order?.remaining_count || 0);
  console.log('   Ticker:', order.order?.ticker || 'N/A');
  
  // Get all open orders
  console.log('\n📋 All Open Orders:');
  const ordersPath = '/trade-api/v2/portfolio/orders?status=resting';
  const ordersRes = await fetch(`${BASE_URL}/portfolio/orders?status=resting`, {
    headers: getAuthHeaders('GET', ordersPath),
  });
  const orders = await ordersRes.json();
  if (orders.orders?.length > 0) {
    for (const o of orders.orders) {
      console.log('   ---');
      console.log('   ID:', o.order_id);
      console.log('   Status:', o.status);
      console.log('   Side:', o.side);
      console.log('   Price:', o.yes_price + '¢');
      console.log('   Remaining:', o.remaining_count);
    }
  } else {
    console.log('   No open orders');
  }
  
  // Get positions
  console.log('\n📊 Current Positions:');
  const posPath = '/trade-api/v2/portfolio/positions';
  const posRes = await fetch(`${BASE_URL}/portfolio/positions`, {
    headers: getAuthHeaders('GET', posPath),
  });
  const positions = await posRes.json();
  let hasPos = false;
  if (positions.market_positions) {
    for (const p of positions.market_positions) {
      if (p.position !== 0) {
        hasPos = true;
        console.log('   Ticker:', p.ticker);
        console.log('   Position:', p.position, 'contracts');
      }
    }
  }
  if (!hasPos) console.log('   No active positions');
  
  // Market details for the ticker
  console.log('\n📈 Market Details for the Bet:');
  const ticker = 'KXMVESPORTSMULTIGAMEEXTENDED-S2026813A6414EC2-CDB403589A7';
  const marketPath = '/trade-api/v2/markets/' + ticker;
  const marketRes = await fetch(`${BASE_URL}/markets/${ticker}`, {
    headers: getAuthHeaders('GET', marketPath),
  });
  const market = await marketRes.json();
  if (market.market) {
    console.log('   Title:', market.market.title);
    console.log('   Status:', market.market.status);
    console.log('   YES bid/ask:', (market.market.yes_bid || 0) + '¢ / ' + (market.market.yes_ask || 0) + '¢');
    console.log('   Volume:', market.market.volume);
    console.log('   Expires:', market.market.expiration_time);
  }
}

main().catch(console.error);
