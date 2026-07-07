import { describe, it, expect } from 'vitest'
import {
  applyOverlay,
  mergeOverlay,
  clearOverlay,
  upsertTask,
  enqueue,
  settle,
  type QueueState,
  type Overlay,
} from './optimistic'
import type { Task } from '../types'

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

const emptyOverlay: Overlay = new Map()
const emptyQueue: QueueState = new Map()

describe('applyOverlay — 화면용 목록 합성', () => {
  it('overlay 의 patch 를 해당 태스크에만 덮는다', () => {
    const server = [make('a'), make('b')]
    const overlay = mergeOverlay(emptyOverlay, 'a', { status: 'done' })
    const view = applyOverlay(server, overlay)
    expect(view.find((t) => t.id === 'a')?.status).toBe('done')
    expect(view.find((t) => t.id === 'b')?.status).toBe('todo')
  })

  it('빈 overlay 면 원본 배열을 그대로 반환한다 (불필요한 재생성 없음)', () => {
    const server = [make('a')]
    expect(applyOverlay(server, emptyOverlay)).toBe(server)
  })

  it('원본 serverTasks 를 변경하지 않는다', () => {
    const server = [make('a')]
    applyOverlay(server, mergeOverlay(emptyOverlay, 'a', { status: 'done' }))
    expect(server[0].status).toBe('todo')
  })
})

describe('mergeOverlay / clearOverlay — 롤백의 핵심', () => {
  it('같은 태스크에 연속 patch 를 병합한다', () => {
    let overlay = mergeOverlay(emptyOverlay, 'a', { status: 'in-progress' })
    overlay = mergeOverlay(overlay, 'a', { status: 'done' })
    expect(overlay.get('a')).toEqual({ status: 'done' })
  })

  it('clearOverlay 하면 화면이 서버 확정 상태로 돌아간다 (롤백)', () => {
    const server = [make('a', { status: 'todo' })]
    let overlay = mergeOverlay(emptyOverlay, 'a', { status: 'done' })
    expect(applyOverlay(server, overlay)[0].status).toBe('done')

    overlay = clearOverlay(overlay, 'a')
    expect(applyOverlay(server, overlay)[0].status).toBe('todo')
  })

  it('다른 태스크의 낙관적 변경은 롤백에 영향받지 않는다', () => {
    let overlay = mergeOverlay(emptyOverlay, 'a', { status: 'done' })
    overlay = mergeOverlay(overlay, 'b', { status: 'in-progress' })
    overlay = clearOverlay(overlay, 'a')
    expect(overlay.get('b')).toEqual({ status: 'in-progress' })
  })
})

describe('upsertTask', () => {
  it('id 가 같은 태스크를 서버 응답으로 교체한다', () => {
    const tasks = [make('a'), make('b')]
    const updated = make('a', { status: 'done', version: 2 })
    const next = upsertTask(tasks, updated)
    expect(next.find((t) => t.id === 'a')).toEqual(updated)
    expect(next.find((t) => t.id === 'b')).toEqual(make('b'))
  })
})

describe('enqueue / settle — 태스크별 직렬 큐', () => {
  it('유휴 상태면 즉시 전송한다', () => {
    const { send } = enqueue(emptyQueue, 'a', { status: 'done' })
    expect(send).toEqual({ id: 'a', patch: { status: 'done' } })
  })

  it('전송 중이면 next 에 병합만 하고 전송하지 않는다 (직렬화)', () => {
    const first = enqueue(emptyQueue, 'a', { status: 'in-progress' })
    const second = enqueue(first.queue, 'a', { status: 'done' })
    expect(second.send).toBeNull()
    expect(second.queue.get('a')?.next).toEqual({ status: 'done' })
  })

  it('전송 중 여러 변경은 최종 상태 하나로 병합된다 (coalescing)', () => {
    const q1 = enqueue(emptyQueue, 'a', { status: 'in-progress' })
    const q2 = enqueue(q1.queue, 'a', { status: 'done' })
    const q3 = enqueue(q2.queue, 'a', { status: 'todo', priority: 'high' })
    expect(q3.queue.get('a')?.next).toEqual({ status: 'todo', priority: 'high' })
  })

  it('settle 시 대기 patch 가 있으면 이어서 전송한다', () => {
    const q1 = enqueue(emptyQueue, 'a', { status: 'in-progress' })
    const q2 = enqueue(q1.queue, 'a', { status: 'done' })
    const settled = settle(q2.queue, 'a')
    expect(settled.send).toEqual({ id: 'a', patch: { status: 'done' } })
    expect(settled.queue.get('a')).toEqual({ inFlight: { status: 'done' }, next: null })
  })

  it('settle 시 대기가 없으면 큐에서 제거된다 (유휴 복귀)', () => {
    const q1 = enqueue(emptyQueue, 'a', { status: 'done' })
    const settled = settle(q1.queue, 'a')
    expect(settled.send).toBeNull()
    expect(settled.queue.has('a')).toBe(false)
  })

  it('서로 다른 태스크는 서로를 막지 않는다', () => {
    const q1 = enqueue(emptyQueue, 'a', { status: 'done' })
    const q2 = enqueue(q1.queue, 'b', { status: 'done' })
    expect(q2.send).toEqual({ id: 'b', patch: { status: 'done' } })
  })
})
