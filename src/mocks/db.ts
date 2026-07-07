import type { Task } from '../types'
import { generateSeedTasks } from './seed'

// mock "서버"의 저장소. 실제 백엔드는 없고, 이 가짜 서버가
// localStorage 를 자기 DB 로 사용합니다 → 새로고침해도 데이터가 유지됩니다.
//
// ⚠️ 이건 '가짜 서버 내부' 구현입니다. 지원자는 이 파일을 건드릴 필요가 없고,
//    앱 상태를 localStorage 로 직접 저장하는 것과는 다릅니다(그건 금지).
const STORAGE_KEY = 'taskboard.mockdb.v1'

function read(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Task[]
  } catch {
    /* 파싱 실패 시 시드로 폴백 */
  }
  const seeded = generateSeedTasks()
  write(seeded)
  return seeded
}

function write(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    /* 용량 초과 등은 무시 (메모리 상태는 유지됨) */
  }
}

let store: Task[] = read()

export function getStore(): Task[] {
  return store
}

export function setStore(tasks: Task[]): void {
  store = tasks
  write(tasks)
}

/** 저장소를 초기 시드로 되돌립니다. 개발 중 콘솔에서 resetMockDb() 로 호출하세요. */
export function resetMockDb(): Task[] {
  store = generateSeedTasks()
  write(store)
  return store
}

// 개발 편의: 브라우저 콘솔에서 window.resetMockDb() 로 리셋
if (typeof window !== 'undefined') {
  ;(window as unknown as { resetMockDb: typeof resetMockDb }).resetMockDb = resetMockDb
}
