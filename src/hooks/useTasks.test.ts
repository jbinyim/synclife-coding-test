import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTasks } from './useTasks'
import { getTasks } from '../api/client'
import type { Task } from '../types'

vi.mock('../api/client', () => ({
  getTasks: vi.fn(),
}))
const mockedGetTasks = vi.mocked(getTasks)

const make = (id: string): Task => ({
  id,
  title: `Task ${id}`,
  status: 'todo',
  priority: 'medium',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTasks — 로드 상태', () => {
  it('로딩으로 시작해 성공하면 ready 상태에 태스크를 담는다', async () => {
    mockedGetTasks.mockResolvedValue([make('a'), make('b')])
    const { result } = renderHook(() => useTasks())

    expect(result.current.state.phase).toBe('loading')

    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.state).toEqual({
      phase: 'ready',
      tasks: [make('a'), make('b')],
    })
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

describe('useTasks — setTasks', () => {
  it('ready 상태에서만 목록을 갱신한다', async () => {
    mockedGetTasks.mockResolvedValue([make('a')])
    const { result } = renderHook(() => useTasks())
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))

    act(() => result.current.setTasks((prev) => prev.filter((t) => t.id !== 'a')))
    expect(result.current.state).toEqual({ phase: 'ready', tasks: [] })
  })

  it('loading 상태에서는 무시된다', () => {
    mockedGetTasks.mockImplementation(() => new Promise<Task[]>(() => {}))
    const { result } = renderHook(() => useTasks())

    act(() => result.current.setTasks(() => [make('x')]))
    expect(result.current.state.phase).toBe('loading')
  })
})
