// src/lib/gameLogic.js — Mulatschak-Regeln

export const SUITS = ['Eichel', 'Laub', 'Herz', 'Schellen']
export const RANKS = ['6', '7', '8', '9', '10', 'U', 'O', 'K', 'A']
export const RANK_ORDER = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'U': 5, 'O': 6, 'K': 7, 'A': 8 }

// Prüft ob ein Spieler "unterm Hund" ist (nur 6–10, keine Figur)
export function isUntermHund(hand) {
  return hand.every(c => {
    if (c.suit === 'Weli') return false // Weli ist Figur
    return ['6', '7', '8', '9', '10'].includes(c.rank)
  })
}

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
  if (!trumpSuit) return false
  return card.suit === trumpSuit || card.suit === 'Weli'
}

// Trumpfreihenfolge: A > Weli > K > O > U > 10 > 9 > 8 > 7 > 6
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

// Farbzwang vor Stechzwang
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

// Initialer Deal: 5 Karten pro Spieler (3+2), kein Trumpf aufdecken
// Trumpf wird erst nach der Bietphase durch den Höchstbietenden gewählt
export function dealRound(playerIds, dealerIdx, startPoints, names = {}) {
  const deck = shuffle(makeDeck())
  let pos = 0
  const hands = {}

  for (const pid of playerIds) hands[pid] = []

  // Abhebe-Chance für Spieler rechts vom Geber (Weli-Abheben)
  // Wir implementieren das als: vor dem Austeilen kann der Spieler rechts abheben
  // Der Weli-Check passiert in der Action-Phase

  // 3 Karten an jeden (beginnend links vom Geber)
  const order = []
  for (let i = 1; i <= playerIds.length; i++)
    order.push(playerIds[(dealerIdx + i) % playerIds.length])

  for (const pid of order)
    for (let j = 0; j < 3; j++) hands[pid].push(deck[pos++])

  // 2 weitere Karten
  for (const pid of order)
    for (let j = 0; j < 2; j++) hands[pid].push(deck[pos++])

  // Rest-Deck für Tausch aufbewahren
  const remainingDeck = deck.slice(pos)

  const players = {}
  for (const pid of playerIds) {
    players[pid] = {
      name: names[pid] ?? pid,
      hand: hands[pid],
      tricks: 0,
      tricksBid: null,     // Angesagte Stiche
      points: startPoints[pid] ?? 21,
      sitting_out: false,  // daheimgeblieben
      exchanged: false,    // Hat bereits getauscht
    }
  }

  // Prüfe "zusammengefallen" (alle Spieler unterm Hund?)
  const allUntermHund = playerIds.every(pid => isUntermHund(players[pid].hand))

  // Erster Bieter: links vom Geber
  const firstBidder = playerIds[(dealerIdx + 1) % playerIds.length]

  return {
    phase: 'bidding',       // bidding → trump_choice → exchange → play → round_end
    players,
    remainingDeck,          // Für Kartentausch
    trumpSuit: null,        // Noch nicht bestimmt
    trumpCard: null,
    currentTrick: [],
    trickLeader: firstBidder,
    currentPlayer: firstBidder,
    dealerIdx,
    // Biet-Zustand
    currentBid: 0,          // Höchstes Gebot bisher
    currentBidder: null,    // Wer hat das höchste Gebot
    biddingTurn: (dealerIdx + 1) % playerIds.length,  // Wer ist gerade dran
    biddingDone: false,
    allUntermHund,
    doublePoints: allUntermHund, // Doppelt falls zusammengefallen
    roundWinner: null,
    log: [],
  }
}

// Punkteberechnung nach Mulatschak-Regeln
export function calcPointChanges(players, playerIds, trumpSuit, doublePoints) {
  const mult = (trumpSuit === 'Herz' ? 2 : 1) * (doublePoints ? 2 : 1)
  const changes = {}

  for (const pid of playerIds) {
    const p = players[pid]
    if (p.sitting_out) {
      // Daheimgeblieben: +1 (kein Doppelt bei Daheimbleiben)
      changes[pid] = +1
    } else if (p.tricksBid !== null) {
      // Stichansager
      if (p.tricks === p.tricksBid) {
        // Geschafft: Stiche abziehen
        changes[pid] = -(p.tricks * mult)
      } else {
        // Gefallen: +10 (×mult)
        changes[pid] = +(10 * mult)
      }
    } else {
      // Normaler Mitspieler
      if (p.tricks === 0) {
        // Kein Stich: +5 (×mult)
        changes[pid] = +(5 * mult)
      } else {
        changes[pid] = -(p.tricks * mult)
      }
    }
  }
  return changes
}

// Kann ein Spieler noch daheimbleiben?
export function canSitOut(player, trumpSuit) {
  if (trumpSuit === 'Herz') return false  // Bei Herz: alle müssen
  if (player.points <= 3) return false    // Bei ≤3 Punkten: Pflicht
  return true
}

// Kann ein Spieler noch bieten?
export function canBid(player) {
  // Ab 5 Punkten darf man keine Stiche mehr ansagen
  // (man kann noch mitspielen, aber nicht bieten)
  return player.points > 5
}
