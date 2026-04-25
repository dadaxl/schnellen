// src/lib/gameActions.js — Mulatschak
import { ref, set, update, push, get, serverTimestamp } from 'firebase/database'
import { db } from './firebase'
import {
  dealRound, trickWinner, validCardIds, calcPointChanges,
  canSitOut, isTrump, shuffle
} from './gameLogic'

// ─── Lobby ────────────────────────────────────────────────────────────────────

export async function createRoom(hostId, hostName, maxPlayers = 4) {
  const roomRef = push(ref(db, 'rooms'))
  const roomId = roomRef.key
  await set(roomRef, {
    hostId, maxPlayers, status: 'lobby',
    createdAt: serverTimestamp(),
    players: { [hostId]: { name: hostName, points: 21, joinedAt: serverTimestamp() } }
  })
  return roomId
}

export async function joinRoom(roomId, playerId, playerName) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  if (!snap.exists()) throw new Error('Raum nicht gefunden')
  const room = snap.val()
  if (room.status !== 'lobby') throw new Error('Spiel läuft bereits')
  const playerCount = Object.keys(room.players || {}).length
  if (playerCount >= room.maxPlayers) throw new Error('Raum ist voll')
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    name: playerName, points: 21, joinedAt: serverTimestamp()
  })
}

export async function leaveRoom(roomId, playerId) {
  await set(ref(db, `rooms/${roomId}/players/${playerId}`), null)
}

// ─── Spielstart ───────────────────────────────────────────────────────────────

export async function startGame(roomId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const playerIds = Object.keys(room.players)
  if (playerIds.length < 2) throw new Error('Mindestens 2 Spieler benötigt')

  const startPoints = {}
  const names = {}
  for (const pid of playerIds) {
    startPoints[pid] = room.players[pid].points ?? 21
    names[pid] = room.players[pid].name ?? pid
  }

  const gameState = dealRound(playerIds, 0, startPoints, names)

  // Zusammengefallen-Log
  const log = []
  if (gameState.allUntermHund) {
    log.push({ type: 'info', msg: 'Zusammengefallen! Punkte werden verdoppelt.' })
  }
  gameState.log = log

  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing', playerOrder: playerIds, gameState, round: 1,
  })
}

// ─── Bietphase ────────────────────────────────────────────────────────────────

