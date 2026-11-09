'use client';

import { Button } from '@pbl/ui';

export function ConfirmResultSheet({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onDismiss,
  pending,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly pending: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-sheet-title"
      data-testid="confirm-result-sheet"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
        <h2 id="confirm-sheet-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-700">{description}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            data-testid="confirm-sheet-submit"
          >
            {confirmLabel}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onDismiss}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
