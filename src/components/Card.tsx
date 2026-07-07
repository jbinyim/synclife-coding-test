import { memo } from 'react'
import type { Task } from '../types'

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/**
 * memo: 5,000개 중 카드 하나만 바뀌어도 나머지가 다시 그려지지 않게 한다.
 * (overlay/서버 갱신은 바뀐 태스크 객체만 새로 만들고 나머지는 참조를 유지하므로 유효)
 */
export const Card = memo(function Card({ task }: { task: Task }) {
  return (
    <article
      className={`card priority-${task.priority}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
    >
      <div className="card-title" title={task.title}>
        {task.title}
      </div>
      <div className="card-meta">
        <span className={`badge badge-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
        <span className="date">{new Date(task.createdAt).toLocaleDateString()}</span>
      </div>
    </article>
  )
})
