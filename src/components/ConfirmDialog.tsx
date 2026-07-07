interface Props {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** 삭제 등 파괴적 동작의 확인 다이얼로그 */
export function ConfirmDialog({ message, confirmLabel = '삭제', onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label="삭제 확인"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-message">{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel} autoFocus>
            취소
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
