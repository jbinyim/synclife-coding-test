import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTasks } from './useTasks'
import { getTasks, createTask, updateTask, deleteTask, ApiError } from '../api/client'
import type { Task } from '../types'

vi.mock('../api/client', () => {
  class MockApiError extends Error {
    status: number
    payload: unknown
    constructor(status: number, message: string, payload: unknown) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.payload = payload
    }
  }
  return {
    getTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    ApiError: MockApiError,
  }
})
const mockedGetTasks = vi.mocked(getTasks)
const mockedCreateTask = vi.mocked(createTask)
const mockedUpdateTask = vi.mocked(updateTask)
const mockedDeleteTask = vi.mocked(deleteTask)

const make = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  ...over,
})

type Deferred = { resolve: (t: Task) => void; reject: (e: unknown) => void }

/** updateTask 응답 타이밍을 수동 제어하기 위한 헬퍼 */
function deferUpdates(): Deferred[] {
  const deferreds: Deferred[] = []
  mockedUpdateTask.mockImplementation(
    () =>
      new Promise<Task>((resolve, reject) => {
        deferreds.push({ resolve, reject })
      }),
  )
  return deferreds
}

const findView = (result: { current: ReturnType<typeof useTasks> }, id: string) =>
  result.current.viewTasks.find((t) => t.id === id)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTasks — 로드 상태', () => {
  it('로딩으로 시작해 성공하면 ready 상태에 태스크를 담는다', async () => {
    mockedGetTasks.mockResolvedValue([make('a'), make('b')])
    const { result } = renderHook(() => useTasks())

    expect(result.current.state.phase).toBe('loading')

    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.viewTasks).toEqual([make('a'), make('b')])
  })

  it('실패하면 error 상태에 서버 메시지를 담는다', async () => {
    mockedGetTasks.mockRejectedValue(new Error('일시적인 서버 오류입니다.'))
    const { result } = renderHook(() => useTasks())

    await waitFor(() => expect(result.current.state.phase).toBe('error'))
    expect(result.current.state).toEqual({
      phase: 'error',
      message: '일시적인 서버 오류입니다.',
    })
  })

  it('retry() 는 다시 loading 부터 시작해 성공하면 ready 로 복구한다', async () => {
    mockedGetTasks.mockRejectedValueOnce(new Error('실패'))
    mockedGetTasks.mockResolvedValueOnce([make('a')])
    const { result } = renderHook(() => useTasks())

    await waitFor(() => expect(result.current.state.phase).toBe('error'))

    act(() => result.current.retry())
    expect(result.current.state.phase).toBe('loading')

    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(mockedGetTasks).toHaveBeenCalledTimes(2)
  })
})

