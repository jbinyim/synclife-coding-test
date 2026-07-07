import { useCallback, useEffect, useState } from 'react'
import type { Task } from '../types'
import { getTasks } from '../api/client'

/**
 * 초기 로드 상태를 하나의 union으로 관리한다.
 * loading/error/ready 를 boolean 조합으로 두면 "로딩 중인데 에러" 같은
 * 불가능한 조합이 타입상 허용되므로, union 으로 상태를 상호 배타적으로 만든다.
 */
export type TasksLoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; tasks: Task[] }

export function useTasks() {
  const [state, setState] = useState<TasksLoadState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })

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

  /** ready 상태의 태스크 목록 갱신. P1-2에서 낙관적 스토어(reducer)로 교체될 자리. */
  const setTasks = useCallback((updater: (prev: Task[]) => Task[]) => {
    setState((prev) =>
      prev.phase === 'ready' ? { phase: 'ready', tasks: updater(prev.tasks) } : prev,
    )
  }, [])

  return { state, retry, setTasks }
}
