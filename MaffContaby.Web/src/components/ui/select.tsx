import { type SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className = '', id, children, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 tracking-[0.2px]">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={[
              'h-[42px] pl-3.5 pr-9 rounded border-[1.5px] bg-gray-50 text-sm font-sans',
              'outline-none transition-all duration-150 w-full cursor-pointer appearance-none',
              error
                ? 'border-[#D32F2F] focus:border-[#D32F2F] focus:shadow-[0_0_0_3px_rgba(211,47,47,0.10)]'
                : 'border-gray-200 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]',
              'disabled:opacity-55 disabled:cursor-not-allowed',
              className,
            ].join(' ')}
            {...props}
          >
            {children}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {error ? (
          <p className="text-xs font-semibold text-[#D32F2F]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';
