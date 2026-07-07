import { describe, it, expect } from 'vitest'
import { computeVirtualRange } from './virtual'

// 카드 66px + 간격 8px 를 가정한 대표 값
const H = 74
const VIEWPORT = 600

describe('computeVirtualRange', () => {
  it('스크롤 최상단: 0번부터 보이는 개수 + overscan 만큼 렌더한다', () => {
    const r = computeVirtualRange({
      total: 5000,
      itemHeight: H,
      scrollTop: 0,
      viewportHeight: VIEWPORT,
      overscan: 5,
    })
    expect(r.start).toBe(0)
    expect(r.padTop).toBe(0)
    // ceil(600/74)+1 = 10 보임 + overscan 5 = 15
    expect(r.end).toBe(15)
    expect(r.padBottom).toBe((5000 - 15) * H)
  })

  it('중간 스크롤: 첫 보이는 인덱스 기준으로 앞뒤 overscan 을 포함한다', () => {
    const scrollTop = 100 * H // 100번째 아이템 위치
    const r = computeVirtualRange({
      total: 5000,
      itemHeight: H,
      scrollTop,
      viewportHeight: VIEWPORT,
      overscan: 5,
    })
    expect(r.start).toBe(95) // 100 - overscan
    expect(r.end).toBe(115) // 100 + 10 + overscan
    expect(r.padTop).toBe(95 * H)
  })

  it('맨 아래 스크롤: end 가 total 을 넘지 않는다', () => {
    const r = computeVirtualRange({
      total: 100,
      itemHeight: H,
      scrollTop: 100 * H, // 끝보다 더 내려간 값
      viewportHeight: VIEWPORT,
      overscan: 5,
    })
    expect(r.end).toBe(100)
    expect(r.padBottom).toBe(0)
    expect(r.start).toBeLessThanOrEqual(100)
  })

  it('전체 높이 보존: padTop + 렌더 구간 + padBottom = total * itemHeight', () => {
    for (const scrollTop of [0, 500, 12345, 5000 * H]) {
      const r = computeVirtualRange({
        total: 5000,
        itemHeight: H,
        scrollTop,
        viewportHeight: VIEWPORT,
      })
      const rendered = (r.end - r.start) * H
      expect(r.padTop + rendered + r.padBottom).toBe(5000 * H)
    }
  })

  it('아이템이 viewport 보다 적으면 전부 렌더한다', () => {
    const r = computeVirtualRange({
      total: 3,
      itemHeight: H,
      scrollTop: 0,
      viewportHeight: VIEWPORT,
    })
    expect(r.start).toBe(0)
    expect(r.end).toBe(3)
    expect(r.padTop).toBe(0)
    expect(r.padBottom).toBe(0)
  })

  it('빈 목록이면 아무것도 렌더하지 않는다', () => {
    const r = computeVirtualRange({
      total: 0,
      itemHeight: H,
      scrollTop: 0,
      viewportHeight: VIEWPORT,
    })
    expect(r).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })

  it('목록이 줄어 scrollTop 이 범위를 벗어나도(검색 필터) 마지막 아이템을 렌더한다', () => {
    const r = computeVirtualRange({
      total: 10,
      itemHeight: H,
      scrollTop: 4000 * H, // 5,000개일 때의 스크롤 위치가 남아있는 상황
      viewportHeight: VIEWPORT,
      overscan: 5,
    })
    expect(r.start).toBeLessThan(r.end) // 렌더 구간이 비지 않는다
    expect(r.end).toBe(10)
  })

  it('음수 scrollTop(iOS 바운스 등)은 0 으로 취급한다', () => {
    const r = computeVirtualRange({
      total: 100,
      itemHeight: H,
      scrollTop: -50,
      viewportHeight: VIEWPORT,
    })
    expect(r.start).toBe(0)
  })
})
