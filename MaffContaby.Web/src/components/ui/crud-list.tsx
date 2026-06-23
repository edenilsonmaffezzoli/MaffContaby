import { Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from './button';

interface CrudRowProps {
  children: ReactNode;
  actions?: ReactNode;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editContent?: ReactNode;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  canSave?: boolean;
  isSaving?: boolean;
  deleteLabel?: string;
  trailing?: ReactNode;
}

export function CrudRow({
  children,
  disabled,
  onEdit,
  onDelete,
  isEditing,
  editContent,
  onSaveEdit,
  onCancelEdit,
  canSave,
  isSaving,
  deleteLabel = 'Excluir?',
  trailing,
}: CrudRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isEditing) {
    return (
      <div className="px-4 py-4 bg-gray-50 border-b border-gray-100 last:border-b-0">
        {editContent}
        <div className="flex gap-2 mt-3">
          <Button variant="success" size="sm" loading={isSaving} disabled={!canSave || isSaving} onClick={onSaveEdit}>
            Salvar
          </Button>
          <Button variant="default" size="sm" onClick={onCancelEdit} disabled={isSaving}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
      <div className="flex-1 min-w-0">{children}</div>

      {onDelete && confirmDelete ? (
        <div className="flex items-center gap-1.5 bg-[#FFEBEE] border border-[rgba(211,47,47,0.2)] rounded-lg px-3 py-1.5 shrink-0">
          <span className="text-xs font-semibold text-[#B71C1C]">{deleteLabel}</span>
          <button
            type="button"
            onClick={() => { onDelete(); setConfirmDelete(false); }}
            disabled={disabled}
            className="text-[11px] font-bold text-[#D32F2F] hover:text-[#B71C1C] px-1 transition-colors disabled:opacity-50"
          >
            Sim
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-[11px] font-bold text-gray-500 hover:text-gray-700 px-1 transition-colors"
          >
            Não
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Editar"
            >
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={disabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-[#FFEBEE] hover:text-[#D32F2F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
}

interface CrudTableProps {
  heading?: string;
  badge?: ReactNode;
  children: ReactNode;
}

export function CrudTable({ heading, badge, children }: CrudTableProps) {
  return (
    <>
      {(heading || badge) && (
        <div className="flex items-center justify-between mb-4">
          {heading && <h2 className="text-[15px] font-semibold text-gray-800 m-0">{heading}</h2>}
          {badge}
        </div>
      )}
      <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
        {children}
      </div>
    </>
  );
}

export function CrudTableHead({ cols }: { cols: { label: string; align?: 'left' | 'right' | 'center' }[] }) {
  return (
    <div className="grid bg-gray-50 px-4 py-2.5 border-b border-gray-200"
      style={{ gridTemplateColumns: `1fr repeat(${cols.length - 1}, auto)` }}>
      {cols.map(c => (
        <div
          key={c.label}
          className={[
            'text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500',
            c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '',
          ].join(' ')}
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}
