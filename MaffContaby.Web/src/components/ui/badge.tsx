import type { ReactNode } from 'react';

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  success: 'bg-[rgba(0,102,102,0.10)] text-[#005050]',
  danger: 'bg-[#FFEBEE] text-[#B71C1C]',
  warning: 'bg-[#FFF3E0] text-[#E65100]',
  info: 'bg-[rgba(102,153,204,0.16)] text-[#003366]',
  neutral: 'bg-gray-100 text-gray-600',
  primary: 'bg-primary-light text-primary',
};

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full tracking-[0.2px]',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
