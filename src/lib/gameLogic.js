// src/lib/gameLogic.js
// Alle Spielregeln als pure Funktionen

export const SUITS = ['Eichel', 'Laub', 'Herz', 'Schellen']
export const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A']
export const RANK_ORDER = { '7': 0, '8': 1, '9': 2, '10': 3, 'U': 4, 'O': 5, 'K': 6, 'A': 7 }
export const SUIT_SYMBOLS = { Eichel: '♣', Laub: '♠', Herz: '♥', Schellen: '♦', Weli: '🃏' }

export function makeDeck() {
  const deck = []
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, id: `${suit}-${rank}` })
  deck.push({ suit: 'Weli', rank: 'W', id: 'Weli' })
  return deck
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function isTrump(card, trumpSuit) {
  return card.suit === trumpSuit || card.suit === 'Weli'
}

export function cardStrength(card, trumpSuit) {
  if (isTrump(card, trumpSuit)) {
    if (card.rank === 'A') return 200
    if (card.suit === 'Weli') return 199
    return 100 + RANK_ORDER[card.rank]
  }
  return RANK_ORDER[card.rank]
}

export function winsOver(a, b, trumpSuit) {
  const aT = isTrump(a, trumpSuit)
  const bT = isTrump(b, trumpSuit)
  if (aT && !bT) return true
  if (!aT && bT) return false
  if (a.suit !== b.suit && !aT) return false
  return cardStrength(a, trumpSuit) > cardStrength(b, trumpSuit)
}

export function trickWinner(trick, trumpSuit) {
  let bestIdx = 0
  for (let i = 1; i < trick.length; i++) {
    if (winsOver(trick[i].card, trick[bestIdx].card, trumpSuit))
      bestIdx = i
  }
  return trick[bestIdx].playerIdx
}

// Gibt gültige Karten-IDs zurück (Farbzwang vor Stechzwang)
export function validCardIds(hand, currentTrick, trumpSuit) {
  if (currentTrick.length === 0) return hand.map(c => c.id)

  const leadCard = currentTrick[0].card
  const leadIsTrump = isTrump(leadCard, trumpSuit)

  let sameSuit = leadIsTrump
    ? hand.filter(c => isTrump(c, trumpSuit))
    : hand.filter(c => c.suit === leadCard.suit && !isTrump(c, trumpSuit))

  if (sameSuit.length > 0) {
    const currentBest = currentTrick.reduce((b, e) =>
      winsOver(e.card, b.card, trumpSuit) ? e : b, currentTrick[0])
    const higher = sameSuit.filter(c => winsOver(c, currentBest.card, trumpSuit))
    return (higher.length > 0 ? higher : sameSuit).map(c => c.id)
  }

  const trumps = hand.filter(c => isTrump(c, trumpSuit))
  if (trumps.length > 0) return trumps.map(c => c.id)
  return hand.map(c => c.id)
}



// Erstellt initialen Spielzustand für eine neue Runde
// names: { [pid]: 'Spielername' } — optional, wird im gameState gespeichert
export function dealRound(playerIds, dealerIdx, startPoints, names = {}) {
  const deck = shuffle(makeDeck())
  let pos = 0
  const hands = {}

  for (const pid of playerIds) hands[pid] = []

  // 3 Karten an jeden
  for (const pid of playerIds)
    for (let j = 0; j < 3; j++) hands[pid].push(deck[pos++])

  // Geber-Karte aufdecken (Trumpf)
  const trumpCard = deck[pos++]
  const trumpSuit = trumpCard.suit === 'Weli' ? 'Herz' : trumpCard.suit
  hands[playerIds[dealerIdx]].push(trumpCard)

  // 2 weitere Karten
  for (const pid of playerIds)
    for (let j = 0; j < 2; j++) hands[pid].push(deck[pos++])

  const players = {}
  for (let i = 0; i < playerIds.length; i++) {
    const pid = playerIds[i]
    players[pid] = {
      name: names[pid] ?? pid,   // Name aus Lobby übernehmen
      hand: hands[pid],
      tricks: 0,
      points: startPoints[pid] ?? 15,
      folded: false,
      ready: false,
    }
  }

  return {
    phase: 'fold',
    players,
    trumpCard,
    trumpSuit,
    currentTrick: [],
    trickLeader: playerIds[(dealerIdx + 1) % playerIds.length],
    currentPlayer: playerIds[(dealerIdx + 1) % playerIds.length],
    dealerIdx,
    foldTurn: (dealerIdx + 1) % playerIds.length,
    roundWinner: null,
    log: [],
  }
}

// Gibt zurück wie viele Punkte sich nach der Runde ändern
export function calcPointChanges(players, playerIds, isHerz) {
  const multiplier = isHerz ? 2 : 1
  const changes = {}
  for (const pid of playerIds) {
    const p = players[pid]
    if (p.folded) {
      changes[pid] = +1
    } else if (p.tricks === 0) {
      changes[pid] = +(5 * multiplier)   // schnellt!
    } else {
      changes[pid] = -(p.tricks * multiplier)
    }
  }
  return changes
}
