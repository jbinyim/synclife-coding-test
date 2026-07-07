import type { Task } from '../types'

/**
 * 낙관적 업데이트의 순수 로직.
 *
 * 상태를 2층으로 나눈다:
 *   - serverTasks: 서버가 확정해준 진실 (version 포함)
 *   - overlay:     아직 서버 확정을 받지 못한 낙관적 변경 (taskId → patch)
 * 화면에는 항상 serverTasks 위에 overlay 를 덮은 결과를 그린다.
 * 실패 시 overlay 항목을 제거하는 것만으로 "마지막 서버 확정 상태"로 정확히 롤백된다.
 *
 * 요청 순서는 태스크별 직렬 큐로 제어한다:
 *   - 같은 태스크의 쓰기는 동시에 1개만 전송(in-flight)
 *   - 전송 중 새 변경이 오면 대기 슬롯(next)에 병합(coalescing) — 최종 상태만 남긴다
 * PATCH 가 version 을 요구하고 성공 시 +1 되므로, 직렬화 없이는 연속 이동이 409 가 난다.
 */

/** 클라이언트가 수정할 수 있는 필드만 허용하는 patch (id/version/createdAt 등은 서버 관리) */
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'tags' | 'assignee'>
>

export type Overlay = ReadonlyMap<string, TaskPatch>

// ───────────────────────── 오버레이 ─────────────────────────

/** serverTasks 위에 overlay 를 덮은 화면용 목록을 만든다 */
export function applyOverlay(serverTasks: Task[], overlay: Overlay): Task[] {
  if (overlay.size === 0) return serverTasks
  return serverTasks.map((t) => {
    const patch = overlay.get(t.id)
    return patch ? { ...t, ...patch } : t
  })
}

/** overlay 에 patch 를 병합한다 (같은 태스크의 기존 patch 위에 덮어씀) */
export function mergeOverlay(overlay: Overlay, id: string, patch: TaskPatch): Overlay {
  const next = new Map(overlay)
  next.set(id, { ...overlay.get(id), ...patch })
  return next
}

/** 해당 태스크의 낙관적 변경을 제거한다 → 화면이 서버 확정 상태로 돌아간다(롤백) */
export function clearOverlay(overlay: Overlay, id: string): Overlay {
  if (!overlay.has(id)) return overlay
  const next = new Map(overlay)
  next.delete(id)
  return next
}

// ───────────────────────── 서버 상태 ─────────────────────────

/** 서버 응답으로 해당 태스크를 교체한다 (없으면 그대로) */
export function upsertTask(tasks: Task[], updated: Task): Task[] {
  return tasks.map((t) => (t.id === updated.id ? updated : t))
}

/** 생성 확정된 태스크를 맨 앞에 삽입한다 (mock 서버도 맨 앞에 삽입: handlers.ts POST) */
export function insertTask(tasks: Task[], created: Task): Task[] {
  return [created, ...tasks]
}

/** 서버에서 삭제 확정된 태스크를 제거한다 */
export function removeTaskById(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id)
}

// ───────────────────────── 화면 합성 ─────────────────────────

/**
 * 화면에 그릴 최종 목록을 합성한다.
 *   서버 확정 상태 + 이동/수정 overlay − 삭제 대기 + 생성 대기(맨 앞)
 * 생성/삭제의 롤백도 이동/수정과 같은 원리다:
 * pending 목록에서 빼기만 하면 화면이 서버 확정 상태로 돌아간다.
 */
export function composeView(
  serverTasks: Task[],
  overlay: Overlay,
  pendingCreates: Task[],
  pendingDeletes: ReadonlySet<string>,
): Task[] {
  let view = applyOverlay(serverTasks, overlay)
  if (pendingDeletes.size > 0) view = view.filter((t) => !pendingDeletes.has(t.id))
  if (pendingCreates.length > 0) view = [...pendingCreates, ...view]
  return view
}

// ───────────────────────── 태스크별 직렬 큐 ─────────────────────────

export type QueueEntry = {
  /** 현재 전송 중인 patch */
  inFlight: TaskPatch
  /** 전송 중에 쌓인 변경(병합됨). 전송이 끝나면 이것이 다음 요청이 된다 */
  next: TaskPatch | null
}

export type QueueState = ReadonlyMap<string, QueueEntry>

export type SendCommand = { id: string; patch: TaskPatch }

/**
 * 새 변경 요청. 반환된 send 가 있으면 지금 즉시 전송해야 한다.
 * - 해당 태스크가 유휴 상태 → in-flight 로 등록하고 즉시 전송
 * - 이미 전송 중 → next 에 병합만 하고 전송하지 않는다 (직렬화)
 */
export function enqueue(
  queue: QueueState,
  id: string,
  patch: TaskPatch,
): { queue: QueueState; send: SendCommand | null } {
  const entry = queue.get(id)
  const nextQueue = new Map(queue)
  if (!entry) {
    nextQueue.set(id, { inFlight: patch, next: null })
    return { queue: nextQueue, send: { id, patch } }
  }
  nextQueue.set(id, { ...entry, next: { ...entry.next, ...patch } })
  return { queue: nextQueue, send: null }
}

/**
 * in-flight 요청이 끝났다(성공/실패 무관). 반환된 send 가 있으면 이어서 전송한다.
 * - 대기 중 next 가 있으면 in-flight 로 승격해 전송
 * - 없으면 큐에서 제거 (이 태스크는 유휴 상태로)
 */
export function settle(
  queue: QueueState,
  id: string,
): { queue: QueueState; send: SendCommand | null } {
  const entry = queue.get(id)
  if (!entry) return { queue, send: null }
  const nextQueue = new Map(queue)
  if (entry.next) {
    nextQueue.set(id, { inFlight: entry.next, next: null })
    return { queue: nextQueue, send: { id, patch: entry.next } }
  }
  nextQueue.delete(id)
  return { queue: nextQueue, send: null }
}
