import { useEffect } from 'react'

interface Props {
  message: string
  onClose: () => void
}

/** 실패 알림용 간단 토스트. 4초 후 자동 소멸, 수동 닫기 가능. */
export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [message, onClose])

  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onClose} aria-label="알림 닫기">
        ×
      </button>
    </div>
  )
}
