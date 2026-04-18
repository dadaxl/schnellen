// src/components/Lobby.jsx
import { useState } from 'react'
import { useStore } from '../lib/store'
import { createRoom, joinRoom, startGame } from '../lib/gameActions'

const C = {
  bg:        '#f5ede0',
  wood:      '#8b5e3c',
  woodDark:  '#6b4428',
  woodLight: '#a87040',
  cream:     '#fdf8f0',
  parchment: '#f0e4c8',
  parchDark: '#d9c9a0',
  ink:       '#2a1a08',
  inkLight:  '#5c3d1e',
  gold:      '#c8960a',
  goldLight: '#f0b429',
  green:     '#27ae60',
  red:       '#c0392b',
  felt:      '#4a7c59',
}

export function Lobby() {
  const { playerId, playerName, setPlayer, setRoomId, room, roomId } = useStore()
  const [nameInput, setNameInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(3)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('name')

  const initPlayer = () => {
    if (!nameInput.trim()) return setErr('Bitte Namen eingeben')
    const id = 'p_' + Math.random().toString(36).slice(2, 9)
    setPlayer(id, nameInput.trim())
    setStep('lobby')
    setErr('')
  }

  const handleCreate = async () => {
    setLoading(true); setErr('')
    try { const rid = await createRoom(playerId, playerName, maxPlayers); setRoomId(rid) }
    catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const handleJoin = async () => {
    if (!codeInput.trim()) return setErr('Bitte Raumcode eingeben')
    setLoading(true); setErr('')
    try { await joinRoom(codeInput.trim(), playerId, playerName); setRoomId(codeInput.trim()) }
    catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const handleStart = async () => {
    setLoading(true); setErr('')
    try { await startGame(roomId) } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  const isHost = room?.hostId === playerId
  const players = room ? Object.entries(room.players || {}) : []

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>

      {/* Wirtsschild */}
      <div style={{
        background: C.wood,
        borderRadius: '16px 16px 0 0',
        padding: '20px 40px 18px',
        width: '100%',
        maxWidth: 480,
        textAlign: 'center',
        boxShadow: '0 4px 0 ' + C.woodDark,
      }}>
        <h1 style={{
          fontFamily: "'Rye', serif",
          fontSize: 48,
          color: C.goldLight,
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          letterSpacing: '0.04em',
          margin: 0,
        }}>Schnellen</h1>
        <p style={{
          color: C.parchDark,
          fontSize: 14,
          marginTop: 4,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: "'Lato', sans-serif",
        }}>Das Tiroler Kartenspiel</p>
      </div>

      {/* Hauptkarte */}
      <div style={{
        background: C.cream,
        width: '100%',
        maxWidth: 480,
        borderRadius: '0 0 16px 16px',
        padding: '32px 36px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        border: `2px solid ${C.parchDark}`,
        borderTop: 'none',
      }}>

        {step === 'name' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={labelStyle}>Wie heißt du?</label>
            <input
              style={inputStyle}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && initPlayer()}
              placeholder="Dein Name"
              maxLength={20}
              autoFocus
            />
            <button style={btnPrimary} onClick={initPlayer}>
              Weiter →
            </button>
          </div>
        )}

        {step === 'lobby' && !roomId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 18, color: C.ink, fontFamily: "'Playfair Display', serif" }}>
              Willkommen, <strong>{playerName}</strong>!
            </p>

            <div style={sectionBox}>
              <label style={labelStyle}>Neuen Tisch eröffnen</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <select style={{ ...inputStyle, flex: 0, minWidth: 140 }} value={maxPlayers} onChange={e => setMaxPlayers(+e.target.value)}>
                  <option value={2}>2 Spieler</option>
                  <option value={3}>3 Spieler</option>
                  <option value={4}>4 Spieler</option>
                  <option value={5}>5 Spieler</option>
                </select>
                <button style={{ ...btnPrimary, flex: 1 }} onClick={handleCreate} disabled={loading}>
                  Tisch eröffnen
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'center', color: C.inkLight, fontSize: 14 }}>— oder —</div>

            <div style={sectionBox}>
              <label style={labelStyle}>Tisch beitreten</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value)}
                  placeholder="Raumcode eingeben"
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
                <button style={{ ...btnSecondary, whiteSpace: 'nowrap' }} onClick={handleJoin} disabled={loading}>
                  Beitreten
                </button>
              </div>
            </div>
          </div>
        )}

        {roomId && room?.status === 'lobby' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Raumcode */}
            <div style={{
              background: C.parchment,
              border: `2px dashed ${C.parchDark}`,
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.inkLight, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Raumcode</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: 'monospace', marginTop: 2 }}>{roomId}</div>
              </div>
              <button
                style={{ ...btnSecondary, padding: '6px 14px', fontSize: 13 }}
                onClick={() => navigator.clipboard.writeText(roomId)}
              >Kopieren</button>
            </div>

            {/* Spielerliste */}
            <div>
              <label style={labelStyle}>Am Tisch ({players.length}/{room.maxPlayers})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {players.map(([pid, p]) => (
                  <div key={pid} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: C.parchment,
                    borderRadius: 8,
                    padding: '10px 14px',
                    border: `1px solid ${C.parchDark}`,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: "'Playfair Display', serif" }}>{p.name}</span>
                    {pid === room.hostId && (
                      <span style={{
                        fontSize: 11, background: C.gold, color: '#fff',
                        padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em'
                      }}>Wirt</span>
                    )}
                  </div>
                ))}
                {players.length < room.maxPlayers && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', color: C.inkLight, fontSize: 14, fontStyle: 'italic' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.parchDark, flexShrink: 0 }} />
                    Warte auf weitere Spieler…
                  </div>
                )}
              </div>
            </div>

            {isHost && players.length >= 2 && (
              <button style={{ ...btnPrimary, fontSize: 17, padding: '14px 24px' }} onClick={handleStart} disabled={loading}>
                Spiel starten! →
              </button>
            )}
            {isHost && players.length < 2 && (
              <p style={{ color: C.inkLight, fontSize: 14, textAlign: 'center' }}>Mindestens 2 Spieler benötigt</p>
            )}
            {!isHost && (
              <p style={{ color: C.inkLight, fontSize: 14, textAlign: 'center' }}>Warte auf den Wirt…</p>
            )}
          </div>
        )}

        {err && (
          <div style={{
            marginTop: 12, background: '#ffeaea', border: `1px solid ${C.red}`,
            borderRadius: 8, padding: '10px 14px', color: C.red, fontSize: 14,
          }}>{err}</div>
        )}
      </div>
    </div>
  )
}

const labelStyle = {
  fontSize: 13,
  color: '#5c3d1e',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
}
const inputStyle = {
  background: '#fdf8f0',
  border: '2px solid #d9c9a0',
  borderRadius: 8,
  padding: '11px 14px',
  color: '#2a1a08',
  fontSize: 16,
  fontFamily: "'Lato', sans-serif",
  width: '100%',
}
const sectionBox = {
  background: '#f8f0e0',
  border: '1px solid #d9c9a0',
  borderRadius: 10,
  padding: '16px 18px',
}
const btnPrimary = {
  background: '#f0b429',
  color: '#2a1a08',
  border: '2px solid #c8960a',
  borderRadius: 10,
  padding: '12px 22px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Lato', sans-serif",
  width: '100%',
}
const btnSecondary = {
  background: '#fdf8f0',
  color: '#5c3d1e',
  border: '2px solid #d9c9a0',
  borderRadius: 10,
  padding: '11px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Lato', sans-serif",
}
