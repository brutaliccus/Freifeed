interface ConfirmDeleteBabyModalProps {
  babyName: string
  open: boolean
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDeleteBabyModal({
  babyName,
  open,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDeleteBabyModalProps) {
  if (!open) return null

  return (
    <div className="modal-overlay confirm-delete-overlay" role="presentation" onClick={onCancel}>
      <div
        className="sheet confirm-delete-sheet"
        role="alertdialog"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-delete-title">Delete {babyName}?</h2>
        <p id="confirm-delete-desc" className="muted">
          This removes the baby from your household. You cannot undo this action. Babies with feedings or
          medicines cannot be deleted.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal__footer confirm-delete-sheet__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-danger--confirm confirm-delete-sheet__delete"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete baby'}
          </button>
        </div>
      </div>
    </div>
  )
}
