import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-1">
      <div className="min-w-0">
        <h1 className="hidden lg:block text-[26px] font-bold tracking-[-0.4px] text-gray-800 leading-tight m-0">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {action ? (
        <div className="shrink-0 w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}
