import { useEffect, useRef, useState } from 'react'
import type { Task, Status } from '../types'
import { Card } from './Card'
import { computeVirtualRange } from '../lib/virtual'

/** 카드 66px + 간격 8px. styles.css 의 .card 높이와 반드시 일치해야 한다 */
const ITEM_HEIGHT = 74
const OVERSCAN = 5

interface Props {
  title: string
  status: Status
  tasks: Task[]
  onMove: (id: string, status: Status) => void
}

export function Column({ title, status, tasks, onMove }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  // 스크롤 컨테이너의 실제 높이(75vh)를 측정. 창 크기 변화에도 추적한다.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 가상화: 보이는 범위(±overscan)만 DOM 에 그리고 나머지는 padding 으로 높이만 유지
  const { start, end, padTop, padBottom } = computeVirtualRange({
    total: tasks.length,
    itemHeight: ITEM_HEIGHT,
    scrollTop,
    viewportHeight,
    overscan: OVERSCAN,
  })

  return (
    <section
      className="column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('text/plain')
        if (id) onMove(id, status)
      }}
    >
      <h2 className="column-title">
        {title} <span className="count">{tasks.length}</span>
      </h2>
      <div
        ref={bodyRef}
        className="column-body"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {tasks.length === 0 ? (
          <p className="column-empty">비어 있음</p>
        ) : (
          <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {tasks.slice(start, end).map((t) => (
              <Card key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
