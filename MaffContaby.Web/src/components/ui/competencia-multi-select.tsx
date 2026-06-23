import { Button } from '@/components/ui/button';
import { formatCompetencia, formatCompetenciaLabel } from '@/utils/format';
import { Calendar, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const MONTHS = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
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

function buildVisibleYears(selected: string[], currentYear: number) {
  const years = new Set<number>([currentYear]);
  for (const item of selected) {
    const year = Number(item.slice(0, 4));
    if (year > currentYear) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

function YearSection(props: {
  year: number;
  selected: Set<string>;
  onToggle: (competencia: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <h3 className="m-0 text-sm font-semibold text-gray-800">{props.year}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-6 sm:grid-flow-col gap-2 p-4">
        {MONTHS.map(month => {
          const competencia = `${props.year}-${month.value}`;
          const checked = props.selected.has(competencia);
          const inputId = `competencia-${props.year}-${month.value}`;
          return (
            <label
              key={competencia}
              htmlFor={inputId}
              className={[
                'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                checked
                  ? 'border-primary/30 bg-primary-light'
                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50',
                props.disabled ? 'opacity-55 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={props.disabled}
                onChange={() => props.onToggle(competencia)}
                className="h-4 w-4 rounded border-gray-300 accent-[#006666] shrink-0"
              />
              <span className="text-sm text-gray-700">{month.label}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function CompetenciaMultiSelect({
  label = 'Competência',
  value,
  onChange,
  disabled = false,
  hint,
}: CompetenciaMultiSelectProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const sortedValue = useMemo(() => sortCompetencias(value), [value]);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [visibleYears, setVisibleYears] = useState<number[]>([currentYear]);

  const draftSet = useMemo(() => new Set(draft), [draft]);
  const nextFutureYear = Math.max(...visibleYears, currentYear) + 1;

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  const openModal = () => {
    if (disabled) return;
    setDraft(sortedValue);
    setVisibleYears(buildVisibleYears(sortedValue, currentYear));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const toggleDraft = (competencia: string) => {
    setDraft(current =>
      current.includes(competencia)
        ? current.filter(item => item !== competencia)
        : sortCompetencias([...current, competencia]),
    );
  };

  const handleConfirm = () => {
    onChange(sortCompetencias(draft));
    closeModal();
  };

  const handleAddFutureYear = () => {
    setVisibleYears(current =>
      current.includes(nextFutureYear) ? current : [...current, nextFutureYear].sort((a, b) => a - b),
    );
  };

  const handleSelectCurrentMonth = () => {
    const currentMonth = formatCompetencia(new Date());
    if (draftSet.has(currentMonth)) return;
    setDraft(prev => sortCompetencias([...prev, currentMonth]));
    const year = Number(currentMonth.slice(0, 4));
    if (year > currentYear) {
      setVisibleYears(years => (years.includes(year) ? years : [...years, year].sort((a, b) => a - b)));
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1.5 min-w-[220px]">
        {label ? (
          <span className="text-xs font-semibold text-gray-500 tracking-[0.2px]">{label}</span>
        ) : null}

        <button
          type="button"
          disabled={disabled}
          onClick={openModal}
          className={[
            'h-[42px] px-3.5 rounded border-[1.5px] bg-gray-50 text-sm font-sans w-full',
            'outline-none transition-all duration-150 text-left flex items-center gap-2',
            'border-gray-200 hover:border-gray-300 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]',
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

        {hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
      </div>

      {modalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Fechar seleção de competências"
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                onClick={closeModal}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="competencia-modal-title"
                className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                  <div>
                    <h2 id="competencia-modal-title" className="m-0 text-base font-semibold text-gray-800">
                      Selecionar competências
                    </h2>
                    <p className="m-0 mt-1 text-sm text-gray-500">
                      Marque os meses desejados. O ano vigente já está disponível; use &quot;Mais competência&quot; para anos futuros.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                  {visibleYears.map(year => (
                    <YearSection
                      key={year}
                      year={year}
                      selected={draftSet}
                      onToggle={toggleDraft}
                    />
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={handleAddFutureYear}
                  >
                    <Plus size={14} />
                    Mais competência ({nextFutureYear})
                  </Button>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDraft([])}>
                      Limpar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={handleSelectCurrentMonth}>
                      Este mês
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="default" size="sm" onClick={closeModal}>
                      Cancelar
                    </Button>
                    <Button type="button" variant="primary" size="sm" onClick={handleConfirm}>
                      Confirmar{draft.length > 0 ? ` (${draft.length})` : ''}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
