'use client';

import { useState } from 'react';
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from '@/lib/client-api';

export default function ApiKeyControl() {
  const [hasKey, setHasKey] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!getStoredApiKey();
  });

  const handleSetKey = () => {
    const value = window.prompt('Enter API key for dashboard requests');
    if (!value) {
      return;
    }
    setStoredApiKey(value.trim());
    setHasKey(true);
  };

  const handleClearKey = () => {
    clearStoredApiKey();
    setHasKey(false);
  };

  return (
    <button
      type="button"
      onClick={hasKey ? handleClearKey : handleSetKey}
      className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
        hasKey
          ? 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10'
          : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'
      }`}
      title={hasKey ? 'Clear stored API key' : 'Set API key for API access'}
    >
      {hasKey ? 'API Key Set' : 'Set API Key'}
    </button>
  );
}
