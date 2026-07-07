/**
 * 가상화(windowing)의 순수 계산.
 *
 * 아이템 높이가 고정이면 "스크롤 위치에서 보이는 범위"는 곱셈/나눗셈으로 바로 나온다:
 *   첫 보이는 인덱스 = floor(scrollTop / itemHeight)
 *   보이는 개수     = ceil(viewportHeight / itemHeight) + 1  (경계 걸침 보정)
 * 위/아래로 overscan 만큼 여유를 두어 빠른 스크롤 시 빈 화면이 번쩍이는 것을 줄인다.
 * 렌더하지 않는 구간은 padTop/padBottom 으로 높이만 유지해 스크롤바를 보존한다.
 */

export type VirtualRange = {
  /** 렌더 시작 인덱스 (포함) */
  start: number
  /** 렌더 끝 인덱스 (미포함) */
  end: number
  /** 위쪽 미렌더 구간의 높이(px) */
  padTop: number
  /** 아래쪽 미렌더 구간의 높이(px) */
  padBottom: number
}

export function computeVirtualRange(opts: {
  total: number
  itemHeight: number
  scrollTop: number
  viewportHeight: number
  overscan?: number
}): VirtualRange {
  const { total, itemHeight, scrollTop, viewportHeight, overscan = 5 } = opts
  if (total === 0 || itemHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  }

  // 목록이 줄었는데(검색 필터 등) scrollTop 이 남아있는 경우를 대비해 total 범위로 clamp
  const firstVisible = Math.min(
    Math.floor(Math.max(0, scrollTop) / itemHeight),
    total - 1,
  )
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + 1

  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(total, firstVisible + visibleCount + overscan)

  return {
    start,
    end,
    padTop: start * itemHeight,
    padBottom: (total - end) * itemHeight,
  }
}
