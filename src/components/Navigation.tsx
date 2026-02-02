"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/research", label: "Research", icon: "🔬" },
  { href: "/strategy", label: "Strategy", icon: "🎯" },
  { href: "/analysis", label: "Analysis", icon: "📊" },
  { href: "/explorer", label: "Markets", icon: "🌐" },
  { href: "/orders", label: "Orders", icon: "📋" },
  { href: "/portfolio", label: "Portfolio", icon: "💼" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <span className="text-xl font-bold text-white">🎲 Kalshi Trading</span>
            <div className="flex space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-purple-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-gray-500">Demo Mode</span>
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </nav>
  );
}
