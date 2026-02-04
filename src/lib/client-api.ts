export const API_KEY_STORAGE = 'KALSHI_APP_API_KEY';

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(API_KEY_STORAGE);
}

export function setStoredApiKey(apiKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(API_KEY_STORAGE, apiKey);
}

export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(API_KEY_STORAGE);
}

export function getApiHeaders(): HeadersInit {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    return {};
  }
  return {
    'X-API-Key': apiKey,
  };
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const apiHeaders = getApiHeaders();
  Object.entries(apiHeaders).forEach(([key, value]) => {
    if (value !== undefined) {
      headers.set(key, value);
    }
  });

  return fetch(input, {
    ...init,
    headers,
  });
}
