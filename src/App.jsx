// src/App.jsx
import { useStore } from './lib/store'
import { Lobby } from './components/Lobby'
import { GameBoard } from './components/GameBoard'

export default function App() {
  const { room } = useStore()
  const isPlaying = room?.status === 'playing' || room?.status === 'finished'
  return isPlaying ? <GameBoard /> : <Lobby />
}
