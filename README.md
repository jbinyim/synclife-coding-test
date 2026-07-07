# 태스크 보드 — 느리고 가끔 실패하는 서버 위에서도 끊김 없는 칸반

느리고(200~800ms) 가끔 실패하는(쓰기 15%) mock API(MSW) 위에서, 낙관적 업데이트·정확한 롤백·경쟁 상태 제어·5,000개 가상화로 **현실의 네트워크 조건에서도 끊김 없이 동작**하는 칸반 태스크 보드입니다.

- **배포 URL: https://jbinyim.github.io/synclife-coding-test/**
- 저장소: https://github.com/jbinyim/synclife-coding-test

> mock 서버는 브라우저(서비스워커) 안에서 동작하며 localStorage를 자체 DB로 씁니다. 방문자마다 독립된 시드 5,000개로 시작하고, 브라우저 콘솔에서 `resetMockDb()`로 언제든 초기화할 수 있습니다.

## 실행 방법

```bash
npm install    # postinstall에서 public/mockServiceWorker.js 자동 생성
npm run dev    # 개발 서버 (http://localhost:5173)
npm test       # 유닛 테스트 54개 (Vitest)
npm run build  # 타입체크(tsc --noEmit) + 프로덕션 빌드
```

Node 18 이상. 실패/지연을 조절하려면 `src/mocks/config.ts`의 `WRITE_FAILURE_RATE`(기본 0.15), `MAX_LATENCY`(기본 800) 값을 바꾸면 됩니다 — 예: `WRITE_FAILURE_RATE = 1`이면 모든 쓰기가 실패해 롤백을 바로 관찰할 수 있습니다.

## 구현 기능

### Priority 1 — 전부 구현 ✅

| 기능 | 구현 방식 |
|---|---|
| **로드 상태 처리** | 로딩/에러(재시도)/빈 상태를 discriminated union 하나로 관리 — 불가능한 상태 조합을 타입으로 배제. 네트워크 예외는 별도 안내 메시지 |
| **낙관적 업데이트 + 롤백** (이동·수정·삭제·생성 4종 모두) | 서버 확정 상태와 낙관적 변경(overlay/pendingCreates/pendingDeletes)을 자료구조 수준에서 분리. 실패 시 낙관적 레이어 제거만으로 정확히 롤백 — 별도 복원 로직 없음. 실패 알림에 대상 태스크 제목 표시 |
| **경쟁 상태 처리** | 태스크별 직렬 요청 큐 + 병합(coalescing) + version 체인. 같은 카드 연속 이동 시 최종 상태만 전송되고(3연속 이동 → PATCH 2회 실측), 응답 순서가 보장되어 늦은 응답이 최신 상태를 덮을 수 없음 |
| **5,000개 성능** | 고정 높이 windowing 직접 구현(범위 계산은 순수 함수) + `React.memo` + `useDeferredValue` 검색. **DOM 노드 25,030 → 320, 드롭 반영 7ms** (Chrome 실측, DECISIONS 4번) |
| **태스크 CRUD** | 추가(제목·우선순위 필수, 설명 선택)/수정(카드 클릭)/삭제(× 버튼 → 확인 다이얼로그). 생성은 temp id로 선반영 후 서버 태스크로 교체 |
| **핵심 로직 유닛 테스트** | **54개** — 오버레이/롤백/직렬 큐(20), 가상화 범위(8), 필터(4), 훅 통합(22) |

### Priority 2 — 부분 구현 / 미구현과 사유

- **409 충돌 처리**: 기본 구현 — 서버 최신 상태(`payload.current`) 수용 + 전용 안내. 병합 선택 UI는 미구현 (단일 탭에선 직렬 큐 덕분에 409가 구조적으로 발생하지 않아 투자 대비 효과 낮음)
- **검색**: 구현 (`useDeferredValue`로 타이핑 반응성 확보). 디바운싱은 서버 요청 없는 클라이언트 필터라 실익이 없어 보류, 다중 필터 미구현
- **실패 재시도/백오프, 다중 탭 동기화, 키보드 접근성**: 미구현 — "개수보다 완성도" 원칙에 따라 P1 견고화에 시간을 사용. 상세 사유와 확장 설계는 [DECISIONS.md](DECISIONS.md) 6번

## 설계 요약

```
serverTasks (서버 확정 진실, version 포함)
  + overlay (이동/수정 낙관적 patch)
  − pendingDeletes (삭제 낙관적 숨김)
  + pendingCreates (생성 낙관적 표시)
  = 화면
```

- 4종 연산 모두 하나의 원리: **"pending을 지우면 서버 확정 상태가 남는다" = 롤백**
- 순수 로직(`src/lib/`)과 React 조립(`src/hooks/`, 컴포넌트)을 분리 — 경쟁 상태·롤백·가상화의 핵심을 네트워크 없이 테스트
- 상태 관리·드래그·UI 라이브러리 **미도입**: 이 과제의 난제(version 체인이 걸린 태스크별 직렬화)는 라이브러리가 자동으로 풀어주지 않아, 직접 구현으로 동작을 완전히 통제·설명 가능하게 했습니다 (근거: [DECISIONS.md](DECISIONS.md))

## 직접 확인해보기 (추천 시나리오)

1. 카드를 드래그하면 **즉시** 이동합니다. 6~7번에 1번꼴로 실패해 원위치되며 어떤 태스크가 실패했는지 토스트로 알립니다 (의도된 15% 실패)
2. 같은 카드를 **빠르게 여러 번** 옮긴 뒤 새로고침 — 최종 위치가 그대로 유지됩니다 (서버 정합성)
3. `src/mocks/config.ts`에서 `WRITE_FAILURE_RATE = 1`로 바꾸면 생성/수정/삭제/이동의 롤백을 전부 관찰할 수 있습니다
4. F12 → Elements에서 `.card` 개수를 세보면 5,000개 중 ~60개만 DOM에 있습니다 (가상화)

## 기술 스택

React 18 · TypeScript(strict) · Vite · Vitest · MSW — **추가 런타임 의존성 0**

## 문서

- [DECISIONS.md](DECISIONS.md) — 설계 결정과 근거, 버린 대안, 측정 데이터 (상태 구조 / 롤백 / 경쟁 상태 / 성능 / 정답 없는 결정들 / 한계)
- [AI_USAGE.md](AI_USAGE.md) — AI 도구 활용 방식과 검증·거부·수정 사례
- [CLAUDE.md](CLAUDE.md) — AI와 협업할 때 사용한 작업 규칙 (요구사항 체크리스트, Git/문서/검증 규칙)
