import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-1">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.4px] text-gray-800 leading-tight m-0">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 mt-1">{action}</div> : null}
    </div>
  );
}
