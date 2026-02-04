import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🔍</div>
        <h2 className="text-xl font-bold text-white">Page Not Found</h2>
        <p className="text-zinc-400 text-sm">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
