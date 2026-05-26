import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'primary' | 'success' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  default:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm',
  primary:
    'border border-primary bg-primary text-white hover:bg-primary-hover hover:border-primary-hover hover:shadow-md',
  success:
    'border border-[#006666] bg-[#006666] text-white hover:bg-[#005555] hover:border-[#005555] hover:shadow-md',
  danger:
    'border border-gray-200 bg-transparent text-[#D32F2F] hover:bg-[#FFEBEE] hover:border-[#D32F2F]',
  ghost:
    'border border-transparent bg-transparent text-primary hover:bg-primary-light',
  outline:
    'border border-primary bg-transparent text-primary hover:bg-primary-light',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-[42px] px-[18px] text-[13px] gap-2',
  lg: 'h-11 px-6 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', loading, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center rounded font-semibold font-sans',
          'transition-all duration-150 cursor-pointer whitespace-nowrap select-none',
          'active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
