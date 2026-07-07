import { useMemo } from 'react'
import type { Task, Status } from './types'
import { useTasks } from './hooks/useTasks'
import { Column } from './components/Column'

const COLUMNS: { status: Status; title: string }[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in-progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
]

export default function Board() {
  const { state, retry, setTasks } = useTasks()

  // ⚠️ 서버에 저장하지 않고 로컬 상태만 바꾸는 "순진한" 이동입니다.
  // TODO(P1): 낙관적 업데이트 + 실패 시 롤백 + 경쟁 상태 처리를 구현하세요.
  //   - updateTask(id, { status, version }) 로 서버에 반영
  //   - 실패(15%)하면 이전 상태로 되돌리고 사용자에게 알림
  //   - 같은 카드를 빠르게 연속 이동해도 최종 상태가 서버와 일치하도록
  const moveTask = (id: string, status: Status) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
  }

  const byStatus = useMemo(() => {
    const map: Record<Status, Task[]> = { todo: [], 'in-progress': [], done: [] }
    if (state.phase === 'ready') for (const t of state.tasks) map[t.status].push(t)
    return map
  }, [state])

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

  if (state.tasks.length === 0) {
    return (
      <p className="board-state">등록된 태스크가 없습니다. 첫 태스크를 추가해 보세요.</p>
    )
  }

  return (
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
  )
}
