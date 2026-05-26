import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}

export function Card({ children, className = '', noPad }: CardProps) {
  return (
    <div
      className={[
        'bg-white border border-gray-200 rounded-lg shadow-sm',
        noPad ? '' : 'p-6',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className = '' }: CardHeaderProps) {
  return (
    <div className={['flex items-start justify-between gap-4 mb-5', className].join(' ')}>
      <div>
        <h2 className="text-[15px] font-semibold text-gray-800 m-0">{title}</h2>
        {description ? <p className="text-[13px] text-gray-500 mt-0.5">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
