// src/components/GameBoard.jsx — Mulatschak mit Animationen & Drag-and-Drop
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../lib/store'
import { placeBid, chooseTrump, sitOutDecision, exchangeCards, playCard, startNextRound } from '../lib/gameActions'
import { validCardIds, canSitOut } from '../lib/gameLogic'
import { Card } from './Card'

const C = {
  bg: '#f5ede0', felt: '#4a7c59', feltDark: '#3a6147', feltBorder: '#2e4f39',
  wood: '#8b5e3c', woodLight: '#a87040', cream: '#fdf8f0', ink: '#2a1a08',
  inkLight: '#5c3d1e', red: '#c0392b', green: '#27ae60', gold: '#c8960a',
  goldLight: '#f0b429', parchment: '#f0e4c8', parchDark: '#d9c9a0',
}
const SUITS = ['Eichel', 'Laub', 'Herz', 'Schellen']
const SUIT_EMOJI = { Eichel: '♣', Laub: '♠', Herz: '♥', Schellen: '♦' }
const CARD_W = 80, CARD_H = 116

// ── CSS Keyframes als <style> Tag ─────────────────────────────────────────────
const ANIM_STYLE = `
@keyframes dealIn {
  from { opacity: 0; transform: translateY(-60px) rotate(var(--card-angle)); }
  to   { opacity: 1; transform: translateY(0)      rotate(var(--card-angle)); }
}
@keyframes trickWin {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.08); box-shadow: 0 0 28px rgba(240,180,41,0.7); }
  100% { transform: scale(1); }
}
@keyframes slideToWinner {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.4) translateY(-40px); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cardDeal {
  from { opacity: 0; transform: translateX(-120px) rotate(-15deg) scale(0.6); }
  to   { opacity: 1; transform: translateX(0) rotate(0deg) scale(1); }
}
`

// ── Letzer Stich Overlay ──────────────────────────────────────────────────────
function LastTrickOverlay({ lastTrick, nameOf, onClose }) {
  if (!lastTrick) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeInUp 0.25s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{
        background: C.feltDark,
        backgroundImage: 'url(/texture-felt.jpg)',
        backgroundSize: '400px 400px',
        borderRadius: 20,
        padding: '24px 32px',
        border: `3px solid ${C.goldLight}`,
        boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
        textAlign: 'center',
        minWidth: 300,
      }}>
        <p style={{ fontFamily: "'Rye', serif", fontSize: 18, color: C.goldLight, marginBottom: 16 }}>
          Letzter Stich — {nameOf(lastTrick.winnerPid)} gewinnt
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          {lastTrick.cards.map((entry, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                animation: entry.playerIdx === lastTrick.winnerPid ? 'trickWin 0.6s ease' : 'none',
                border: entry.playerIdx === lastTrick.winnerPid ? `3px solid ${C.goldLight}` : '1px solid rgba(255,255,255,0.3)',
                borderRadius: 8, overflow: 'hidden',
              }}>
                <img
                  src={entry.card.suit === 'Weli' ? '/cards/weli.png' : `/cards/${entry.card.suit.toLowerCase()}-${entry.card.rank.toLowerCase()}.png`}
                  alt={`${entry.card.rank} ${entry.card.suit}`}
                  style={{ width: CARD_W, height: CARD_H, objectFit: 'cover', display: 'block' }}
                />
              </div>
              <span style={{ fontSize: 12, color: C.parchment, fontWeight: entry.playerIdx === lastTrick.winnerPid ? 700 : 400 }}>
                {entry.playerIdx === lastTrick.winnerPid ? '🏆 ' : ''}{nameOf(entry.playerIdx)}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Tippen zum Schließen</p>
      </div>
    </div>
  )
}

