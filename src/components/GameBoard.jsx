// src/components/GameBoard.jsx
import { useState } from 'react'
import { useStore } from '../lib/store'
import { foldDecision, playCard, startNextRound } from '../lib/gameActions'
import { validCardIds } from '../lib/gameLogic'
import { Card } from './Card'

const SUIT_SHORT = { Eichel: 'Eichel', Laub: 'Laub', Herz: 'Herz', Schellen: 'Schellen', Weli: 'Weli' }

// Uriges Farbschema
const C = {
  bg:         '#f5ede0',   // warmes Leinen
  felt:       '#4a7c59',   // Filztisch-Grün
  feltDark:   '#3a6147',
  feltBorder: '#2e4f39',
  wood:       '#8b5e3c',   // Holz
  woodLight:  '#a87040',
  cream:      '#fdf8f0',   // Kartenfarbe
  ink:        '#2a1a08',   // Tinte/Text
  inkLight:   '#5c3d1e',
  red:        '#c0392b',
  green:      '#27ae60',
  gold:       '#c8960a',
  goldLight:  '#f0b429',
  parchment:  '#f0e4c8',
  parchDark:  '#d9c9a0',
}

export function GameBoard() {
  const { playerId, room, roomId } = useStore()
  const [selectedCard, setSelectedCard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!room || !room.gameState) return null
  const gs = room.gameState
  const playerOrder = room.playerOrder || []
  const me = gs.players?.[playerId]
  const isMyFoldTurn = gs.phase === 'fold' && playerOrder[gs.foldTurn] === playerId
  const isMyPlayTurn = gs.phase === 'play' && gs.currentPlayer === playerId

  const myHand = me?.hand || []
  const validIds = isMyPlayTurn
    ? validCardIds(myHand, gs.currentTrick || [], gs.trumpSuit)
    : []

  const act = async (fn) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const handleCardClick = (card) => {
    if (!isMyPlayTurn || !validIds.includes(card.id)) return
    setSelectedCard(s => s?.id === card.id ? null : card)
  }
  const handlePlayCard = () => {
    if (!selectedCard) return
    act(() => playCard(roomId, playerId, selectedCard.id))
    setSelectedCard(null)
  }
  const handleFold = (fold) => act(() => foldDecision(roomId, playerId, fold))
  const handleNextRound = () => act(() => startNextRound(roomId))

  const trumpSuit = gs.trumpSuit
  const trumpCard = gs.trumpCard
  const isHerz = trumpSuit === 'Herz'
  const roundOver = gs.phase === 'round_end'
  const gameOver = room.status === 'finished'
  const winnerPid = room.winner
  const log = (gs.log || []).slice(-4)

  // Spielernamen aus gameState holen
  const nameOf = (pid) => gs.players?.[pid]?.name ?? pid

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Lato', sans-serif",
    }}>

      {/* ── HEADER / Wirtsschild ── */}
      <div style={{
        background: C.wood,
        borderBottom: `4px solid ${C.feltBorder}`,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
      }}>
        <h1 style={{
          fontFamily: "'Rye', serif",
          fontSize: 32,
          color: C.goldLight,
          flex: 1,
          textShadow: '1px 1px 3px rgba(0,0,0,0.5)',
          letterSpacing: '0.02em',
        }}>Schnellen</h1>

        {/* Trumpf */}
        {trumpCard && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.parchment, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Trumpf</span>
            <Card card={trumpCard} size="sm" disabled />
            <span style={{
              fontSize: 15, fontWeight: 700,
              color: isHerz ? C.goldLight : C.parchment,
              fontFamily: "'Playfair Display', serif",
            }}>{trumpSuit}{isHerz ? ' ×2' : ''}</span>
          </div>
        )}

        {/* Meine Punkte */}
        <div style={{
          background: C.parchment,
          borderRadius: 8,
          padding: '6px 14px',
          textAlign: 'center',
          border: `2px solid ${C.woodLight}`,
        }}>
          <div style={{ fontSize: 11, color: C.inkLight, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Punkte</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: me?.points <= 5 ? C.green : C.ink, lineHeight: 1.1 }}>
            {me?.points ?? 15}
          </div>
        </div>
      </div>

      {/* ── SPIELFELD (Filztisch) ── */}
      <div style={{ flex: 1, background: C.felt, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Meldungszeile */}
        {(err || gameOver || roundOver || isMyFoldTurn || isMyPlayTurn) && (
          <div style={{
            background: gameOver ? '#d4edda' : roundOver ? C.parchment : C.cream,
            border: `2px solid ${gameOver ? C.green : roundOver ? C.parchDark : C.gold}`,
            borderRadius: 10,
            padding: '10px 18px',
            fontSize: 16,
            fontWeight: 700,
            color: gameOver ? '#1a5c2a' : C.ink,
            textAlign: 'center',
            fontFamily: "'Playfair Display', serif",
          }}>
            {gameOver
              ? `🏆 ${nameOf(winnerPid)} gewinnt das Spiel!`
              : roundOver ? 'Runde vorbei!'
              : isMyFoldTurn ? 'Aussteigen oder mitspielen?'
              : isMyPlayTurn ? (selectedCard ? `${selectedCard.rank} ${SUIT_SHORT[selectedCard.suit]} ausspielen?` : 'Wähle eine Karte')
              : ''}
          </div>
        )}
        {err && <div style={{ color: '#fff', background: C.red, borderRadius: 8, padding: '8px 14px', fontSize: 14 }}>{err}</div>}

        {/* Log */}
        {log.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {log.map((e, i) => (
              <span key={i} style={{
                background: 'rgba(0,0,0,0.2)',
                color: '#d4f0d4',
                borderRadius: 20,
                padding: '3px 12px',
                fontSize: 13,
              }}>
                {e.type === 'trick' && `${e.winner} gewinnt Stich ${e.count}`}
                {e.type === 'schnell' && `⚡ ${e.player} schnellt! (+${isHerz ? 10 : 5})`}
                {e.type === 'fold' && `${e.player} steigt aus`}
              </span>
            ))}
          </div>
        )}

        {/* Gegner */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {playerOrder.filter(pid => pid !== playerId).map(pid => {
            const p = gs.players[pid]
            const isActive = gs.currentPlayer === pid && gs.phase === 'play'
            const isFoldTurn = gs.phase === 'fold' && playerOrder[gs.foldTurn] === pid
            return (
              <div key={pid} style={{
                flex: 1,
                minWidth: 160,
                background: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
                borderRadius: 12,
                padding: '12px 16px',
                border: isActive ? `3px solid ${C.goldLight}` : '2px solid rgba(0,0,0,0.15)',
                transition: 'border 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 17,
                    fontWeight: 700,
                    color: isActive ? C.goldLight : C.cream,
                  }}>
                    {p?.name ?? pid}
                    {isActive && <span style={{ fontSize: 13, marginLeft: 6 }}>▶</span>}
                    {isFoldTurn && <span style={{ fontSize: 12, color: C.parchDark, marginLeft: 6 }}>überlegt…</span>}
                    {p?.folded && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginLeft: 6, fontStyle: 'italic' }}>(weg)</span>}
                  </span>
                  <span style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: p?.points <= 5 ? '#7eff9e' : C.cream,
                    minWidth: 36,
                    textAlign: 'right',
                  }}>{p?.points ?? '?'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!p?.folded && Array.from({ length: p?.hand?.length ?? 0 }).map((_, i) => (
                    <Card key={i} faceDown size="sm" disabled />
                  ))}
                  {(p?.tricks ?? 0) > 0 && (
                    <span style={{ fontSize: 13, color: C.parchment, marginLeft: 4 }}>
                      {p.tricks} Stich{p.tricks !== 1 ? 'e' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tisch – gespielte Karten */}
        <div style={{
          background: C.feltDark,
          borderRadius: 14,
          padding: '16px 20px',
          minHeight: 130,
          border: `2px solid ${C.feltBorder}`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Tisch</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {(gs.currentTrick || []).map((entry, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Card card={entry.card} size="lg" disabled />
                <span style={{ fontSize: 13, color: C.parchment, fontWeight: 700 }}>
                  {nameOf(entry.playerIdx)}
                </span>
              </div>
            ))}
            {(gs.currentTrick || []).length === 0 && !roundOver && (
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                Noch keine Karte gespielt
              </span>
            )}
          </div>
        </div>

        {/* Aktions-Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isMyFoldTurn && !me?.folded && me?.points > 5 && (
            <>
              <button style={btnDanger} onClick={() => handleFold(true)} disabled={busy}>
                Aussteigen (+1 Pkt.)
              </button>
              <button style={btnPrimary} onClick={() => handleFold(false)} disabled={busy}>
                Mitspielen
              </button>
            </>
          )}
          {isMyFoldTurn && (me?.folded || me?.points <= 5) && (
            <button style={btnPrimary} onClick={() => handleFold(false)} disabled={busy}>
              Mitspielen (Pflicht)
            </button>
          )}
          {isMyPlayTurn && selectedCard && (
            <button style={btnPrimary} onClick={handlePlayCard} disabled={busy}>
              Karte ausspielen ✓
            </button>
          )}
          {roundOver && !gameOver && room.hostId === playerId && (
            <button style={btnPrimary} onClick={handleNextRound} disabled={busy}>
              Nächste Runde →
            </button>
          )}
          {roundOver && !gameOver && room.hostId !== playerId && (
            <span style={{ color: C.parchment, fontSize: 14 }}>Warte auf den Wirt…</span>
          )}
          {gameOver && (
            <button style={btnPrimary} onClick={() => useStore.getState().unsubscribe()}>
              Zurück zur Lobby
            </button>
          )}
        </div>
      </div>

      {/* ── MEINE HAND ── */}
      <div style={{
        background: C.wood,
        borderTop: `4px solid ${C.feltBorder}`,
        padding: '14px 20px 18px',
        boxShadow: '0 -3px 10px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 17,
            color: C.parchment,
            fontWeight: 700,
          }}>
            {me?.name ?? 'Du'}
            {me?.folded && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginLeft: 8, fontStyle: 'italic' }}>(ausgestiegen)</span>}
            {me?.tricks > 0 && (
              <span style={{ fontSize: 14, color: C.goldLight, marginLeft: 10 }}>
                · {me.tricks} Stich{me.tricks !== 1 ? 'e' : ''}
              </span>
            )}
          </span>
          {isMyPlayTurn && (
            <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>Du bist dran!</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {myHand.map(card => (
            <Card
              key={card.id}
              card={card}
              selected={selectedCard?.id === card.id}
              disabled={!isMyPlayTurn || !validIds.includes(card.id)}
              onClick={() => handleCardClick(card)}
              size="lg"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const btnBase = {
  borderRadius: 10,
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Lato', sans-serif",
  transition: 'opacity 0.15s',
  letterSpacing: '0.02em',
}
const btnPrimary = {
  ...btnBase,
  background: '#f0b429',
  color: '#2a1a08',
  border: '2px solid #c8960a',
}
const btnDanger = {
  ...btnBase,
  background: '#fff0ef',
  color: '#a02020',
  border: '2px solid #c0392b',
}
