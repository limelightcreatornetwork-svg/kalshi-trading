/**
 * Kalshi RSA-PSS Authentication Module
 *
 * Implements RSA-PSS SHA256 signature generation for Kalshi API authentication.
 * Signature format: RSA-PSS(SHA256, timestamp_ms + method + path)
 *
 * Headers required:
 * - KALSHI-ACCESS-KEY: API Key ID
 * - KALSHI-ACCESS-SIGNATURE: Base64 encoded RSA-PSS signature
 * - KALSHI-ACCESS-TIMESTAMP: Unix timestamp in milliseconds
 */

import crypto from 'crypto';

/**
 * Format a raw base64 RSA private key into PEM format
 * Handles keys with or without "Kalshi key:" prefix
 */
export function formatPrivateKey(key: string): string {
  // If already formatted with headers, return as-is
  if (key.includes('-----BEGIN')) {
    return key;
  }

  // Remove common prefixes like "Kalshi key: " (case-insensitive)
  let cleanKey = key.replace(/^kalshi\s*key:\s*/i, '');

  // Remove any whitespace/newlines
  cleanKey = cleanKey.replace(/\s/g, '');

  // Split into 64-character lines (PEM format requirement)
  const lines: string[] = [];
  for (let i = 0; i < cleanKey.length; i += 64) {
    lines.push(cleanKey.slice(i, i + 64));
  }

  // Wrap with RSA PRIVATE KEY headers
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
}

/**
 * Build the message to be signed for Kalshi API requests
 * Format: timestamp_ms + HTTP_METHOD + path (without query params)
 */
export function buildSignatureMessage(
  timestampMs: string,
  method: string,
  path: string
): string {
  // Strip query parameters before signing
  const pathWithoutQuery = path.split('?')[0];
  return `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`;
}

/**
 * Sign a message using RSA-PSS with SHA256
 * Uses salt length equal to digest length (RSA_PSS_SALTLEN_DIGEST)
 */
export function signMessage(message: string, privateKeyPem: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();

  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return signature.toString('base64');
}

/**
 * Generate RSA-PSS signature for a Kalshi API request
 * Returns base64-encoded signature
 */
export function signRequest(
  method: string,
  path: string,
  timestampMs: string,
  privateKey: string
): string {
  const message = buildSignatureMessage(timestampMs, method, path);
  const pemKey = formatPrivateKey(privateKey);
  return signMessage(message, pemKey);
}

/**
 * Generate authentication headers for a Kalshi API request
 */
export function getAuthHeaders(
  method: string,
  path: string,
  apiKeyId: string,
  privateKey: string
): Record<string, string> {
  const timestampMs = Date.now().toString();
  const signature = signRequest(method, path, timestampMs, privateKey);

  return {
    'Content-Type': 'application/json',
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestampMs,
  };
}

/**
 * Verify an RSA-PSS signature (for testing purposes)
 */
export function verifySignature(
  message: string,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(message);
    verify.end();

    return verify.verify(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}
