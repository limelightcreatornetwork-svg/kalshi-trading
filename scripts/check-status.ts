/**
 * Check account status and orders
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

function formatPemKey(key: string): string {
  const cleanKey = key.replace(/-----BEGIN.*?-----/g, '')
                      .replace(/-----END.*?-----/g, '')
                      .replace(/[\r\n\s]/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${cleanKey.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
}

function generateSignature(timestamp: number, method: string, path: string): string {
  const pathOnly = path.split('?')[0];
  const message = `${timestamp}${method}${pathOnly}`;
  const pemKey = formatPemKey(PRIVATE_KEY);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign({ key: pemKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING }, 'base64');
}

async function apiRequest(method: string, path: string) {
  const timestamp = Date.now();
  const signature = generateSignature(timestamp, method, path);
  
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'KALSHI-ACCESS-KEY': API_KEY_ID,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp.toString(),
      'Content-Type': 'application/json',
    },
  });
  
  return response.json();
}

async function main() {
  console.log('=== KALSHI ACCOUNT STATUS ===\n');
  
  // Get balance
  const balance = await apiRequest('GET', '/portfolio/balance');
  console.log('💰 Account Balance:');
  console.log('   Available: $' + (balance.available_balance / 100).toFixed(2));
  console.log('   Total: $' + (balance.balance / 100).toFixed(2));
  
  // Get specific order status
  console.log('\n📋 Checking order 06c1f778-1587-4b8c-99fc-564af81a7057...');
  const order = await apiRequest('GET', '/portfolio/orders/06c1f778-1587-4b8c-99fc-564af81a7057');
  console.log('   Order:', JSON.stringify(order, null, 2));
  
  // Get all orders
  console.log('\n📋 All Open Orders:');
  const orders = await apiRequest('GET', '/portfolio/orders?status=resting');
  if (orders.orders && orders.orders.length > 0) {
    for (const o of orders.orders) {
      console.log('   ---');
      console.log('   Order ID:', o.order_id);
      console.log('   Ticker:', o.ticker);
      console.log('   Side:', o.side);
      console.log('   Price:', o.yes_price + '¢');
      console.log('   Remaining:', o.remaining_count, 'contracts');
      console.log('   Status:', o.status);
    }
  } else {
    console.log('   No open orders found');
  }
  
  // Get positions
  console.log('\n📊 Current Positions:');
  const positions = await apiRequest('GET', '/portfolio/positions');
  if (positions.market_positions && positions.market_positions.length > 0) {
    let hasPositions = false;
    for (const p of positions.market_positions) {
      if (p.position !== 0) {
        hasPositions = true;
        console.log('   Ticker:', p.ticker);
        console.log('   Position:', p.position, 'contracts');
        console.log('   ---');
      }
    }
    if (!hasPositions) console.log('   No active positions');
  } else {
    console.log('   No positions');
  }
}

main().catch(console.error);
