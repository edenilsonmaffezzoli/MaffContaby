import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
      {icon ? (
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        {description ? <p className="text-xs text-gray-400 mt-1">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
