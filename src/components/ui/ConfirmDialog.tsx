import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}

export function ConfirmDialog({
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#15151b]/45 p-5 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-[400px] rounded-[22px] bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,.22)] dark:bg-[#22222a]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle size={18} />
          </div>
          <button
            aria-label="Close confirmation"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-[#f4f4f7]"
            onClick={onCancel}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-ink dark:text-white">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted dark:text-white/45">
          {description}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            className="min-h-10 rounded-xl border border-[#e4e4ea] text-xs font-semibold text-ink dark:border-white/10 dark:text-white"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-700"
            onClick={onConfirm}
            type="button"
          >
            Delete course
          </button>
        </div>
      </div>
    </div>
  );
}
