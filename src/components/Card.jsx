// src/components/Card.jsx — Echte Kartenbilder

function cardImageUrl(card) {
  if (!card) return null
  if (card.suit === 'Weli') return '/cards/weli.png'
  return `/cards/${card.suit.toLowerCase()}-${card.rank.toLowerCase()}.png`
}

export function Card({ card, selected, disabled, onClick, size = 'md', faceDown = false }) {
  const sizes = {
    sm: { w: 42,  h: 60  },
    md: { w: 60,  h: 87  },
    lg: { w: 80,  h: 116 },
  }
  const { w, h } = sizes[size]

  const outer = {
    width: w,
    height: h,
    borderRadius: 7,
    border: selected
      ? '3px solid #f0b429'
      : disabled
        ? '1px solid rgba(0,0,0,0.15)'
        : '1px solid rgba(0,0,0,0.25)',
    background: faceDown ? '#3a2510' : '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transform: selected ? 'translateY(-16px) rotate(-1deg)' : 'none',
    transition: 'transform 0.15s ease, border 0.1s, opacity 0.1s',
    flexShrink: 0,
    userSelect: 'none',
    boxShadow: selected
      ? '0 8px 20px rgba(0,0,0,0.35), 0 0 0 1px #c8960a'
      : '0 2px 6px rgba(0,0,0,0.22)',
    position: 'relative',
    overflow: 'hidden',
  }

  if (faceDown) {
    return (
      <div style={outer}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0 }}>
          <rect width={w} height={h} fill="#3a2510"/>
          <rect x="3" y="3" width={w-6} height={h-6} rx="5" fill="none" stroke="#c8960a" strokeWidth="1" opacity="0.6"/>
          <rect x="6" y="6" width={w-12} height={h-12} rx="3" fill="none" stroke="#c8960a" strokeWidth="0.5" opacity="0.3"/>
          <path
            d={`M${w/2} ${h*0.25} L${w*0.63} ${h*0.43} L${w/2} ${h*0.61} L${w*0.37} ${h*0.43} Z`}
            fill="#c8960a" opacity="0.35"
          />
        </svg>
      </div>
    )
  }

  const url = cardImageUrl(card)
  const label = card ? `${card.rank} ${card.suit}` : ''

  return (
    <div style={outer} onClick={!disabled ? onClick : undefined} title={label}>
      <img
        src={url}
        alt={label}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 6 }}
        draggable={false}
      />
    </div>
  )
}
