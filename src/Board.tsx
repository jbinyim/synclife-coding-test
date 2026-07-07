import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { Task, Status } from './types'
import { useTasks, type NewTaskInput } from './hooks/useTasks'
import { filterByTitle } from './lib/tasks'
import { Column } from './components/Column'
import { Toast } from './components/Toast'
import { TaskFormModal } from './components/TaskFormModal'
import { ConfirmDialog } from './components/ConfirmDialog'

const COLUMNS: { status: Status; title: string }[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in-progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
]

export default function Board() {
  const { state, viewTasks, retry, mutateTask, createNewTask, removeTask, toast, dismissToast } =
    useTasks()

  const [query, setQuery] = useState('')
  // 타이핑(급함)과 5,000개 필터링(덜 급함)의 우선순위를 분리해 입력이 끊기지 않게 한다
  const deferredQuery = useDeferredValue(query)

  /** 폼 모달: closed | 생성 | 수정(대상 태스크) */
  const [form, setForm] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  })
  /** 삭제 확인 다이얼로그 대상 */
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  // 낙관적 이동: overlay 에 즉시 반영되고, 서버 전송·롤백은 useTasks 큐가 처리한다.
  const moveTask = (id: string, status: Status) => {
    mutateTask(id, { status })
  }

  // Card 가 memo 이므로 참조를 고정해야 리렌더 차단이 유지된다
  const openEdit = useCallback((task: Task) => setForm({ open: true, task }), [])
  const requestDelete = useCallback((task: Task) => setDeleteTarget(task), [])

  const handleFormSubmit = (input: NewTaskInput) => {
    if (form.task) {
      // 수정: 이동과 같은 낙관적 PATCH 파이프라인. 설명을 비우면 '' 로 지운다
      mutateTask(form.task.id, { ...input, description: input.description ?? '' })
    } else {
      createNewTask(input)
    }
  }

  const filtered = useMemo(
    () => filterByTitle(viewTasks, deferredQuery),
    [viewTasks, deferredQuery],
  )

  const byStatus = useMemo(() => {
    const map: Record<Status, Task[]> = { todo: [], 'in-progress': [], done: [] }
    for (const t of filtered) map[t.status].push(t)
    return map
  }, [filtered])

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

  const searching = deferredQuery.trim().length > 0

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="제목으로 검색"
          aria-label="태스크 제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && <span className="search-count">{filtered.length}개 결과</span>}
        <button
          type="button"
          className="btn btn-primary add-btn"
          onClick={() => setForm({ open: true, task: null })}
        >
          + 새 태스크
        </button>
      </div>

      {viewTasks.length === 0 ? (
        <p className="board-state">등록된 태스크가 없습니다. 첫 태스크를 추가해 보세요.</p>
      ) : filtered.length === 0 ? (
        <p className="board-state">‘{deferredQuery}’ 검색 결과가 없습니다.</p>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              title={col.title}
              status={col.status}
              tasks={byStatus[col.status]}
              onMove={moveTask}
              onEdit={openEdit}
              onDelete={requestDelete}
            />
          ))}
        </div>
      )}

      {form.open && (
        <TaskFormModal
          key={form.task?.id ?? 'new'}
          task={form.task}
          onSubmit={handleFormSubmit}
          onClose={() => setForm({ open: false, task: null })}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`‘${deleteTarget.title}’ 태스크를 삭제할까요?`}
          onConfirm={() => {
            removeTask(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={dismissToast} />}
    </>
  )
}