// ── Aufgefächerte Hand mit Deal-Animation & Drag-and-Drop ────────────────────
function FanHand({ hand, selectedCards, validIds, isMyTurn, me, onCardClick, multiSelect,
                   onDropCard, handVersion }) {
  const n = hand.length
  const MAX_ANGLE = Math.min(5 * (n - 1), 40)
  const step = n > 1 ? MAX_ANGLE / (n - 1) : 0
  const startAngle = -MAX_ANGLE / 2
  const OVERLAP = 0.50
  const FAN_HEIGHT = CARD_H + 60
  const [dragging, setDragging] = useState(null)
  const [dealKey, setDealKey] = useState(0)

  // Deal-Animation bei neuer Hand
  useEffect(() => { setDealKey(k => k + 1) }, [handVersion])

  if (n === 0) return (
    <div style={woodBg}>
      <span style={{ color: C.parchment, fontSize: 14, fontStyle: 'italic' }}>Keine Karten</span>
    </div>
  )

  return (
    <div style={{ ...woodBg, padding: '8px 20px 20px' }}>
      <style>{ANIM_STYLE}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: C.parchment, fontWeight: 700 }}>
          {me?.name ?? 'Du'}
          {me?.sitting_out && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginLeft: 8, fontStyle: 'italic' }}>(daheimgeblieben)</span>}
          {me?.tricks > 0 && <span style={{ fontSize: 13, color: C.goldLight, marginLeft: 10 }}>· {me.tricks} Stich{me.tricks !== 1 ? 'e' : ''}</span>}
          {me?.tricksBid != null && <span style={{ fontSize: 12, color: C.parchDark, marginLeft: 8 }}>(angesagt: {me.tricksBid})</span>}
        </span>
        {isMyTurn && !multiSelect && <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>Du bist dran!</span>}
        {multiSelect && <span style={{ fontSize: 13, color: C.goldLight, fontWeight: 700 }}>{selectedCards.length} zum Tauschen</span>}
      </div>

      <div style={{ position: 'relative', height: FAN_HEIGHT }}>
        {hand.map((card, i) => {
          const angleDeg = startAngle + i * step
          const isSelected = selectedCards.some(c => c.id === card.id)
          const isDisabled = !isMyTurn || (validIds.length > 0 && !validIds.includes(card.id))
          const isValid = isMyTurn && (validIds.length === 0 || validIds.includes(card.id))
          const isDragging = dragging?.id === card.id

          return (
            <div
              key={card.id}
              onClick={!isDisabled ? () => onCardClick(card) : undefined}
              draggable={isValid && !multiSelect}
              onDragStart={isValid && !multiSelect ? (e) => {
                setDragging(card)
                e.dataTransfer.setData('cardId', card.id)
                e.dataTransfer.effectAllowed = 'move'
                // Ghost image
                const ghost = e.currentTarget.cloneNode(true)
                ghost.style.position = 'fixed'
                ghost.style.top = '-200px'
                document.body.appendChild(ghost)
                e.dataTransfer.setDragImage(ghost, CARD_W/2, CARD_H/2)
                setTimeout(() => document.body.removeChild(ghost), 0)
              } : undefined}
              onDragEnd={() => setDragging(null)}
              title={`${card.rank} ${card.suit}`}
              style={{
                position: 'absolute',
                left: i * CARD_W * (1 - OVERLAP),
                bottom: isSelected ? 36 : 0,
                width: CARD_W, height: CARD_H,
                transform: `rotate(${angleDeg}deg)`,
                transformOrigin: 'bottom center',
                zIndex: isSelected || isDragging ? 100 : i,
                cursor: isDisabled ? 'default' : isValid && !multiSelect ? 'grab' : 'pointer',
                transition: 'bottom 0.18s ease, opacity 0.15s',
                opacity: isDragging ? 0.35 : 1,
                filter: isDisabled ? 'brightness(0.55) saturate(0.4)'
                  : isSelected ? 'brightness(1.08) drop-shadow(0 0 6px rgba(240,180,41,0.7))'
                  : 'brightness(1)',
                // Deal-Animation gestaffelt
                animation: `cardDeal 0.35s ease both`,
                animationDelay: `${i * 0.06}s`,
                animationName: 'cardDeal',
              }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: 7,
                border: isSelected ? '3px solid #f0b429'
                  : isValid ? '2px solid rgba(255,255,255,0.55)'
                  : '1px solid rgba(0,0,0,0.22)',
                overflow: 'hidden',
                boxShadow: isSelected ? '0 10px 28px rgba(0,0,0,0.55)' : '0 3px 10px rgba(0,0,0,0.4)',
                background: '#fff',
              }}>
                <img
                  src={card.suit === 'Weli' ? '/cards/weli.png' : `/cards/${card.suit.toLowerCase()}-${card.rank.toLowerCase()}.png`}
                  alt={`${card.rank} ${card.suit}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                  draggable={false}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Drop-Zone (Tisch) ─────────────────────────────────────────────────────────
function TableDropZone({ children, onDrop, canDrop }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      onDragOver={canDrop ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={() => setDragOver(false)}
      onDrop={canDrop ? (e) => {
        e.preventDefault()
        setDragOver(false)
        const cardId = e.dataTransfer.getData('cardId')
        if (cardId) onDrop(cardId)
      } : undefined}
      style={{
        background: dragOver ? 'rgba(240,180,41,0.15)' : C.feltDark,
        backgroundImage: 'url(/texture-felt.jpg)',
        backgroundSize: '400px 400px',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: dragOver ? 'normal' : 'multiply',
        borderRadius: 14,
        padding: '14px 18px',
        minHeight: 130,
        border: dragOver ? `3px solid ${C.goldLight}` : `2px solid ${C.feltBorder}`,
        boxShadow: dragOver ? `0 0 24px rgba(240,180,41,0.3), inset 0 2px 8px rgba(0,0,0,0.3)` : 'inset 0 2px 8px rgba(0,0,0,0.3)',
        transition: 'border 0.15s, box-shadow 0.15s, background 0.15s',
      }}
    >
      {children}
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
export function GameBoard() {
  const { playerId, room, roomId } = useStore()
  const [selectedCard, setSelectedCard] = useState(null)
  const [selectedExchange, setSelectedExchange] = useState([])
  const [showLastTrick, setShowLastTrick] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [handVersion, setHandVersion] = useState(0)
  const prevHandLen = useRef(0)

  if (!room || !room.gameState) return null
  const gs = room.gameState
  const playerOrder = room.playerOrder || []
  const me = gs.players?.[playerId]
  const phase = gs.phase
  const nameOf = pid => gs.players?.[pid]?.name ?? pid

  // Deal-Animation auslösen wenn neue Karten kommen
  const myHandLen = me?.hand?.length ?? 0
  useEffect(() => {
    if (myHandLen > prevHandLen.current && phase === 'exchange') {
      setHandVersion(v => v + 1)
    }
    if (phase === 'bidding') setHandVersion(v => v + 1) // neue Runde
    prevHandLen.current = myHandLen
  }, [myHandLen, phase])

  // Letzter Stich: automatisch einblenden wenn Stich fertig
  const prevTrickLen = useRef(0)
  const currTrickLen = gs.currentTrick?.length ?? 0
  useEffect(() => {
    if (prevTrickLen.current > 0 && currTrickLen === 0 && gs.lastTrick) {
      setShowLastTrick(true)
      const t = setTimeout(() => setShowLastTrick(false), 3000)
      return () => clearTimeout(t)
    }
    prevTrickLen.current = currTrickLen
  }, [currTrickLen, gs.lastTrick])

  const act = async (fn) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const myHand = me?.hand || []
  const isMyBidTurn   = phase === 'bidding'      && playerOrder[gs.biddingTurn] === playerId
  const isMyTrump     = phase === 'trump_choice' && gs.currentBidder === playerId
  const isMySitOut    = phase === 'sit_out'      && playerOrder[gs.sitOutTurn] === playerId && gs.currentBidder !== playerId
  const isMyExchange  = phase === 'exchange'     && gs.currentPlayer === playerId && !me?.exchanged
  const isMyPlayTurn  = phase === 'play'         && gs.currentPlayer === playerId
  const validIds      = isMyPlayTurn ? validCardIds(myHand, gs.currentTrick || [], gs.trumpSuit) : []

  const roundOver = phase === 'round_end'
  const gameOver  = room.status === 'finished'
  const log = (gs.log || []).slice(-5)
  const isHerz = gs.trumpSuit === 'Herz'
  const canPlayerSitOut = me && canSitOut(me, gs.trumpSuit) && gs.currentBidder !== playerId && gs.currentBid !== 5

  // Karte antippen (Spiel oder Tausch)
  const handlePlayClick = (card) => {
    if (!isMyPlayTurn || !validIds.includes(card.id)) return
    setSelectedCard(s => s?.id === card.id ? null : card)
  }
  const handleExchangeClick = (card) => {
    if (!isMyExchange) return
    setSelectedExchange(prev => prev.some(c => c.id === card.id) ? prev.filter(c => c.id !== card.id) : [...prev, card])
  }
  const handleCardClick = isMyExchange ? handleExchangeClick : handlePlayClick

  // Drag & Drop: Karte auf Tisch ziehen
  const handleDropOnTable = useCallback((cardId) => {
    if (!isMyPlayTurn) return
    if (!validIds.includes(cardId)) { setErr('Diese Karte darf nicht gespielt werden (Farbzwang)'); return }
    act(() => playCard(roomId, playerId, cardId))
    setSelectedCard(null)
  }, [isMyPlayTurn, validIds, roomId, playerId])

  const selectedCards = isMyExchange ? selectedExchange : (selectedCard ? [selectedCard] : [])

  // Phasentext
  let phaseMsg = ''
  if (gameOver) phaseMsg = `🏆 ${nameOf(room.winner)} gewinnt das Spiel!`
  else if (roundOver) phaseMsg = gs.noOneBid ? 'Niemand hat geboten — neue Runde!' : 'Runde vorbei!'
  else if (phase === 'bidding') phaseMsg = isMyBidTurn ? `Dein Gebot (aktuell: ${gs.currentBid})` : `${nameOf(playerOrder[gs.biddingTurn])} bietet… (${gs.currentBid})`
  else if (phase === 'trump_choice') phaseMsg = isMyTrump ? 'Wähle die Trumpffarbe!' : `${nameOf(gs.currentBidder)} wählt Trumpf…`
  else if (phase === 'sit_out') phaseMsg = isMySitOut ? 'Mitspielen oder daheimbleiben?' : `${nameOf(playerOrder[gs.sitOutTurn])} entscheidet…`
  else if (phase === 'exchange') phaseMsg = isMyExchange ? 'Wähle Karten zum Tauschen (0–5)' : `${nameOf(gs.currentPlayer)} tauscht…`
  else if (phase === 'play') phaseMsg = isMyPlayTurn ? (selectedCard ? 'Karte auf den Tisch ziehen oder Button drücken' : 'Karte wählen oder direkt auf den Tisch ziehen') : `${nameOf(gs.currentPlayer)} spielt…`

  return (
    <div style={{ minHeight: '100vh', background: C.bg, backgroundImage: 'url(/texture-wood.jpg)', backgroundSize: '800px auto', backgroundRepeat: 'repeat', display: 'flex', flexDirection: 'column', fontFamily: "'Lato', sans-serif" }}>
      <style>{ANIM_STYLE}</style>

      {/* Letzter Stich Overlay */}
      {showLastTrick && gs.lastTrick && (
        <LastTrickOverlay
          lastTrick={gs.lastTrick}
          nameOf={nameOf}
          onClose={() => setShowLastTrick(false)}
        />
      )}

      {/* HEADER */}
      <div style={{ background: C.wood, backgroundImage: 'url(/texture-wood.jpg)', backgroundSize: '800px auto', backgroundRepeat: 'repeat', borderBottom: `4px solid ${C.feltBorder}`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 3px 10px rgba(0,0,0,0.25)' }}>
        <h1 style={{ fontFamily: "'Rye', serif", fontSize: 32, color: C.goldLight, flex: 1, textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }}>Mulatschak</h1>
        {gs.trumpSuit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.parchment, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Trumpf</span>
            <span style={{ fontSize: 26 }}>{SUIT_EMOJI[gs.trumpSuit]}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: isHerz ? C.goldLight : C.parchment, fontFamily: "'Playfair Display', serif" }}>
              {gs.trumpSuit}{isHerz ? ' ×2' : ''}
            </span>
          </div>
        )}
        {gs.currentBid > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '4px 12px', color: C.goldLight, fontSize: 14, fontWeight: 700 }}>
            Gebot: {gs.currentBid} {gs.currentBidder ? `(${nameOf(gs.currentBidder)})` : ''}
          </div>
        )}
        {/* Letzter Stich Button */}
        {gs.lastTrick && phase === 'play' && (
          <button
            style={{ ...btnBase, background: 'rgba(0,0,0,0.3)', color: C.parchment, border: `1px solid rgba(255,255,255,0.2)`, fontSize: 13, padding: '6px 12px' }}
            onClick={() => setShowLastTrick(true)}
          >Letzter Stich</button>
        )}
        <div style={{ background: C.parchment, borderRadius: 8, padding: '6px 14px', textAlign: 'center', border: `2px solid ${C.woodLight}` }}>
          <div style={{ fontSize: 11, color: C.inkLight, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Punkte</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: me?.points <= 5 ? C.green : C.ink, lineHeight: 1.1 }}>{me?.points ?? 21}</div>
        </div>
      </div>

      {/* SPIELFELD */}
      <div style={{ flex: 1, background: C.felt, backgroundImage: 'url(/texture-felt.jpg)', backgroundSize: '400px 400px', backgroundRepeat: 'repeat', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        <div style={{ background: gameOver ? '#d4edda' : roundOver ? C.parchment : C.cream, border: `2px solid ${gameOver ? C.green : roundOver ? C.parchDark : C.gold}`, borderRadius: 10, padding: '9px 16px', fontSize: 15, fontWeight: 700, color: gameOver ? '#1a5c2a' : C.ink, textAlign: 'center', fontFamily: "'Playfair Display', serif" }}>
          {phaseMsg}
        </div>

        {err && <div style={{ color: '#fff', background: C.red, borderRadius: 8, padding: '7px 14px', fontSize: 13, animation: 'fadeInUp 0.2s ease' }}>{err}</div>}

        {/* Log */}
        {log.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {log.map((e, i) => (
              <span key={i} style={{ background: 'rgba(0,0,0,0.2)', color: '#d4f0d4', borderRadius: 20, padding: '2px 10px', fontSize: 12, animation: 'fadeInUp 0.2s ease' }}>
                {e.type === 'bid'      && (e.beiMir ? `${e.player}: bei mir! (${e.bid})` : e.bid === 0 ? `${e.player}: weiter` : `${e.player}: ${e.bid}`)}
                {e.type === 'trump'    && `${e.player} → ${e.suit} ${SUIT_EMOJI[e.suit]}`}
                {e.type === 'sitout'   && `${e.player} bleibt daheim`}
                {e.type === 'exchange' && `${e.player} tauscht ${e.count}`}
                {e.type === 'trick'    && `${e.winner} gewinnt Stich ${e.count}`}
                {e.type === 'result'   && `${e.player}: ${e.msg}`}
                {e.type === 'info'     && e.msg}
              </span>
            ))}
          </div>
        )}

        {/* Gegner */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {playerOrder.filter(pid => pid !== playerId).map(pid => {
            const p = gs.players[pid]
            const isActive = gs.currentPlayer === pid
            const isBidder = gs.currentBidder === pid
            const isBidTurn = phase === 'bidding' && playerOrder[gs.biddingTurn] === pid
            return (
              <div key={pid} style={{ flex: 1, minWidth: 150, background: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)', borderRadius: 12, padding: '10px 14px', border: isActive ? `3px solid ${C.goldLight}` : isBidder ? `2px solid ${C.gold}` : '2px solid rgba(0,0,0,0.15)', transition: 'border 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: isActive ? C.goldLight : C.cream }}>
                      {p?.name ?? pid}{isActive && phase === 'play' && <span style={{ fontSize: 11, marginLeft: 4 }}>▶</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      {p?.sitting_out && 'daheimgeblieben'}
                      {isBidder && !p?.sitting_out && `Gebot: ${p?.tricksBid}`}
                      {isBidTurn && <span style={{ color: C.goldLight }}>bietet…</span>}
                      {p?.tricks > 0 && !p?.sitting_out && ` ${p.tricks} Stich${p.tricks !== 1 ? 'e' : ''}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 900, color: p?.points <= 5 ? '#7eff9e' : C.cream }}>{p?.points ?? '?'}</span>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {!p?.sitting_out && Array.from({ length: p?.hand?.length ?? 0 }).map((_, i) => (
                    <Card key={i} faceDown size="sm" disabled />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tisch mit Drop-Zone */}
        <TableDropZone onDrop={handleDropOnTable} canDrop={isMyPlayTurn}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
            Tisch {isMyPlayTurn && <span style={{ color: C.goldLight, fontSize: 10 }}>← Karte hier fallenlassen</span>}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', minHeight: 80 }}>
            {(gs.currentTrick || []).map((entry, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, animation: 'fadeInUp 0.25s ease' }}>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                  <img
                    src={entry.card.suit === 'Weli' ? '/cards/weli.png' : `/cards/${entry.card.suit.toLowerCase()}-${entry.card.rank.toLowerCase()}.png`}
                    alt={`${entry.card.rank} ${entry.card.suit}`}
                    style={{ width: CARD_W, height: CARD_H, objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <span style={{ fontSize: 12, color: C.parchment, fontWeight: 700 }}>{nameOf(entry.playerIdx)}</span>
              </div>
            ))}
            {!gs.currentTrick?.length && (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                {phase === 'bidding' && 'Bietphase…'}
                {phase === 'trump_choice' && 'Trumpfwahl…'}
                {phase === 'sit_out' && 'Mitspieler werden bestimmt…'}
                {phase === 'exchange' && 'Kartentausch…'}
                {phase === 'play' && 'Noch keine Karte gespielt'}
              </span>
            )}
          </div>
        </TableDropZone>

        {/* Aktionen je Phase */}
        {isMyBidTurn && <BiddingPanel currentBid={gs.currentBid} isDealer={gs.dealerIdx === gs.biddingTurn} onBid={bid => act(() => placeBid(roomId, playerId, bid))} busy={busy} />}

        {isMyTrump && (
          <div style={{ background: C.cream, borderRadius: 12, padding: '12px 16px', border: `2px solid ${C.gold}` }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: C.ink, marginBottom: 10, fontWeight: 700 }}>Du hast {gs.currentBid} Stich{gs.currentBid !== 1 ? 'e' : ''} angesagt — wähle den Trumpf:</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUITS.map(suit => (
                <button key={suit} style={{ ...btnPrimary, flex: 1, fontSize: 17 }} onClick={() => act(() => chooseTrump(roomId, playerId, suit))} disabled={busy}>
                  {SUIT_EMOJI[suit]} {suit}
                </button>
              ))}
            </div>
          </div>
        )}

        {isMySitOut && (
          <div style={{ background: C.cream, borderRadius: 12, padding: '12px 16px', border: `2px solid ${C.gold}` }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: C.ink, marginBottom: 10, fontWeight: 700 }}>Trumpf: {gs.trumpSuit} {SUIT_EMOJI[gs.trumpSuit]}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {canPlayerSitOut && <button style={btnDanger} onClick={() => act(() => sitOutDecision(roomId, playerId, true))} disabled={busy}>Daheimbleiben (+1)</button>}
              <button style={btnPrimary} onClick={() => act(() => sitOutDecision(roomId, playerId, false))} disabled={busy}>
                {canPlayerSitOut ? 'Mitspielen' : `Mitspielen (Pflicht)`}
              </button>
            </div>
          </div>
        )}

        {isMyExchange && (
          <div style={{ background: C.cream, borderRadius: 12, padding: '12px 16px', border: `2px solid ${C.gold}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: C.ink, flex: 1 }}>
              {selectedExchange.length === 0 ? 'Alle Karten behalten' : `${selectedExchange.length} Karte${selectedExchange.length !== 1 ? 'n' : ''} tauschen`}
            </span>
            <button style={btnPrimary} onClick={() => act(async () => { await exchangeCards(roomId, playerId, selectedExchange.map(c => c.id)); setSelectedExchange([]) })} disabled={busy}>
              {selectedExchange.length === 0 ? 'Behalten ✓' : `Tauschen (${selectedExchange.length}) ✓`}
            </button>
          </div>
        )}

        {isMyPlayTurn && selectedCard && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnPrimary} onClick={() => { act(() => playCard(roomId, playerId, selectedCard.id)); setSelectedCard(null) }} disabled={busy}>Karte ausspielen ✓</button>
            <button style={btnDanger} onClick={() => setSelectedCard(null)}>Abbrechen</button>
          </div>
        )}

        {roundOver && !gameOver && room.hostId === playerId && (
          <button style={{ ...btnPrimary, fontSize: 16, padding: '13px' }} onClick={() => act(() => startNextRound(roomId))} disabled={busy}>Nächste Runde →</button>
        )}
        {roundOver && !gameOver && room.hostId !== playerId && <span style={{ color: C.parchment, fontSize: 14 }}>Warte auf den Wirt…</span>}
        {gameOver && <button style={{ ...btnPrimary, fontSize: 16 }} onClick={() => useStore.getState().unsubscribe()}>Zurück zur Lobby</button>}
      </div>

      {/* MEINE HAND */}
      <FanHand
        hand={myHand}
        selectedCards={selectedCards}
        validIds={isMyPlayTurn ? validIds : []}
        isMyTurn={isMyPlayTurn || isMyExchange}
        me={me}
        onCardClick={handleCardClick}
        multiSelect={isMyExchange}
        onDropCard={handleDropOnTable}
        handVersion={handVersion}
      />
    </div>
  )
}

function BiddingPanel({ currentBid, isDealer, onBid, busy }) {
  const minBid = isDealer ? currentBid : currentBid + 1
  const bids = [1, 2, 3, 4, 5].filter(b => b >= minBid)
  return (
    <div style={{ background: C.cream, borderRadius: 12, padding: '12px 16px', border: `2px solid ${C.gold}` }}>
      <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, color: C.ink, marginBottom: 10, fontWeight: 700 }}>
        Dein Gebot {currentBid > 0 ? `(aktuell: ${currentBid})` : ''}:
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...btnDanger, flex: 1 }} onClick={() => onBid(0)} disabled={busy}>Weiter / Passen</button>
        {bids.map(b => (
          <button key={b} style={{ ...btnPrimary, flex: 1 }} onClick={() => onBid(b)} disabled={busy}>
            {b === 5 ? '5 — Muli!' : `${b} Stich${b !== 1 ? 'e' : ''}`}
          </button>
        ))}
        {isDealer && currentBid > 0 && (
          <button style={{ ...btnPrimary, flex: 2, background: C.wood, borderColor: C.woodLight, color: C.parchment }} onClick={() => onBid(-1)} disabled={busy}>
            Bei mir! ({currentBid})
          </button>
        )}
      </div>
    </div>
  )
}

const woodBg = {
  background: C.wood, backgroundImage: 'url(/texture-wood.jpg)',
  backgroundSize: '800px auto', backgroundRepeat: 'repeat',
  borderTop: `4px solid ${C.feltBorder}`,
  boxShadow: '0 -3px 10px rgba(0,0,0,0.2)',
}
const btnBase = { borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Lato', sans-serif" }
const btnPrimary = { ...btnBase, background: '#f0b429', color: '#2a1a08', border: '2px solid #c8960a' }
const btnDanger  = { ...btnBase, background: '#fff0ef', color: '#a02020', border: '2px solid #c0392b' }
