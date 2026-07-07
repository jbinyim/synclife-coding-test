import { memo } from 'react'
import type { Task } from '../types'

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface Props {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

/**
 * memo: 5,000개 중 카드 하나만 바뀌어도 나머지가 다시 그려지지 않게 한다.
 * (overlay/서버 갱신은 바뀐 태스크 객체만 새로 만들고 나머지는 참조를 유지하므로 유효.
 *  onEdit/onDelete 는 Board 에서 useCallback 으로 참조가 고정되어 있어야 한다)
 */
export const Card = memo(function Card({ task, onEdit, onDelete }: Props) {
  // 생성 확정 전(temp id) 카드: 서버가 모르는 id 라 이동·수정·삭제 불가 (DECISIONS 6번)
  const isPending = task.id.startsWith('temp-')

  return (
    <article
      className={`card priority-${task.priority}${isPending ? ' card-pending' : ''}`}
      draggable={!isPending}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      onClick={() => {
        if (!isPending) onEdit(task)
      }}
    >
      <div className="card-title" title={task.title}>
        {task.title}
      </div>
      {!isPending && (
        <button
          type="button"
          className="card-delete"
          aria-label={`${task.title} 삭제`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task)
          }}
        >
          ×
        </button>
      )}
      <div className="card-meta">
        <span className={`badge badge-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
        <span className="date">
          {isPending ? '저장 중…' : new Date(task.createdAt).toLocaleDateString()}
        </span>
      </div>
    </article>
  )
})
