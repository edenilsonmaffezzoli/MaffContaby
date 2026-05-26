import { AlertTriangle } from 'lucide-react';
import { Button } from './button';

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded z-10 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="flex flex-col items-center gap-3 text-center max-w-[240px]">
        <div className="w-10 h-10 rounded-xl bg-[#FFEBEE] flex items-center justify-center text-[#D32F2F]">
          <AlertTriangle size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
