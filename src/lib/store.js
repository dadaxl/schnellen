// src/lib/store.js
import { create } from 'zustand'
import { ref, onValue, off } from 'firebase/database'
import { db } from './firebase'

let roomListener = null

export const useStore = create((set, get) => ({
  // Lokaler Spieler
  playerId: null,
  playerName: '',
  roomId: null,

  // Firebase-Daten (live)
  room: null,
  loading: false,
  error: null,

  setPlayer: (playerId, playerName) => set({ playerId, playerName }),
  setRoomId: (roomId) => {
    set({ roomId, room: null })
    const { subscribeRoom } = get()
    subscribeRoom(roomId)
  },

  subscribeRoom: (roomId) => {
    if (roomListener) off(roomListener)
    if (!roomId) return
    const r = ref(db, `rooms/${roomId}`)
    roomListener = r
    onValue(r, (snap) => {
      if (snap.exists()) set({ room: snap.val() })
      else set({ room: null })
    })
  },

  unsubscribe: () => {
    if (roomListener) { off(roomListener); roomListener = null }
    set({ roomId: null, room: null })
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}))
