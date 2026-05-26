import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-gray-500 tracking-[0.2px]"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={[
            'h-[42px] px-3.5 rounded border-[1.5px] bg-gray-50 text-sm font-sans',
            'outline-none transition-all duration-150 w-full',
            error
              ? 'border-[#D32F2F] focus:border-[#D32F2F] focus:shadow-[0_0_0_3px_rgba(211,47,47,0.10)]'
              : 'border-gray-200 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]',
            'disabled:opacity-55 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        />
        {error ? (
          <p className="text-xs font-semibold text-[#D32F2F]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 tracking-[0.2px]">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          className={[
            'px-3.5 py-2.5 rounded border-[1.5px] bg-gray-50 text-sm font-sans',
            'outline-none transition-all duration-150 w-full resize-vertical',
            error
              ? 'border-[#D32F2F] focus:border-[#D32F2F] focus:shadow-[0_0_0_3px_rgba(211,47,47,0.10)]'
              : 'border-gray-200 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]',
            'disabled:opacity-55 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
          {...props}
        />
        {error ? (
          <p className="text-xs font-semibold text-[#D32F2F]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
