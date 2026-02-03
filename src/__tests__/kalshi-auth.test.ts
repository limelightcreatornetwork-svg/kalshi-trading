/**
 * Tests for Kalshi RSA-PSS Authentication Module
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  formatPrivateKey,
  buildSignatureMessage,
  signMessage,
  signRequest,
  getAuthHeaders,
  verifySignature,
} from '../lib/kalshi-auth';

// Test RSA key pair for testing (2048-bit)
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAwBvPDME+xQJ4qKRaC36V6fSKdgNiG5UWSmRHVb8+JbAfWz2m
4QUjvNvMAv3VkLgEz4Fxx9bfCmD4QPtmPphfYToM/Hz7HhqMob40z+Qy9ueXvuij
3spc3LI+om/o93xXabMCRsE/XZwbmVAGwwSxSEaB/Ja8ioOfjAB/CHnhQiOFguGj
Is3thihBT/QgMZi2/YahOZUylFl5uVyp0cEiY7AmTnlMNTS0dNOXI3h4viG3q9ot
1/XSFY1nmT/7iMl6kVbrpQdFf8ve3UnlpXpg3M9CfL6IPq3e6sfMolNsAceQNNIh
RXN9swBIrUdq33O3ibqHSnG6vN88tTGYB4LHmwIDAQABAoIBAFaGT+eZRBm8prai
K5JAxem1RAWqOW5d5EfGSaDTvXyBCmZwarCvvWxq/MSeKin/z97cGPCelR+aFEZE
VMU9oLvsRvwTmJDy+UNCJYw65j9xiNWp92C5eUDHoVFNITsSjFZlk1Fl6ZHSZVXU
hu8gNm7sntAy3iFu7hXDBXQ+XNgJ2loyiIcQT643ajYYYBcgZb12A8JTR7u8B0Tb
3AQcbbECrII3ngT+skpdXVJL7Vl9J5W5Y3phi3GPf4imdZGx0/gHQJW1hv9V7yaF
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
SwKntpeeJg/dkS9XKRL0PGse/CkApSF0Y8IoNayd/tPDcuRVTncE
-----END RSA PRIVATE KEY-----`;

// Extract public key from private key for verification tests
const TEST_PUBLIC_KEY = crypto.createPublicKey(TEST_PRIVATE_KEY).export({
  type: 'pkcs1',
  format: 'pem',
}) as string;

// Raw key without PEM headers (simulating Kalshi key format)
const RAW_PRIVATE_KEY = `MIIEowIBAAKCAQEAwBvPDME+xQJ4qKRaC36V6fSKdgNiG5UWSmRHVb8+JbAfWz2m4QUjvNvMAv3VkLgEz4Fxx9bfCmD4QPtmPphfYToM/Hz7HhqMob40z+Qy9ueXvuij3spc3LI+om/o93xXabMCRsE/XZwbmVAGwwSxSEaB/Ja8ioOfjAB/CHnhQiOFguGjIs3thihBT/QgMZi2/YahOZUylFl5uVyp0cEiY7AmTnlMNTS0dNOXI3h4viG3q9ot1/XSFY1nmT/7iMl6kVbrpQdFf8ve3UnlpXpg3M9CfL6IPq3e6sfMolNsAceQNNIhRXN9swBIrUdq33O3ibqHSnG6vN88tTGYB4LHmwIDAQABAoIBAFaGT+eZRBm8praiK5JAxem1RAWqOW5d5EfGSaDTvXyBCmZwarCvvWxq/MSeKin/z97cGPCelR+aFEZEVMU9oLvsRvwTmJDy+UNCJYw65j9xiNWp92C5eUDHoVFNITsSjFZlk1Fl6ZHSZVXUhu8gNm7sntAy3iFu7hXDBXQ+XNgJ2loyiIcQT643ajYYYBcgZb12A8JTR7u8B0Tb3AQcbbECrII3ngT+skpdXVJL7Vl9J5W5Y3phi3GPf4imdZGx0/gHQJW1hv9V7yaFPStbZr+2MkNhedBHk3n01akddIGle+E1s8JOBXIgK2ZhLub07VfcUhAGrUNrbQA58PuuFDECgYEAzZu3TxUYY25FpIwLyCovY1/n2IGGcTm7g3dVokwwUOq64a7onhu+pJWZ7nwdqIIIl59/ghcqmDtZGGliEFakQb0sqeXPXSp7MbGiOeHzSepvdK2zI4suKr2LObKFu4uOPGuNioXKmnCSmu28gllb2pgGkwPMJBzkVkVtgxGnhVECgYEA7zEZCYBKoKADUpG2f+KHxhJ4pu91k041UwcZTvXENxEC2pcgGtRjksrBiv7g8i0z2Y+axAEaRYeG3pLNWO+jhdp0jTNpWpX69FO7p+P5+ApKPlegWO4QImmNqw1MeenI92FEX0/bH3TNsxpu3L6xivhx1DWkRZ2X6eDdR2i8cysCgYACATWtWLhPJ+EX9KGcxwSFRIcfLkwgSH7SjlRQa8vAzjkaQDlWaVDXi/nfQGiNnw70Y4K7wvwQVevNeCGTpTSey3hnA62c6/AdkOzTAaf8nYOOsK7hdtbxZb24x0vUg0zUu/u6UQmjrdtQFWdUIgjqPbc6sbvI0ltLmAu0TnTCsQKBgC/uidLil5Hanu/T7VtxPL4Pg4gIYmpTeNIbkRHGpDxYt1awhCl8ODv5T5GYA+Hj9wj5Aw2WHvqh7v/5MRdKZl1zannFPK5/cZu2j9tUDwqKnVgi3SoVAryypEYL0zB3DeOs5TOoYAPMt0/V0zN/LzrnEIBzA2lD7GZcvlsJ/QGjAoGBAIp/JZi+lOz4MDcn6BpXlDUcPrp+UeYdQqDhzqPADgM64zz0fOdPO5zu0WxhlJKRxUoFWfVSNmsurtJizM/yg6K+XSbRY5oOeB2iuBkQAzFIbIFxPyUiUVDCSwKntpeeJg/dkS9XKRL0PGse/CkApSF0Y8IoNayd/tPDcuRVTncE`;

describe('formatPrivateKey', () => {
  it('should return PEM key unchanged', () => {
    const result = formatPrivateKey(TEST_PRIVATE_KEY);
    expect(result).toBe(TEST_PRIVATE_KEY);
  });

  it('should format raw base64 key into PEM', () => {
    const result = formatPrivateKey(RAW_PRIVATE_KEY);
    expect(result).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(result).toContain('-----END RSA PRIVATE KEY-----');
    // Verify each line is max 64 characters
    const lines = result.split('\n');
    for (const line of lines) {
      if (!line.startsWith('-----')) {
        expect(line.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it('should strip "Kalshi key:" prefix', () => {
    const keyWithPrefix = `Kalshi key: ${RAW_PRIVATE_KEY}`;
    const result = formatPrivateKey(keyWithPrefix);
    expect(result).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(result).not.toContain('Kalshi key:');
  });

  it('should strip "KALSHI KEY:" prefix (case insensitive)', () => {
    const keyWithPrefix = `KALSHI KEY: ${RAW_PRIVATE_KEY}`;
    const result = formatPrivateKey(keyWithPrefix);
    expect(result).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(result).not.toContain('KALSHI KEY:');
  });

  it('should handle key with whitespace', () => {
    const keyWithWhitespace = RAW_PRIVATE_KEY.slice(0, 100) + '\n' + RAW_PRIVATE_KEY.slice(100);
    const result = formatPrivateKey(keyWithWhitespace);
    expect(result).toContain('-----BEGIN RSA PRIVATE KEY-----');
    // Should produce valid PEM without embedded newlines in the key data
  });
});

describe('buildSignatureMessage', () => {
  it('should build message with timestamp, method, and path', () => {
    const result = buildSignatureMessage('1234567890123', 'GET', '/trade-api/v2/portfolio/balance');
    expect(result).toBe('1234567890123GET/trade-api/v2/portfolio/balance');
  });

  it('should uppercase the method', () => {
    const result = buildSignatureMessage('1234567890123', 'get', '/trade-api/v2/portfolio/balance');
    expect(result).toBe('1234567890123GET/trade-api/v2/portfolio/balance');
  });

  it('should strip query parameters from path', () => {
    const result = buildSignatureMessage(
      '1234567890123',
      'GET',
      '/trade-api/v2/markets?limit=10&status=active'
    );
    expect(result).toBe('1234567890123GET/trade-api/v2/markets');
  });

  it('should handle POST method', () => {
    const result = buildSignatureMessage('1234567890123', 'POST', '/trade-api/v2/portfolio/orders');
    expect(result).toBe('1234567890123POST/trade-api/v2/portfolio/orders');
  });

  it('should handle DELETE method', () => {
    const result = buildSignatureMessage(
      '1234567890123',
      'DELETE',
      '/trade-api/v2/portfolio/orders/abc123'
    );
    expect(result).toBe('1234567890123DELETE/trade-api/v2/portfolio/orders/abc123');
  });
});

describe('signMessage', () => {
  it('should produce a valid base64 signature', () => {
    const message = '1234567890123GET/trade-api/v2/portfolio/balance';
    const signature = signMessage(message, TEST_PRIVATE_KEY);

    // Verify it's valid base64
    expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    expect(signature.length).toBeGreaterThan(0);
  });

  it('should produce consistent signatures for the same input', () => {
    // Note: RSA-PSS is probabilistic due to random salt, so signatures will differ
    // But both should be valid
    const message = '1234567890123GET/trade-api/v2/portfolio/balance';
    const sig1 = signMessage(message, TEST_PRIVATE_KEY);
    const sig2 = signMessage(message, TEST_PRIVATE_KEY);

    // Both should be valid signatures (verifiable with public key)
    expect(verifySignature(message, sig1, TEST_PUBLIC_KEY)).toBe(true);
    expect(verifySignature(message, sig2, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should produce verifiable RSA-PSS signature', () => {
    const message = '1234567890123GET/trade-api/v2/portfolio/balance';
    const signature = signMessage(message, TEST_PRIVATE_KEY);

    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should fail verification with wrong message', () => {
    const message = '1234567890123GET/trade-api/v2/portfolio/balance';
    const signature = signMessage(message, TEST_PRIVATE_KEY);

    const wrongMessage = '1234567890123POST/trade-api/v2/portfolio/balance';
    expect(verifySignature(wrongMessage, signature, TEST_PUBLIC_KEY)).toBe(false);
  });
});

describe('signRequest', () => {
  it('should sign a GET request', () => {
    const signature = signRequest(
      'GET',
      '/trade-api/v2/portfolio/balance',
      '1234567890123',
      TEST_PRIVATE_KEY
    );

    const message = buildSignatureMessage('1234567890123', 'GET', '/trade-api/v2/portfolio/balance');
    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should sign a POST request', () => {
    const signature = signRequest(
      'POST',
      '/trade-api/v2/portfolio/orders',
      '1234567890123',
      TEST_PRIVATE_KEY
    );

    const message = buildSignatureMessage('1234567890123', 'POST', '/trade-api/v2/portfolio/orders');
    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should handle raw key without PEM headers', () => {
    const signature = signRequest(
      'GET',
      '/trade-api/v2/portfolio/balance',
      '1234567890123',
      RAW_PRIVATE_KEY
    );

    const message = buildSignatureMessage('1234567890123', 'GET', '/trade-api/v2/portfolio/balance');
    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should strip query params before signing', () => {
    const signature = signRequest(
      'GET',
      '/trade-api/v2/markets?limit=10',
      '1234567890123',
      TEST_PRIVATE_KEY
    );

    // Verify against message WITHOUT query params
    const message = buildSignatureMessage('1234567890123', 'GET', '/trade-api/v2/markets');
    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });
});

describe('getAuthHeaders', () => {
  it('should return all required headers', () => {
    const headers = getAuthHeaders(
      'GET',
      '/trade-api/v2/portfolio/balance',
      'test-api-key-id',
      TEST_PRIVATE_KEY
    );

    expect(headers).toHaveProperty('Content-Type', 'application/json');
    expect(headers).toHaveProperty('KALSHI-ACCESS-KEY', 'test-api-key-id');
    expect(headers).toHaveProperty('KALSHI-ACCESS-SIGNATURE');
    expect(headers).toHaveProperty('KALSHI-ACCESS-TIMESTAMP');
  });

  it('should generate valid timestamp', () => {
    const beforeMs = Date.now();
    const headers = getAuthHeaders(
      'GET',
      '/trade-api/v2/portfolio/balance',
      'test-api-key-id',
      TEST_PRIVATE_KEY
    );
    const afterMs = Date.now();

    const timestamp = parseInt(headers['KALSHI-ACCESS-TIMESTAMP'], 10);
    expect(timestamp).toBeGreaterThanOrEqual(beforeMs);
    expect(timestamp).toBeLessThanOrEqual(afterMs);
  });

  it('should produce verifiable signature', () => {
    const headers = getAuthHeaders(
      'GET',
      '/trade-api/v2/portfolio/balance',
      'test-api-key-id',
      TEST_PRIVATE_KEY
    );

    const message = buildSignatureMessage(
      headers['KALSHI-ACCESS-TIMESTAMP'],
      'GET',
      '/trade-api/v2/portfolio/balance'
    );
    expect(verifySignature(message, headers['KALSHI-ACCESS-SIGNATURE'], TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should handle different HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      const headers = getAuthHeaders(
        method,
        '/trade-api/v2/test',
        'test-api-key-id',
        TEST_PRIVATE_KEY
      );

      expect(headers['KALSHI-ACCESS-KEY']).toBe('test-api-key-id');
      expect(headers['KALSHI-ACCESS-SIGNATURE']).toBeTruthy();
      expect(headers['KALSHI-ACCESS-TIMESTAMP']).toBeTruthy();
    }
  });
});

describe('verifySignature', () => {
  it('should return true for valid signature', () => {
    const message = 'test message';
    const signature = signMessage(message, TEST_PRIVATE_KEY);

    expect(verifySignature(message, signature, TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should return false for invalid signature', () => {
    const message = 'test message';
    const invalidSignature = 'aW52YWxpZCBzaWduYXR1cmU='; // base64 "invalid signature"

    expect(verifySignature(message, invalidSignature, TEST_PUBLIC_KEY)).toBe(false);
  });

  it('should return false for tampered message', () => {
    const message = 'original message';
    const signature = signMessage(message, TEST_PRIVATE_KEY);

    expect(verifySignature('tampered message', signature, TEST_PUBLIC_KEY)).toBe(false);
  });

  it('should return false for malformed signature', () => {
    expect(verifySignature('test', 'not-base64!!!', TEST_PUBLIC_KEY)).toBe(false);
  });
});

describe('Integration: Full Auth Flow', () => {
  it('should generate auth headers matching Kalshi API requirements', () => {
    const apiKeyId = 'f67f0b70-0c13-4bf1-9e7e-3a9734bb086f';
    const path = '/trade-api/v2/portfolio/balance';

    const headers = getAuthHeaders('GET', path, apiKeyId, TEST_PRIVATE_KEY);

    // Verify header structure
    expect(headers['KALSHI-ACCESS-KEY']).toBe(apiKeyId);
    expect(headers['KALSHI-ACCESS-TIMESTAMP']).toMatch(/^\d{13}$/); // 13-digit timestamp (ms)
    expect(headers['KALSHI-ACCESS-SIGNATURE']).toMatch(/^[A-Za-z0-9+/]+=*$/); // valid base64

    // Verify signature is cryptographically valid
    const message = buildSignatureMessage(headers['KALSHI-ACCESS-TIMESTAMP'], 'GET', path);
    expect(verifySignature(message, headers['KALSHI-ACCESS-SIGNATURE'], TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should work with markets endpoint with query params', () => {
    const path = '/trade-api/v2/markets?limit=100&status=active';
    const headers = getAuthHeaders('GET', path, 'test-key', TEST_PRIVATE_KEY);

    // Signature should be based on path WITHOUT query params
    const signedPath = '/trade-api/v2/markets';
    const message = buildSignatureMessage(headers['KALSHI-ACCESS-TIMESTAMP'], 'GET', signedPath);
    expect(verifySignature(message, headers['KALSHI-ACCESS-SIGNATURE'], TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should work with order creation (POST)', () => {
    const path = '/trade-api/v2/portfolio/orders';
    const headers = getAuthHeaders('POST', path, 'test-key', TEST_PRIVATE_KEY);

    const message = buildSignatureMessage(headers['KALSHI-ACCESS-TIMESTAMP'], 'POST', path);
    expect(verifySignature(message, headers['KALSHI-ACCESS-SIGNATURE'], TEST_PUBLIC_KEY)).toBe(true);
  });

  it('should work with order cancellation (DELETE)', () => {
    const path = '/trade-api/v2/portfolio/orders/order-id-123';
    const headers = getAuthHeaders('DELETE', path, 'test-key', TEST_PRIVATE_KEY);

    const message = buildSignatureMessage(headers['KALSHI-ACCESS-TIMESTAMP'], 'DELETE', path);
    expect(verifySignature(message, headers['KALSHI-ACCESS-SIGNATURE'], TEST_PUBLIC_KEY)).toBe(true);
  });
});