// Gebot abgeben (0 = "weiter" / passen)
export async function placeBid(roomId, playerId, bid) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  if (gs.phase !== 'bidding') throw new Error('Keine Bietphase')
  if (playerOrder[gs.biddingTurn] !== playerId) throw new Error('Nicht dein Zug')

  const updates = {}
  const log = [...(gs.log || [])]
  const pname = gs.players[playerId].name ?? playerId
  const isDealer = gs.dealerIdx === gs.biddingTurn
  const n = playerOrder.length

  // Geber-Sonderregel: kann mit "bei mir" das aktuelle Höchstgebot übernehmen
  // bid === -1 bedeutet "bei mir" (Geber übernimmt aktuelles Höchstgebot)
  let newBid = gs.currentBid
  let newBidder = gs.currentBidder

  if (bid === 0) {
    // Weiter / passen
    log.push({ type: 'bid', player: pname, bid: 0 })
  } else if (bid === -1 && isDealer) {
    // "Bei mir" — Geber übernimmt aktuelles Höchstgebot
    newBidder = playerId
    log.push({ type: 'bid', player: pname, bid: newBid, beiMir: true })
  } else {
    // Normales Gebot — muss höher sein als aktuelles
    const minBid = isDealer ? gs.currentBid : gs.currentBid + 1
    if (bid < minBid) throw new Error(`Mindestgebot: ${minBid}`)
    if (bid > 5) throw new Error('Maximalgebot: 5')
    newBid = bid
    newBidder = playerId
    log.push({ type: 'bid', player: pname, bid })
  }

  // Nächsten Bieter bestimmen
  let nextTurn = (gs.biddingTurn + 1) % n

  // Bietphase endet wenn alle einmal dran waren und wir wieder beim
  // Ausgangspunkt sind ODER alle gepasst haben
  // Vereinfacht: Bietphase endet nach einer vollen Runde
  // (Geber ist immer letzter)
  const biddingDone = nextTurn === ((gs.dealerIdx + 1) % n) && newBidder !== null

  if (biddingDone || (newBid === 0 && nextTurn === (gs.dealerIdx + 1) % n)) {
    // Bietphase vorbei
    if (!newBidder) {
      // Niemand hat geboten — alle "weiter". Neu geben.
      log.push({ type: 'info', msg: 'Niemand hat geboten — neue Runde.' })
      updates[`rooms/${roomId}/gameState/phase`] = 'round_end'
      updates[`rooms/${roomId}/gameState/noOneBid`] = true
    } else {
      // Höchstbietender wählt Trumpf
      updates[`rooms/${roomId}/gameState/phase`] = 'trump_choice'
      updates[`rooms/${roomId}/gameState/currentPlayer`] = newBidder
      updates[`rooms/${roomId}/gameState/currentBidder`] = newBidder
      updates[`rooms/${roomId}/gameState/currentBid`] = newBid
      updates[`rooms/${roomId}/gameState/biddingDone`] = true
      // Stichansage beim Spieler vermerken
      updates[`rooms/${roomId}/gameState/players/${newBidder}/tricksBid`] = newBid
      log.push({ type: 'info', msg: `${gs.players[newBidder]?.name ?? newBidder} muss ${newBid} Stich${newBid !== 1 ? 'e' : ''} machen und wählt den Trumpf.` })
    }
  } else {
    updates[`rooms/${roomId}/gameState/biddingTurn`] = nextTurn
    updates[`rooms/${roomId}/gameState/currentBid`] = newBid
    updates[`rooms/${roomId}/gameState/currentBidder`] = newBidder
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

// ─── Trumpfwahl ───────────────────────────────────────────────────────────────

export async function chooseTrump(roomId, playerId, trumpSuit) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  if (gs.phase !== 'trump_choice') throw new Error('Keine Trumpfwahlphase')
  if (gs.currentBidder !== playerId) throw new Error('Nicht dein Zug')

  const validSuits = ['Eichel', 'Laub', 'Herz', 'Schellen']
  if (!validSuits.includes(trumpSuit)) throw new Error('Ungültige Farbe')

  const log = [...(gs.log || [])]
  const pname = gs.players[playerId].name ?? playerId
  log.push({ type: 'trump', player: pname, suit: trumpSuit })

  const updates = {}
  updates[`rooms/${roomId}/gameState/trumpSuit`] = trumpSuit
  updates[`rooms/${roomId}/gameState/phase`] = 'exchange'
  // Bei Muli (5 Stiche): kein Tausch
  if (gs.currentBid === 5) {
    updates[`rooms/${roomId}/gameState/phase`] = 'sit_out'
    updates[`rooms/${roomId}/gameState/sitOutTurn`] = (gs.dealerIdx + 1) % playerOrder.length
    log.push({ type: 'info', msg: 'Muli! Kein Kartentausch, alle müssen mitspielen.' })
  } else {
    // Wer darf daheimbleiben? — zuerst abfragen
    updates[`rooms/${roomId}/gameState/sitOutTurn`] = (gs.dealerIdx + 1) % playerOrder.length
    updates[`rooms/${roomId}/gameState/phase`] = 'sit_out'
    log.push({ type: 'info', msg: `Trumpf ist ${trumpSuit}${trumpSuit === 'Herz' ? ' — alle müssen mitspielen!' : ''}. Mitspielen oder daheimbleiben?` })
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

// ─── Daheimbleiben ────────────────────────────────────────────────────────────

export async function sitOutDecision(roomId, playerId, sitOut) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  if (gs.phase !== 'sit_out') throw new Error('Keine Daheimbleiben-Phase')
  if (playerOrder[gs.sitOutTurn] !== playerId) throw new Error('Nicht dein Zug')

  const p = gs.players[playerId]
  const isMuli = gs.currentBid === 5
  const isHerz = gs.trumpSuit === 'Herz'
  const isBidder = gs.currentBidder === playerId

  // Bidder und Pflichtmitspieler können nicht daheimbleiben
  if (isBidder || isMuli || isHerz || !canSitOut(p, gs.trumpSuit)) {
    sitOut = false
  }

  const log = [...(gs.log || [])]
  const pname = p.name ?? playerId
  const updates = {}
  const n = playerOrder.length

  if (sitOut) {
    updates[`rooms/${roomId}/gameState/players/${playerId}/sitting_out`] = true
    log.push({ type: 'sitout', player: pname })
  }

  // Nächsten Spieler für Daheimbleiben bestimmen (Bidder überspringen)
  let nextSitOut = (gs.sitOutTurn + 1) % n
  // Überspringe den Bidder (der muss immer mitspielen)
  while (playerOrder[nextSitOut] === gs.currentBidder && nextSitOut !== gs.sitOutTurn) {
    nextSitOut = (nextSitOut + 1) % n
  }

  // Sind alle durch? Dann zur Tauschrunde
  if (nextSitOut === (gs.dealerIdx + 1) % n || nextSitOut === gs.sitOutTurn) {
    // Alle aktiven Spieler (nicht daheimgeblieben) können tauschen
    // Bidder beginnt
    if (isMuli) {
      // Kein Tausch bei Muli — direkt spielen
      const firstPlayer = gs.currentBidder
      updates[`rooms/${roomId}/gameState/phase`] = 'play'
      updates[`rooms/${roomId}/gameState/currentPlayer`] = firstPlayer
      updates[`rooms/${roomId}/gameState/trickLeader`] = firstPlayer
    } else {
      updates[`rooms/${roomId}/gameState/phase`] = 'exchange'
      updates[`rooms/${roomId}/gameState/exchangeTurn`] = playerOrder.indexOf(gs.currentBidder)
      updates[`rooms/${roomId}/gameState/currentPlayer`] = gs.currentBidder
      log.push({ type: 'info', msg: 'Kartentausch! Jeder kann 0–5 Karten tauschen.' })
    }
  } else {
    updates[`rooms/${roomId}/gameState/sitOutTurn`] = nextSitOut
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

// ─── Kartentausch ─────────────────────────────────────────────────────────────

export async function exchangeCards(roomId, playerId, cardIdsToReturn) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  if (gs.phase !== 'exchange') throw new Error('Keine Tauschrunde')
  if (gs.currentPlayer !== playerId) throw new Error('Nicht dein Zug')

  const p = gs.players[playerId]
  const hand = [...p.hand]
  const deck = [...(gs.remainingDeck || [])]
  const log = [...(gs.log || [])]
  const pname = p.name ?? playerId

  if (cardIdsToReturn.length > 5) throw new Error('Maximal 5 Karten tauschbar')

  // Karten aus der Hand entfernen
  const newHand = hand.filter(c => !cardIdsToReturn.includes(c.id))
  // Neue Karten ziehen
  const drawn = deck.splice(0, cardIdsToReturn.length)
  newHand.push(...drawn)

  log.push({ type: 'exchange', player: pname, count: cardIdsToReturn.length })

  const updates = {}
  updates[`rooms/${roomId}/gameState/players/${playerId}/hand`] = newHand
  updates[`rooms/${roomId}/gameState/players/${playerId}/exchanged`] = true
  updates[`rooms/${roomId}/gameState/remainingDeck`] = deck

  // Nächster Tauscher — im Uhrzeigersinn ausgehend vom Bidder
  // Bidder war erster, dann die anderen, Daheimgebliebene überspringen
  const activePlayers = playerOrder.filter(pid => !gs.players[pid].sitting_out)
  const curIdx = activePlayers.indexOf(playerId)
  const nextIdx = (curIdx + 1) % activePlayers.length

  if (nextIdx === 0) {
    // Alle haben getauscht — Spiel beginnt
    const firstPlayer = gs.currentBidder
    updates[`rooms/${roomId}/gameState/phase`] = 'play'
    updates[`rooms/${roomId}/gameState/currentPlayer`] = firstPlayer
    updates[`rooms/${roomId}/gameState/trickLeader`] = firstPlayer
    log.push({ type: 'info', msg: 'Tausch abgeschlossen — Spiel beginnt!' })
  } else {
    updates[`rooms/${roomId}/gameState/currentPlayer`] = activePlayers[nextIdx]
    updates[`rooms/${roomId}/gameState/exchangeTurn`] = playerOrder.indexOf(activePlayers[nextIdx])
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

// ─── Karte spielen ────────────────────────────────────────────────────────────

export async function playCard(roomId, playerId, cardId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = { ...room.gameState }
  const playerOrder = room.playerOrder

  if (gs.phase !== 'play') throw new Error('Keine Spielphase')
  if (gs.currentPlayer !== playerId) throw new Error('Nicht dein Zug')

  const hand = gs.players[playerId].hand
  const cardIdx = hand.findIndex(c => c.id === cardId)
  if (cardIdx === -1) throw new Error('Karte nicht in Hand')

  const valid = validCardIds(hand, gs.currentTrick || [], gs.trumpSuit)
  if (!valid.includes(cardId)) throw new Error('Ungültige Karte (Farbzwang!)')

  const card = hand[cardIdx]
  const newHand = hand.filter((_, i) => i !== cardIdx)
  const newTrick = [...(gs.currentTrick || []), { playerIdx: playerId, card }]

  const updates = {}
  updates[`rooms/${roomId}/gameState/players/${playerId}/hand`] = newHand
  updates[`rooms/${roomId}/gameState/currentTrick`] = newTrick

  const activePlayers = playerOrder.filter(pid => !gs.players[pid].sitting_out)
  const log = [...(gs.log || [])]

  if (newTrick.length === activePlayers.length) {
    // Stich auswerten
    const winnerPid = trickWinner(newTrick, gs.trumpSuit)
    const winnerName = gs.players[winnerPid]?.name ?? winnerPid
    const winnerTricks = (gs.players[winnerPid].tricks || 0) + 1
    updates[`rooms/${roomId}/gameState/players/${winnerPid}/tricks`] = winnerTricks
    updates[`rooms/${roomId}/gameState/currentTrick`] = []
    updates[`rooms/${roomId}/gameState/lastTrick`] = { cards: newTrick, winnerPid }
    updates[`rooms/${roomId}/gameState/trickLeader`] = winnerPid
    updates[`rooms/${roomId}/gameState/currentPlayer`] = winnerPid
    log.push({ type: 'trick', winner: winnerName, count: winnerTricks })

    // Letzte Runde?
    const anyCardsLeft = activePlayers.some(pid =>
      pid === playerId ? newHand.length > 0 : (gs.players[pid].hand?.length ?? 0) > 0
    )

    if (!anyCardsLeft) {
      // Runde beenden — Punkte berechnen
      const fakePlayers = {}
      for (const pid of playerOrder) {
        fakePlayers[pid] = {
          ...gs.players[pid],
          tricks: pid === winnerPid ? winnerTricks : (gs.players[pid].tricks || 0)
        }
      }

      const changes = calcPointChanges(fakePlayers, playerOrder, gs.trumpSuit, gs.doublePoints)

      let gameWinner = null
      for (const pid of playerOrder) {
        const newPts = Math.max(0, (gs.players[pid].points ?? 21) + changes[pid])
        updates[`rooms/${roomId}/gameState/players/${pid}/points`] = newPts

        const p = fakePlayers[pid]
        if (p.sitting_out) {
          log.push({ type: 'result', player: p.name ?? pid, msg: 'daheimgeblieben (+1)' })
        } else if (p.tricksBid !== null) {
          if (p.tricks === p.tricksBid) {
            log.push({ type: 'result', player: p.name ?? pid, msg: `${p.tricks}/${p.tricksBid} Stiche ✓` })
          } else {
            log.push({ type: 'result', player: p.name ?? pid, msg: `Gefallen! ${p.tricks}/${p.tricksBid} Stiche` })
          }
        } else if (p.tricks === 0) {
          log.push({ type: 'result', player: p.name ?? pid, msg: 'Kein Stich — fällt!' })
        }
        if (newPts === 0) gameWinner = pid
      }

      updates[`rooms/${roomId}/gameState/phase`] = 'round_end'
      updates[`rooms/${roomId}/gameState/roundWinner`] = gameWinner
      if (gameWinner) {
        updates[`rooms/${roomId}/status`] = 'finished'
        updates[`rooms/${roomId}/winner`] = gameWinner
      }
    }
  } else {
    // Nächster Spieler im Stich
    const curIdx = activePlayers.indexOf(playerId)
    updates[`rooms/${roomId}/gameState/currentPlayer`] = activePlayers[(curIdx + 1) % activePlayers.length]
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

// ─── Nächste Runde ────────────────────────────────────────────────────────────

export async function startNextRound(roomId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  const startPoints = {}
  const names = {}
  for (const pid of playerOrder) {
    startPoints[pid] = gs.players[pid].points ?? 21
    names[pid] = gs.players[pid].name ?? pid
  }

  const newDealerIdx = (gs.dealerIdx + 1) % playerOrder.length
  const newGs = dealRound(playerOrder, newDealerIdx, startPoints, names)

  const log = []
  if (newGs.allUntermHund) {
    log.push({ type: 'info', msg: 'Zusammengefallen! Punkte werden verdoppelt.' })
  }
  newGs.log = log

  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing',
    gameState: newGs,
    round: (room.round || 1) + 1,
  })
}