describe('useTasks — abort 처리', () => {
  it('언마운트하면 진행 중인 요청을 abort 한다', () => {
    let captured: AbortSignal | undefined
    mockedGetTasks.mockImplementation((signal) => {
      captured = signal
      return new Promise<Task[]>((_, reject) => {
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    })
    const { unmount } = renderHook(() => useTasks())

    expect(captured?.aborted).toBe(false)
    unmount()
    expect(captured?.aborted).toBe(true)
  })

  it('StrictMode 이중 실행에서 abort 된 첫 요청이 에러 상태를 만들지 않는다', async () => {
    mockedGetTasks.mockImplementation(
      (signal) =>
        new Promise<Task[]>((resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          setTimeout(() => resolve([make('a')]), 0)
        }),
    )
    const { result } = renderHook(() => useTasks(), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    // StrictMode 가 effect 를 2번 실행 → 첫 요청은 abort, 두 번째가 성공
    expect(mockedGetTasks).toHaveBeenCalledTimes(2)
  })
})

describe('useTasks — 낙관적 뮤테이션 (P1-2)', () => {
  async function setup(initial: Task[]) {
    mockedGetTasks.mockResolvedValue(initial)
    const rendered = renderHook(() => useTasks())
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('ready'))
    return rendered
  }

  it('이동은 서버 응답 전에 즉시 화면에 반영된다 (스피너 없음)', async () => {
    const { result } = await setup([make('a', { version: 5 })])
    deferUpdates() // 응답을 보류시켜 둠

    act(() => result.current.mutateTask('a', { status: 'done' }))

    expect(findView(result, 'a')?.status).toBe('done') // 응답 전인데 이미 반영
    expect(mockedUpdateTask).toHaveBeenCalledWith('a', { status: 'done', version: 5 })
  })

  it('성공하면 서버 확정 상태(version 증가)로 정착한다', async () => {
    const { result } = await setup([make('a', { version: 5 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'done' }))
    await act(async () => deferreds[0].resolve(make('a', { status: 'done', version: 6 })))

    expect(findView(result, 'a')).toMatchObject({ status: 'done', version: 6 })
    expect(result.current.toast).toBeNull()
  })

  it('실패하면 이전 상태로 롤백되고 토스트가 뜬다', async () => {
    const { result } = await setup([make('a', { status: 'todo', version: 5 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'done' }))
    expect(findView(result, 'a')?.status).toBe('done') // 낙관적 반영

    await act(async () => deferreds[0].reject(new Error('일시적인 서버 오류입니다.')))

    expect(findView(result, 'a')).toMatchObject({ status: 'todo', version: 5 }) // 롤백
    expect(result.current.toast).toContain('되돌렸')
    // 재시도가 "사용자 재조작"이므로 무엇이 실패했는지 제목을 알려줘야 한다
    expect(result.current.toast).toContain('Task a')
  })

  it('실패 토스트의 긴 제목은 20자로 말줄임된다', async () => {
    const longTitle = '아주아주아주아주아주아주아주 긴 제목의 태스크입니다'
    const { result } = await setup([make('a', { title: longTitle, version: 1 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'done' }))
    await act(async () => deferreds[0].reject(new Error('실패')))

    expect(result.current.toast).toContain(`${longTitle.slice(0, 20)}…`)
    expect(result.current.toast).not.toContain(longTitle)
  })

  it('실패 롤백이 다른 태스크의 낙관적 변경을 건드리지 않는다', async () => {
    const { result } = await setup([make('a', { version: 1 }), make('b', { version: 1 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'done' }))
    act(() => result.current.mutateTask('b', { status: 'in-progress' }))

    await act(async () => deferreds[0].reject(new Error('실패'))) // a 만 실패

    expect(findView(result, 'a')?.status).toBe('todo') // a 롤백
    expect(findView(result, 'b')?.status).toBe('in-progress') // b 는 여전히 낙관적 상태
  })

  it('같은 카드 연속 이동: 직렬 전송되고 두 번째 요청은 갱신된 version 을 쓴다', async () => {
    const { result } = await setup([make('a', { version: 5 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'in-progress' }))
    act(() => result.current.mutateTask('a', { status: 'done' }))

    // 첫 요청이 진행 중이므로 두 번째는 아직 전송되지 않음 (직렬화)
    expect(mockedUpdateTask).toHaveBeenCalledTimes(1)
    // 화면은 이미 최종 목적지
    expect(findView(result, 'a')?.status).toBe('done')

    // 첫 요청 성공 (version 5 → 6) → 대기 중이던 이동이 version 6 으로 전송
    await act(async () => deferreds[0].resolve(make('a', { status: 'in-progress', version: 6 })))
    expect(mockedUpdateTask).toHaveBeenCalledTimes(2)
    expect(mockedUpdateTask).toHaveBeenLastCalledWith('a', { status: 'done', version: 6 })

    await act(async () => deferreds[1].resolve(make('a', { status: 'done', version: 7 })))
    expect(findView(result, 'a')).toMatchObject({ status: 'done', version: 7 })
    expect(result.current.toast).toBeNull()
  })

  it('첫 요청이 실패해도 대기 중인 최종 이동은 기존 version 으로 이어서 전송된다', async () => {
    const { result } = await setup([make('a', { version: 5 })])
    const deferreds = deferUpdates()

    act(() => result.current.mutateTask('a', { status: 'in-progress' }))
    act(() => result.current.mutateTask('a', { status: 'done' }))

    // 첫 요청 실패 → 서버는 안 바뀌었으므로 대기 patch 를 version 5 그대로 전송
    await act(async () => deferreds[0].reject(new Error('실패')))
    expect(mockedUpdateTask).toHaveBeenLastCalledWith('a', { status: 'done', version: 5 })
    // 최종 목적지가 살아있으므로 화면 롤백도 토스트도 없다
    expect(findView(result, 'a')?.status).toBe('done')

    await act(async () => deferreds[1].resolve(make('a', { status: 'done', version: 6 })))
    expect(findView(result, 'a')).toMatchObject({ status: 'done', version: 6 })
  })

  it('409 충돌이면 서버 최신 상태를 수용하고 알린다', async () => {
    const { result } = await setup([make('a', { status: 'todo', version: 5 })])
    const serverCurrent = make('a', { status: 'in-progress', version: 9 })
    mockedUpdateTask.mockRejectedValue(
      new ApiError(409, '다른 곳에서 먼저 수정되었습니다.', { current: serverCurrent }),
    )

    act(() => result.current.mutateTask('a', { status: 'done' }))
    await waitFor(() => expect(result.current.toast).not.toBeNull())

    // 낙관적 변경은 버리고 서버가 알려준 최신 상태로 정착
    expect(findView(result, 'a')).toMatchObject({ status: 'in-progress', version: 9 })
    // 409 는 롤백이 아니라 서버 최신 상태로의 "갱신"임을 그대로 알린다
    expect(result.current.toast).toContain('갱신')
    expect(result.current.toast).toContain('Task a')
  })
})

describe('useTasks — 낙관적 생성/삭제 (P1-5)', () => {
  async function setup(initial: Task[]) {
    mockedGetTasks.mockResolvedValue(initial)
    const rendered = renderHook(() => useTasks())
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('ready'))
    return rendered
  }

  const input = { title: '새 작업', priority: 'high', status: 'todo' } as const

  it('생성은 서버 응답 전에 temp 태스크로 즉시 맨 앞에 표시된다', async () => {
    const { result } = await setup([make('a')])
    mockedCreateTask.mockImplementation(() => new Promise<Task>(() => {})) // 응답 보류

    act(() => result.current.createNewTask(input))

    expect(result.current.viewTasks[0]).toMatchObject({ title: '새 작업', status: 'todo' })
    expect(result.current.viewTasks[0].id.startsWith('temp-')).toBe(true)
    expect(mockedCreateTask).toHaveBeenCalledWith(input)
  })

  it('생성 성공 시 temp 가 서버 태스크(진짜 id·version)로 교체된다', async () => {
    const { result } = await setup([make('a')])
    let resolve!: (t: Task) => void
    mockedCreateTask.mockImplementation(() => new Promise<Task>((r) => (resolve = r)))

    act(() => result.current.createNewTask(input))
    await act(async () => resolve(make('server-1', { title: '새 작업', version: 1 })))

    expect(result.current.viewTasks[0]).toMatchObject({ id: 'server-1', version: 1 })
    expect(result.current.viewTasks.some((t) => t.id.startsWith('temp-'))).toBe(false)
    expect(result.current.toast).toBeNull()
  })

  it('생성 실패 시 temp 가 제거되고(롤백) 제목이 담긴 토스트가 뜬다', async () => {
    const { result } = await setup([make('a')])
    let reject!: (e: unknown) => void
    mockedCreateTask.mockImplementation(() => new Promise<Task>((_, r) => (reject = r)))

    act(() => result.current.createNewTask(input))
    expect(result.current.viewTasks).toHaveLength(2)

    await act(async () => reject(new Error('실패')))

    expect(result.current.viewTasks).toHaveLength(1) // temp 제거 = 롤백
    expect(result.current.toast).toContain('새 작업')
    expect(result.current.toast).toContain('생성에 실패')
  })

  it('삭제는 서버 응답 전에 화면에서 즉시 사라진다', async () => {
    const { result } = await setup([make('a'), make('b')])
    mockedDeleteTask.mockImplementation(() => new Promise<void>(() => {}))

    act(() => result.current.removeTask('a'))

    expect(findView(result, 'a')).toBeUndefined()
    expect(findView(result, 'b')).toBeDefined()
    expect(mockedDeleteTask).toHaveBeenCalledWith('a')
  })

  it('삭제 성공 시 서버 상태에서도 제거된다', async () => {
    const { result } = await setup([make('a')])
    let resolve!: () => void
    mockedDeleteTask.mockImplementation(() => new Promise<void>((r) => (resolve = r)))

    act(() => result.current.removeTask('a'))
    await act(async () => resolve())

    expect(result.current.viewTasks).toHaveLength(0)
    expect(result.current.toast).toBeNull()
  })

  it('삭제 실패 시 카드가 복구되고 제목이 담긴 토스트가 뜬다', async () => {
    const { result } = await setup([make('a')])
    let reject!: (e: unknown) => void
    mockedDeleteTask.mockImplementation(() => new Promise<void>((_, r) => (reject = r)))

    act(() => result.current.removeTask('a'))
    expect(findView(result, 'a')).toBeUndefined() // 낙관적 숨김

    await act(async () => reject(new Error('실패')))

    expect(findView(result, 'a')).toBeDefined() // 복구
    expect(result.current.toast).toContain('Task a')
    expect(result.current.toast).toContain('삭제에 실패')
  })

  it('삭제 대기 중인 태스크는 이동/수정이 차단된다', async () => {
    const { result } = await setup([make('a')])
    mockedDeleteTask.mockImplementation(() => new Promise<void>(() => {}))

    act(() => result.current.removeTask('a'))
    act(() => result.current.mutateTask('a', { status: 'done' }))

    expect(mockedUpdateTask).not.toHaveBeenCalled()
  })

  it('수정은 이동과 같은 낙관적 PATCH 파이프라인을 탄다', async () => {
    const { result } = await setup([make('a', { version: 3 })])
    const deferreds = deferUpdates()

    act(() =>
      result.current.mutateTask('a', { title: '수정된 제목', priority: 'low' }),
    )

    expect(findView(result, 'a')).toMatchObject({ title: '수정된 제목', priority: 'low' })
    expect(mockedUpdateTask).toHaveBeenCalledWith('a', {
      title: '수정된 제목',
      priority: 'low',
      version: 3,
    })

    await act(async () =>
      deferreds[0].resolve(make('a', { title: '수정된 제목', priority: 'low', version: 4 })),
    )
    expect(findView(result, 'a')?.version).toBe(4)
  })
})
