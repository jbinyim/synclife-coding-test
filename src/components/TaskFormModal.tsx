import { useState } from 'react'
import type { Task, Priority, Status } from '../types'
import type { NewTaskInput } from '../hooks/useTasks'

interface Props {
  /** 수정 모드면 대상 태스크, 생성 모드면 null */
  task: Task | null
  onSubmit: (input: NewTaskInput) => void
  onClose: () => void
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES: { value: Status; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

/** 생성/수정 겸용 폼 모달. 제목·우선순위 필수, 설명 선택 (과제 명세) */
export function TaskFormModal({ task, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [status, setStatus] = useState<Status>(task?.status ?? 'todo')
  const [description, setDescription] = useState(task?.description ?? '')

  const trimmedTitle = title.trim()
  const canSubmit = trimmedTitle.length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      title: trimmedTitle,
      priority,
      status,
      description: description.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={task ? '태스크 수정' : '새 태스크'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{task ? '태스크 수정' : '새 태스크'}</h3>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">
              제목 <em className="required">*</em>
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="무엇을 해야 하나요?"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">
                우선순위 <em className="required">*</em>
              </span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">설명</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="선택 사항"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {task ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
