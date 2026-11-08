export type MiaMood = 'welcome' | 'curious' | 'thoughtful' | 'serving' | 'celebrate';

const SKIN = '#e7ad86';
const SKIN_SHADE = '#d39570';
const HAIR = '#2f1e19';
const JACKET = '#fffdf8';
const JACKET_LINE = '#d8ccbb';
const APRON = '#5a2343';

function Arm({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={JACKET_LINE} strokeWidth={17} />
      <path d={d} stroke={JACKET} strokeWidth={14} />
    </g>
  );
}

function Hand({ x, y, r = 7.5 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={SKIN} stroke={SKIN_SHADE} strokeWidth={1} />;
}

/** Original companion character, drawn in SVG so every pose shares one consistent design. */
export function Mia({ mood, className }: { mood: MiaMood; className?: string }) {
  const tilt = mood === 'thoughtful' ? -6 : mood === 'curious' ? 4 : 0;
  const lookX = mood === 'curious' ? -2.5 : 0;
  const lookY = mood === 'curious' ? 2 : 0;
  const happyEyes = mood === 'celebrate' || mood === 'welcome';

  return (
    <svg viewBox="0 0 160 180" className={className} aria-hidden="true" focusable="false">
      {/* back hair */}
      <g fill={HAIR}>
        {[
          [52, 62, 15], [48, 80, 14], [52, 98, 13], [108, 62, 15], [112, 80, 14], [108, 98, 13],
          [60, 46, 15], [80, 40, 17], [100, 46, 15],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} transform={`rotate(${tilt} 80 120)`} />
        ))}
      </g>

      {/* body */}
      <path d="M30 180 C32 142 50 128 80 126 C110 128 128 142 130 180 Z" fill={JACKET} stroke={JACKET_LINE} strokeWidth={1.5} />
      <path d="M58 180 L60 148 C66 140 94 140 100 148 L102 180 Z" fill={APRON} />
      <path d="M62 148 L56 128 M98 148 L104 128" stroke={APRON} strokeWidth={4} strokeLinecap="round" />
      <path d="M72 126 L80 138 L88 126" fill="none" stroke={JACKET_LINE} strokeWidth={1.5} />
      <circle cx={70} cy={160} r={1.6} fill="#e8d9e2" />
      <circle cx={90} cy={160} r={1.6} fill="#e8d9e2" />

      {/* neck + head */}
      <g transform={`rotate(${tilt} 80 120)`}>
        <rect x={72} y={104} width={16} height={22} rx={6} fill={SKIN_SHADE} />
        <ellipse cx={80} cy={80} rx={28} ry={32} fill={SKIN} />
        <ellipse cx={52} cy={84} rx={4} ry={6} fill={SKIN_SHADE} />
        <ellipse cx={108} cy={84} rx={4} ry={6} fill={SKIN_SHADE} />
        <circle cx={108.5} cy={92} r={1.8} fill="#c9a24a" />

        {/* fringe curls */}
        <g fill={HAIR}>
          {[
            [58, 58, 9], [68, 51, 9.5], [80, 49, 10], [92, 51, 9.5], [102, 58, 9], [55, 70, 6.5], [105, 70, 6.5],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>

        {/* brows */}
        <g stroke={HAIR} strokeWidth={2.2} strokeLinecap="round" fill="none">
          {mood === 'curious' ? (
            <>
              <path d="M63 69 Q69 64 75 67" />
              <path d="M85 67 Q91 64 97 69" />
            </>
          ) : mood === 'thoughtful' ? (
            <>
              <path d="M64 71 Q69 69 75 70" />
              <path d="M85 69 Q91 67 96 70" />
            </>
          ) : (
            <>
              <path d="M64 70 Q69 67 75 69" />
              <path d="M85 69 Q91 67 96 70" />
            </>
          )}
        </g>

        {/* eyes */}
        {happyEyes ? (
          <g stroke="#2a1a16" strokeWidth={2.4} strokeLinecap="round" fill="none">
            <path d="M65 80 Q70 75 75 80" />
            <path d="M85 80 Q90 75 95 80" />
          </g>
        ) : (
          <g>
            <ellipse cx={70 + lookX} cy={80 + lookY} rx={3.3} ry={mood === 'thoughtful' ? 2.6 : 3.8} fill="#2a1a16" />
            <ellipse cx={90 + lookX} cy={80 + lookY} rx={3.3} ry={mood === 'thoughtful' ? 2.6 : 3.8} fill="#2a1a16" />
            <circle cx={71 + lookX} cy={78.6 + lookY} r={1} fill="#fff" />
            <circle cx={91 + lookX} cy={78.6 + lookY} r={1} fill="#fff" />
          </g>
        )}

        {/* cheeks */}
        <ellipse cx={64} cy={91} rx={5} ry={3} fill="#e98b7d" opacity={0.45} />
        <ellipse cx={96} cy={91} rx={5} ry={3} fill="#e98b7d" opacity={0.45} />
        <path d="M79 86 Q80 90 82 89" stroke={SKIN_SHADE} strokeWidth={1.5} fill="none" strokeLinecap="round" />

        {/* mouth */}
        {mood === 'celebrate' ? (
          <path d="M70 95 Q80 108 90 95 Z" fill="#8c2f39" stroke="#6b1f2a" strokeWidth={1} />
        ) : mood === 'curious' ? (
          <ellipse cx={80} cy={98} rx={3.2} ry={3.8} fill="#8c2f39" />
        ) : mood === 'thoughtful' ? (
          <path d="M73 97 Q79 100 87 96" stroke="#8c2f39" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        ) : (
          <path d="M71 95 Q80 104 89 95" stroke="#8c2f39" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* arms by pose */}
      {mood === 'welcome' && (
        <>
          <Arm d="M46 142 C36 126 30 112 28 98" />
          <Hand x={28} y={92} r={8} />
          <path d="M16 84 Q14 92 18 98 M40 84 Q43 90 40 96" stroke="#c9a24a" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.7} />
        </>
      )}
      {mood === 'curious' && (
        <>
          <Arm d="M112 144 C118 132 104 122 92 118" />
          <Hand x={88} y={114} r={7} />
        </>
      )}
      {mood === 'thoughtful' && (
        <>
          <Arm d="M114 146 C122 132 114 116 104 108" />
          <Hand x={100} y={104} r={8} />
        </>
      )}
      {mood === 'serving' && (
        <>
          <Arm d="M46 144 C44 156 52 164 62 164" />
          <Arm d="M114 144 C116 156 108 164 98 164" />
          <ellipse cx={80} cy={166} rx={36} ry={6} fill="#fff" stroke={JACKET_LINE} strokeWidth={1.5} />
          <path d="M54 164 C54 144 106 144 106 164 Z" fill="#e9e3da" stroke="#c7bba9" strokeWidth={1.5} />
          <circle cx={80} cy={145} r={3} fill="#c7bba9" />
          <Hand x={62} y={166} r={6.5} />
          <Hand x={98} y={166} r={6.5} />
        </>
      )}
      {mood === 'celebrate' && (
        <>
          <Arm d="M46 140 C34 120 30 100 30 80" />
          <Arm d="M114 140 C126 120 130 100 130 80" />
          <Hand x={30} y={74} r={8} />
          <Hand x={130} y={74} r={8} />
          <g fill="#e2a93b">
            <path d="M18 50 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
            <path d="M140 44 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" />
            <path d="M80 10 l2 4.6 4.6 2 -4.6 2 -2 4.6 -2 -4.6 -4.6 -2 4.6 -2z" />
          </g>
        </>
      )}
    </svg>
  );
}
