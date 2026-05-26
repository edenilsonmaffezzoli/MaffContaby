interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-[3px]',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      className={[
        'inline-block rounded-full border-current border-t-transparent animate-spin shrink-0',
        sizeMap[size],
        className,
      ].join(' ')}
      aria-hidden="true"
    />
  );
}

interface StatusMessageProps {
  type: 'loading' | 'error' | 'success';
  children: React.ReactNode;
}

const statusStyles = {
  loading: 'bg-[rgba(102,153,204,0.16)] text-[#003366] border border-[rgba(2,136,209,0.2)]',
  error: 'bg-[#FFEBEE] text-[#B71C1C] border border-[rgba(211,47,47,0.2)]',
  success: 'bg-[rgba(0,102,102,0.10)] text-[#005050] border border-[rgba(0,102,102,0.2)]',
};

export function StatusMessage({ type, children }: StatusMessageProps) {
  return (
    <div className={['flex items-center gap-2.5 px-4 py-3 rounded text-sm font-medium mt-3', statusStyles[type]].join(' ')}>
      {type === 'loading' ? <Spinner size="sm" /> : null}
      {children}
    </div>
  );
}
