import { formatCompetencia, formatCompetenciaLabel } from '@/utils/format';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = [
  { value: '01', label: 'jan' },
  { value: '02', label: 'fev' },
  { value: '03', label: 'mar' },
  { value: '04', label: 'abr' },
  { value: '05', label: 'mai' },
  { value: '06', label: 'jun' },
  { value: '07', label: 'jul' },
  { value: '08', label: 'ago' },
  { value: '09', label: 'set' },
  { value: '10', label: 'out' },
  { value: '11', label: 'nov' },
  { value: '12', label: 'dez' },
] as const;

interface CompetenciaMultiSelectProps {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  hint?: string;
}

function sortCompetencias(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function displayValue(values: string[]) {
  if (values.length === 0) return 'Selecione…';
  if (values.length === 1) return formatCompetenciaLabel(values[0]);
  return `${values.length} competências selecionadas`;
}

export function CompetenciaMultiSelect({
  label = 'Competência',
  value,
  onChange,
  disabled = false,
  hint,
}: CompetenciaMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    if (value.length > 0) return Number(value[0].slice(0, 4));
    return new Date().getFullYear();
  });

  const sortedValue = useMemo(() => sortCompetencias(value), [value]);

  useEffect(() => {
    if (!open) return;
    if (value.length > 0) {
      setViewYear(Number(value[value.length - 1].slice(0, 4)));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleMonth = (month: string) => {
    const key = `${viewYear}-${month}`;
    if (value.includes(key)) {
      onChange(value.filter(item => item !== key));
      return;
    }
    onChange(sortCompetencias([...value, key]));
  };

  const selectCurrentMonth = () => {
    const current = formatCompetencia(new Date());
    if (value.includes(current)) return;
    onChange(sortCompetencias([...value, current]));
    setViewYear(Number(current.slice(0, 4)));
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5 min-w-[220px]">
      {label ? (
        <span className="text-xs font-semibold text-gray-500 tracking-[0.2px]">{label}</span>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={[
          'h-[42px] px-3.5 rounded border-[1.5px] bg-gray-50 text-sm font-sans w-full',
          'outline-none transition-all duration-150 text-left flex items-center gap-2',
          open
            ? 'border-primary bg-white shadow-[0_0_0_3px_rgba(0,102,102,0.10)]'
            : 'border-gray-200 hover:border-gray-300',
          'disabled:opacity-55 disabled:cursor-not-allowed',
          value.length === 0 ? 'text-gray-400' : 'text-gray-800',
        ].join(' ')}
      >
        <Calendar size={15} className="text-gray-400 shrink-0" />
        <span className="flex-1 truncate">{displayValue(sortedValue)}</span>
      </button>

      {sortedValue.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sortedValue.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-light text-primary"
            >
              {formatCompetenciaLabel(item)}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(value.filter(current => current !== item))}
                  className="inline-flex items-center justify-center rounded-full hover:bg-[rgba(0,102,102,0.12)]"
                  aria-label={`Remover ${formatCompetenciaLabel(item)}`}
                >
                  <X size={12} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {open && !disabled ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-[260px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear(year => year - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-800">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear(year => year + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Próximo ano"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map(month => {
              const key = `${viewYear}-${month.value}`;
              const selected = value.includes(key);
              return (
                <button
                  key={month.value}
                  type="button"
                  onClick={() => toggleMonth(month.value)}
                  className={[
                    'h-9 rounded-md text-xs font-semibold transition-colors',
                    selected
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {month.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-semibold text-gray-500 hover:text-gray-700"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={selectCurrentMonth}
              className="font-semibold text-primary hover:text-[#005050]"
            >
              Este mês
            </button>
          </div>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}
