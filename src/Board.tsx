import { useMemo } from 'react'
import type { Task, Status } from './types'
import { useTasks } from './hooks/useTasks'
import { Column } from './components/Column'
import { Toast } from './components/Toast'

const COLUMNS: { status: Status; title: string }[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in-progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
]

export default function Board() {
  const { state, viewTasks, retry, mutateTask, toast, dismissToast } = useTasks()

  // 낙관적 이동: overlay 에 즉시 반영되고, 서버 전송·롤백은 useTasks 큐가 처리한다.
  const moveTask = (id: string, status: Status) => {
    mutateTask(id, { status })
  }

  const byStatus = useMemo(() => {
    const map: Record<Status, Task[]> = { todo: [], 'in-progress': [], done: [] }
    for (const t of viewTasks) map[t.status].push(t)
    return map
  }, [viewTasks])

  if (state.phase === 'loading') {
    return (
      <p className="board-state" role="status">
        태스크를 불러오는 중…
      </p>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="board-state board-error" role="alert">
        <p>목록을 불러오지 못했습니다.</p>
        <p className="board-error-message">{state.message}</p>
        <button type="button" className="retry-btn" onClick={retry}>
          재시도
        </button>
      </div>
    )
  }

  if (viewTasks.length === 0) {
    return (
      <p className="board-state">등록된 태스크가 없습니다. 첫 태스크를 추가해 보세요.</p>
    )
  }

  return (
    <>
      <div className="board">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            title={col.title}
            status={col.status}
            tasks={byStatus[col.status]}
            onMove={moveTask}
          />
        ))}
      </div>
      {toast && <Toast message={toast} onClose={dismissToast} />}
    </>
  )
}
