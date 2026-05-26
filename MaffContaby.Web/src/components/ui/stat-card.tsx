import type { ReactNode } from 'react';

type ValueColor = 'default' | 'success' | 'danger' | 'info';

interface StatCardProps {
  label: string;
  value: ReactNode;
  valueColor?: ValueColor;
  sub?: ReactNode;
  icon?: ReactNode;
}

const valueColorMap: Record<ValueColor, string> = {
  default: 'text-gray-800',
  success: 'text-[#006666]',
  danger: 'text-[#D32F2F]',
  info: 'text-[#6699CC]',
};

export function StatCard({ label, value, valueColor = 'default', sub, icon }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">{label}</span>
        {icon ? <span className="text-gray-400 shrink-0">{icon}</span> : null}
      </div>
      <div className={['font-display text-2xl font-bold tracking-tight leading-none', valueColorMap[valueColor]].join(' ')}>
        {value}
      </div>
      {sub ? <div className="text-[11px] text-gray-400">{sub}</div> : null}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col gap-2 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 rounded" />
      <div className="h-7 w-28 bg-gray-200 rounded" />
    </div>
  );
}
