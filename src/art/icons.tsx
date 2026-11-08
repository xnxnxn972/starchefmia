/** Tiny drawn flags (emoji flags don't render on Windows). Decorative only — the cuisine name is always text. */
export function CuisineFlag({ cuisine }: { cuisine: string }) {
  const common = { viewBox: '0 0 30 20', className: 'flag', 'aria-hidden': true, focusable: false } as const;
  switch (cuisine) {
    case 'Italian':
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#2f8f4e" />
          <rect x="10" width="10" height="20" fill="#f6f2ea" />
          <rect x="20" width="10" height="20" fill="#cf3b36" />
        </svg>
      );
    case 'French':
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#2b4c9a" />
          <rect x="10" width="10" height="20" fill="#f6f2ea" />
          <rect x="20" width="10" height="20" fill="#d8413a" />
        </svg>
      );
    case 'Japanese':
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#f6f2ea" />
          <circle cx="15" cy="10" r="5.5" fill="#c8323a" />
        </svg>
      );
    case 'Indian':
      return (
        <svg {...common}>
          <rect width="30" height="7" fill="#f09a3e" />
          <rect y="7" width="30" height="6" fill="#f6f2ea" />
          <rect y="13" width="30" height="7" fill="#2b8a4a" />
          <circle cx="15" cy="10" r="2.2" fill="none" stroke="#24408e" strokeWidth="0.9" />
        </svg>
      );
    case 'Mexican':
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#2a7d4c" />
          <rect x="10" width="10" height="20" fill="#f6f2ea" />
          <rect x="20" width="10" height="20" fill="#cc3a36" />
          <circle cx="15" cy="10" r="2.4" fill="#9a6b3a" />
        </svg>
      );
    case 'American':
      return (
        <svg {...common}>
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} y={(i * 20) / 7} width="30" height={20 / 7} fill={i % 2 ? '#f6f2ea' : '#c8363d'} />
          ))}
          <rect width="13" height="11.4" fill="#2c3f7c" />
        </svg>
      );
    default:
      return null;
  }
}

export const INGREDIENT_EMOJI: Record<string, string> = {
  beef: '🥩',
  chicken: '🍗',
  fish: '🐟',
  shrimp: '🦐',
  egg: '🥚',
  dairy: '🧀',
  rice: '🍚',
  wheat: '🌾',
  potato: '🥔',
  tomato: '🍅',
  mushroom: '🍄',
  corn: '🌽',
  bean: '🫘',
  lentil: '🍲',
  greens: '🥬',
  cucumber: '🥒',
  carrot: '🥕',
  onion: '🧅',
  lemon: '🍋',
  mango: '🥭',
  apple: '🍎',
  banana: '🍌',
  chocolate: '🍫',
  coconut: '🥥',
  strawberry: '🍓',
};

export function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className ?? 'star'} aria-hidden="true" focusable="false">
      <path d="M10 1.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="currentColor" />
    </svg>
  );
}
