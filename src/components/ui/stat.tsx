import { ReactNode } from 'react';

interface StatProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: ReactNode;
  className?: string;
}

const trendStyles = {
  up: 'text-green-400',
  down: 'text-red-400',
  neutral: 'text-zinc-400',
};

const trendIcons = {
  up: '↑',
  down: '↓',
  neutral: '→',
};

export function Stat({
  label,
  value,
  trend,
  trendValue,
  icon,
  className = '',
}: StatProps) {
  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {trend && trendValue && (
          <span className={`text-sm font-medium ${trendStyles[trend]}`}>
            {trendIcons[trend]} {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}

export function StatGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {children}
    </div>
  );
}
