import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../types'
import { getTasks, updateTask, ApiError } from '../api/client'
import {
  applyOverlay,
  mergeOverlay,
  clearOverlay,
  upsertTask,
  enqueue,
  settle,
  type Overlay,
  type QueueState,
  type TaskPatch,
} from '../lib/optimistic'

/**
 * 초기 로드 상태를 하나의 union으로 관리한다.
 * loading/error/ready 를 boolean 조합으로 두면 "로딩 중인데 에러" 같은
 * 불가능한 조합이 타입상 허용되므로, union 으로 상태를 상호 배타적으로 만든다.
 * ready 의 tasks 는 "서버가 확정해준 진실"만 담는다 (낙관적 변경은 overlay 에).
 */
export type TasksLoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; tasks: Task[] }

export function useTasks() {
  const [state, setState] = useState<TasksLoadState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  /** 아직 서버 확정을 받지 못한 낙관적 변경 (taskId → patch) */
  const [overlay, setOverlay] = useState<Overlay>(new Map())
  const [toast, setToast] = useState<string | null>(null)

  /**
   * 태스크별 직렬 큐. 렌더와 무관한 전송 순서 제어용이라 ref 로 둔다.
   * (state 로 두면 비동기 콜백에서 최신 값을 읽기 위한 우회가 필요해짐)
   */
  const queueRef = useRef<QueueState>(new Map())

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    // 재로드 시 이전 낙관적 변경·큐는 의미가 없으므로 초기화
    setOverlay(new Map())
    queueRef.current = new Map()

    getTasks(controller.signal)
      .then((tasks) => setState({ phase: 'ready', tasks }))
      .catch((err: unknown) => {
        // cleanup(재시도·언마운트·StrictMode 재실행)으로 abort 된 요청의
        // 실패는 사용자에게 보여줄 에러가 아니다.
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : '요청에 실패했습니다.'
        setState({ phase: 'error', message })
      })

    return () => controller.abort()
  }, [attempt])

  /** 초기 로드 실패 시 수동 재시도. 정책 근거는 DECISIONS.md 5번 참고. */
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  /** 서버 확정 상태 갱신 */
  const confirmServer = useCallback((task: Task) => {
    setState((prev) =>
      prev.phase === 'ready' ? { phase: 'ready', tasks: upsertTask(prev.tasks, task) } : prev,
    )
  }, [])

  /**
   * 이벤트 핸들러·비동기 콜백(비렌더 타이밍)에서 최신 서버 상태를 읽기 위한 미러 ref.
   * setState updater 안에서 부수효과(전송)를 일으키면 StrictMode 가 updater 를
   * 2번 실행해 요청이 중복되므로, ref 로 읽고 부수효과는 밖에서 처리한다.
   */
  const stateRef = useRef(state)
  stateRef.current = state

  /**
   * 실패 알림용 태스크 제목. 재시도 정책이 "사용자 재조작"이라서
   * 무엇이 실패했는지 알려줘야 사용자가 대상을 찾아 다시 조작할 수 있다.
   * (가상화 이후 롤백된 카드가 화면 밖일 수 있음)
   */
  const titleOf = useCallback((id: string): string | null => {
    const current = stateRef.current
    if (current.phase !== 'ready') return null
    const title = current.tasks.find((t) => t.id === id)?.title
    if (!title) return null
    return title.length > 20 ? `${title.slice(0, 20)}…` : title
  }, [])

  /**
   * 전송 드라이버. version 은 체인으로 전달한다:
   * 성공하면 응답의 새 version, 실패(500)면 서버가 안 바뀌었으므로 기존 version 을
   * 대기 중인 다음 요청에 그대로 넘긴다. state 를 다시 읽지 않으므로
   * "dispatch 직후 아직 렌더 전" 타이밍 문제가 없다.
   */
  const run = useCallback(
    async (id: string, patch: TaskPatch, version: number) => {
      let nextVersion = version
      let failed = false
      let conflicted = false
      try {
        const updated = await updateTask(id, { ...patch, version })
        confirmServer(updated)
        nextVersion = updated.version
      } catch (err: unknown) {
        failed = true
        // 409: 다른 곳에서 먼저 수정됨 → 서버 최신 상태를 수용 (전용 UX 는 P2)
        if (err instanceof ApiError && err.status === 409) {
          conflicted = true
          const current = (err.payload as { current?: Task } | null)?.current
          if (current) {
            confirmServer(current)
            nextVersion = current.version
          }
        }
      }

      const settled = settle(queueRef.current, id)
      queueRef.current = settled.queue

      if (settled.send) {
        // 대기 중이던 최종 변경을 이어서 전송 (실패했어도 최종 목적지는 여전히 유효)
        void run(settled.send.id, settled.send.patch, nextVersion)
        return
      }

      // 이 태스크의 모든 작업이 끝남 → overlay 제거.
      // 성공: 서버 확정 상태가 이미 같은 값이므로 화면 변화 없음.
      // 실패: 마지막 서버 확정 상태로 화면이 돌아감 = 롤백.
      setOverlay((o) => clearOverlay(o, id))
      if (failed) {
        const title = titleOf(id)
        if (conflicted) {
          // 409 는 "되돌림"이 아니라 서버 최신 상태로 "갱신"된 것 — 동작 그대로 알린다
          setToast(
            title
              ? `‘${title}’이(가) 다른 곳에서 먼저 수정되어 서버의 최신 상태로 갱신했습니다.`
              : '다른 곳에서 먼저 수정되어 서버의 최신 상태로 갱신했습니다.',
          )
        } else {
          setToast(
            title
              ? `‘${title}’ 변경을 저장하지 못해 이전 상태로 되돌렸습니다.`
              : '변경을 저장하지 못해 이전 상태로 되돌렸습니다.',
          )
        }
      }
    },
    [confirmServer, titleOf],
  )

  /**
   * 낙관적 뮤테이션 진입점. UI 에 먼저 반영하고(overlay) 서버 전송은 큐가 제어한다.
   * 이동(P1-2)뿐 아니라 수정(P1-5)도 이 함수를 그대로 쓴다.
   */
  const mutateTask = useCallback(
    (id: string, patch: TaskPatch) => {
      const current = stateRef.current
      if (current.phase !== 'ready') return
      const target = current.tasks.find((t) => t.id === id)
      if (!target) return

      setOverlay((o) => mergeOverlay(o, id, patch))
      const { queue, send } = enqueue(queueRef.current, id, patch)
      queueRef.current = queue
      // 유휴 상태였을 때만 즉시 전송. version 은 서버 확정 값에서 시작한다.
      if (send) void run(send.id, send.patch, target.version)
    },
    [run],
  )

  const dismissToast = useCallback(() => setToast(null), [])

  /** 화면용 목록: 서버 확정 상태 + 낙관적 overlay */
  const viewTasks = useMemo(
    () => (state.phase === 'ready' ? applyOverlay(state.tasks, overlay) : []),
    [state, overlay],
  )

  return { state, viewTasks, retry, mutateTask, toast, dismissToast }
}
