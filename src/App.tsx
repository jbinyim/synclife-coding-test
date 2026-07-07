import Board from './Board'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Board</h1>
        <p className="hint">
          느리고 가끔 실패하는 서버(mock API) 위에서도 끊김 없이 동작하는 칸반 보드
        </p>
      </header>
      <Board />
    </div>
  )
}
