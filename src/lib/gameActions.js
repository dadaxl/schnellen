// src/lib/gameActions.js
import { ref, set, update, push, get, serverTimestamp } from 'firebase/database'
import { db } from './firebase'
import { dealRound, trickWinner, validCardIds, calcPointChanges } from './gameLogic'

export async function createRoom(hostId, hostName, maxPlayers = 3) {
  const roomRef = push(ref(db, 'rooms'))
  const roomId = roomRef.key
  await set(roomRef, {
    hostId, maxPlayers, status: 'lobby',
    createdAt: serverTimestamp(),
    players: { [hostId]: { name: hostName, points: 15, joinedAt: serverTimestamp() } }
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
    name: playerName, points: 15, joinedAt: serverTimestamp()
  })
}

export async function leaveRoom(roomId, playerId) {
  await set(ref(db, `rooms/${roomId}/players/${playerId}`), null)
}

export async function startGame(roomId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const playerIds = Object.keys(room.players)
  if (playerIds.length < 2) throw new Error('Mindestens 2 Spieler benoetigt')

  const startPoints = {}
  const names = {}
  for (const pid of playerIds) {
    startPoints[pid] = room.players[pid].points ?? 15
    names[pid] = room.players[pid].name ?? pid
  }
  const gameState = dealRound(playerIds, 0, startPoints, names)

  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing', playerOrder: playerIds, gameState, round: 1,
  })
}

export async function foldDecision(roomId, playerId, fold) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder
  const { players, dealerIdx, foldTurn } = gs

  if (playerOrder[foldTurn] !== playerId) throw new Error('Nicht dein Zug')

  const updates = {}
  const log = [...(gs.log || [])]

  if (fold && players[playerId].points > 5) {
    updates[`rooms/${roomId}/gameState/players/${playerId}/folded`] = true
    log.push({ type: 'fold', player: players[playerId].name ?? playerId })
  }

  const nextFoldTurn = (foldTurn + 1) % playerOrder.length

  if (nextFoldTurn === dealerIdx) {
    const firstPlayer = playerOrder[(dealerIdx + 1) % playerOrder.length]
    updates[`rooms/${roomId}/gameState/phase`] = 'play'
    updates[`rooms/${roomId}/gameState/currentPlayer`] = firstPlayer
    updates[`rooms/${roomId}/gameState/trickLeader`] = firstPlayer
    updates[`rooms/${roomId}/gameState/foldTurn`] = null
  } else {
    updates[`rooms/${roomId}/gameState/foldTurn`] = nextFoldTurn
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

export async function playCard(roomId, playerId, cardId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = { ...room.gameState }
  const playerOrder = room.playerOrder

  if (gs.currentPlayer !== playerId) throw new Error('Nicht dein Zug')

  const hand = gs.players[playerId].hand
  const cardIdx = hand.findIndex(c => c.id === cardId)
  if (cardIdx === -1) throw new Error('Karte nicht in Hand')

  const valid = validCardIds(hand, gs.currentTrick || [], gs.trumpSuit)
  if (!valid.includes(cardId)) throw new Error('Ungueltige Karte (Farbzwang!)')

  const card = hand[cardIdx]
  const newHand = hand.filter((_, i) => i !== cardIdx)
  const newTrick = [...(gs.currentTrick || []), { playerIdx: playerId, card }]

  const updates = {}
  updates[`rooms/${roomId}/gameState/players/${playerId}/hand`] = newHand
  updates[`rooms/${roomId}/gameState/currentTrick`] = newTrick

  const activePlayers = playerOrder.filter(pid => !gs.players[pid].folded)
  const log = [...(gs.log || [])]

  if (newTrick.length === activePlayers.length) {
    const winnerPid = trickWinner(newTrick, gs.trumpSuit)
    const winnerName = gs.players[winnerPid]?.name ?? winnerPid
    const winnerTricks = (gs.players[winnerPid].tricks || 0) + 1
    updates[`rooms/${roomId}/gameState/players/${winnerPid}/tricks`] = winnerTricks
    updates[`rooms/${roomId}/gameState/currentTrick`] = []
    updates[`rooms/${roomId}/gameState/trickLeader`] = winnerPid
    updates[`rooms/${roomId}/gameState/currentPlayer`] = winnerPid
    log.push({ type: 'trick', winner: winnerName, count: winnerTricks })

    const anyCardsLeft = activePlayers.some(pid =>
      pid === playerId ? newHand.length > 0 : (gs.players[pid].hand?.length ?? 0) > 0
    )

    if (!anyCardsLeft) {
      const isHerz = gs.trumpSuit === 'Herz'
      const currentPoints = {}
      for (const pid of playerOrder) currentPoints[pid] = gs.players[pid].points ?? 15
      const trickCounts = {}
      for (const pid of playerOrder) {
        trickCounts[pid] = gs.players[pid].tricks || 0
        if (pid === winnerPid) trickCounts[pid] = winnerTricks
      }
      const fakePlayers = {}
      for (const pid of playerOrder) fakePlayers[pid] = { ...gs.players[pid], tricks: trickCounts[pid] }
      const changes = calcPointChanges(fakePlayers, playerOrder, isHerz)

      let gameWinner = null
      for (const pid of playerOrder) {
        const newPts = Math.max(0, (currentPoints[pid] ?? 15) + changes[pid])
        updates[`rooms/${roomId}/gameState/players/${pid}/points`] = newPts
        if (fakePlayers[pid].tricks === 0 && !fakePlayers[pid].folded)
          log.push({ type: 'schnell', player: gs.players[pid]?.name ?? pid })
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
    const curIdx = activePlayers.indexOf(playerId)
    updates[`rooms/${roomId}/gameState/currentPlayer`] = activePlayers[(curIdx + 1) % activePlayers.length]
  }

  updates[`rooms/${roomId}/gameState/log`] = log
  await update(ref(db), updates)
}

export async function startNextRound(roomId) {
  const snap = await get(ref(db, `rooms/${roomId}`))
  const room = snap.val()
  const gs = room.gameState
  const playerOrder = room.playerOrder

  const startPoints = {}
  const names = {}
  for (const pid of playerOrder) {
    startPoints[pid] = gs.players[pid].points ?? 15
    names[pid] = gs.players[pid].name ?? pid
  }

  const newDealerIdx = (gs.dealerIdx + 1) % playerOrder.length
  const newGs = dealRound(playerOrder, newDealerIdx, startPoints, names)

  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing', gameState: newGs, round: (room.round || 1) + 1,
  })
}
