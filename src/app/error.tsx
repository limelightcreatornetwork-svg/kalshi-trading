'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">⚠️</div>
        <h2 className="text-xl font-bold text-white">Something went wrong</h2>
        <p className="text-zinc-400 text-sm">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
