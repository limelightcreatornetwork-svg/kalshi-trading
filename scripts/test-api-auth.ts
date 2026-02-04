/**
 * Test script to verify Kalshi API authentication
 * Run: npx tsx scripts/test-api-auth.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { getAuthHeaders, formatPrivateKey } from '../src/lib/kalshi-auth';

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function testAuth() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_API_PRIVATE_KEY;
  
  console.log('=== Kalshi API Auth Test ===\n');
  console.log('API Key ID:', apiKeyId ? `${apiKeyId.slice(0, 8)}...` : 'NOT SET');
  console.log('Private Key:', privateKey ? `${privateKey.slice(0, 20)}... (${privateKey.length} chars)` : 'NOT SET');
  console.log('Environment:', process.env.KALSHI_ENV || 'demo');
  console.log('Base URL:', BASE_URL);
  console.log('');
  
  if (!apiKeyId || !privateKey) {
    console.error('ERROR: Missing API credentials');
    process.exit(1);
  }
  
  // Test 1: Check key formatting
  console.log('1. Testing private key formatting...');
  try {
    const pemKey = formatPrivateKey(privateKey);
    console.log('   ✓ Key formatted successfully');
    console.log(`   Format: ${pemKey.includes('-----BEGIN RSA PRIVATE KEY-----') ? 'RSA PRIVATE KEY (PKCS#1)' : 'Unknown'}`);
  } catch (err) {
    console.error('   ✗ Key formatting failed:', err);
    process.exit(1);
  }
  
  // Test 2: Generate auth headers
  console.log('\n2. Testing signature generation...');
  const path = '/trade-api/v2/portfolio/balance';
  const headers = getAuthHeaders('GET', path, apiKeyId, privateKey);
  console.log('   ✓ Headers generated');
  console.log('   KALSHI-ACCESS-KEY:', headers['KALSHI-ACCESS-KEY'].slice(0, 12) + '...');
  console.log('   KALSHI-ACCESS-TIMESTAMP:', headers['KALSHI-ACCESS-TIMESTAMP']);
  console.log('   KALSHI-ACCESS-SIGNATURE:', headers['KALSHI-ACCESS-SIGNATURE'].slice(0, 30) + '...');
  
  // Test 3: Make actual API call
  console.log('\n3. Testing API call to /portfolio/balance...');
  try {
    const response = await fetch(`${BASE_URL}/portfolio/balance`, {
      method: 'GET',
      headers,
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    
    console.log('   Status:', response.status, response.statusText);
    
    if (response.ok) {
      console.log('   ✓ SUCCESS! API authentication working');
      console.log('   Balance:', JSON.stringify(data, null, 2));
    } else {
      console.log('   ✗ FAILED');
      console.log('   Response:', JSON.stringify(data, null, 2));
      
      if (data?.code === 'INCORRECT_API_KEY_SIGNATURE') {
        console.log('\n   Debugging signature mismatch:');
        console.log('   - Timestamp used:', headers['KALSHI-ACCESS-TIMESTAMP']);
        console.log('   - Path signed:', path);
        console.log('   - Method: GET');
      }
    }
  } catch (err) {
    console.error('   ✗ Network error:', err);
  }
  
  // Test 4: Try markets endpoint (public)
  console.log('\n4. Testing /markets endpoint...');
  const marketsPath = '/trade-api/v2/markets';
  const marketsHeaders = getAuthHeaders('GET', marketsPath, apiKeyId, privateKey);
  
  try {
    const response = await fetch(`${BASE_URL}/markets?limit=1`, {
      method: 'GET',
      headers: marketsHeaders,
    });
    
    const data = await response.json();
    console.log('   Status:', response.status, response.statusText);
    
    if (response.ok) {
      console.log('   ✓ Markets endpoint working');
      console.log('   First market:', data.markets?.[0]?.ticker || 'No markets');
    } else {
      console.log('   ✗ Markets failed:', data);
    }
  } catch (err) {
    console.error('   ✗ Network error:', err);
  }
}

testAuth().catch(console.error);
