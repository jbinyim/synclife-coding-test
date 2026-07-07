// ────────────────────────────────────────────────────────────────
// mock API 동작 조절 노브(knob).
// 개발 중 실패를 강제로 재현해서 롤백/재시도 동작을 검증하세요.
//   - 롤백 확인: WRITE_FAILURE_RATE 를 1 로 올리면 모든 쓰기가 실패합니다.
//   - 속도감 확인: 지연 범위를 늘리면 경쟁 상태를 재현하기 쉽습니다.
// 제출 전에는 기본값으로 되돌려 주세요.
//
// 참고: mock 서버는 localStorage 를 DB 로 사용하므로 새로고침해도 데이터가 유지됩니다.
//       초기 시드로 되돌리려면 브라우저 콘솔에서 resetMockDb() 를 호출하세요.
//       (SEED_COUNT 를 바꿨다면 반드시 resetMockDb() 로 재시드해야 반영됩니다)
// ────────────────────────────────────────────────────────────────

/** 쓰기(POST/PATCH/DELETE) 실패 확률 (0~1) */
export const WRITE_FAILURE_RATE = 0.15

/** 읽기(GET) 실패 확률 (0~1) */
export const READ_FAILURE_RATE = 0.02

/** 응답 지연 최소/최대 (ms) */
export const MIN_LATENCY = 200
export const MAX_LATENCY = 800

/** 초기 시드 태스크 개수 */
export const SEED_COUNT = 5000
