import { useState } from 'react';
import type { Course, Dish } from '../engine/catalog';

const BASE = import.meta.env.BASE_URL;

function Plate({ bowl }: { bowl?: boolean }) {
  return bowl ? (
    <g>
      <ellipse cx={50} cy={62} rx={40} ry={26} fill="#000" opacity={0.06} />
      <ellipse cx={50} cy={56} rx={38} ry={24} fill="#fdfcf9" stroke="#e3dbcf" strokeWidth={1.5} />
      <path d="M14 52 C16 80 84 80 86 52" fill="#f6f2ec" stroke="#e3dbcf" strokeWidth={1.5} />
      <ellipse cx={50} cy={50} rx={33} ry={17} fill="#efe9e0" />
    </g>
  ) : (
    <g>
      <ellipse cx={50} cy={60} rx={44} ry={30} fill="#000" opacity={0.06} />
      <ellipse cx={50} cy={55} rx={44} ry={30} fill="#fdfcf9" stroke="#e3dbcf" strokeWidth={1.5} />
      <ellipse cx={50} cy={55} rx={31} ry={20} fill="#f6f2ec" stroke="#ece5da" strokeWidth={1} />
    </g>
  );
}

/** Course-level illustration used wherever a dish has no production art yet. */
export function CoursePlaceholder({ course }: { course: Course }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="art-svg">
      <Plate bowl={course === 'soup'} />
      {course === 'appetizer' && (
        <g>
          {[[36, 52], [52, 46], [64, 56], [46, 62]].map(([x, y], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y} rx={9} ry={7} fill="#d99a4e" />
              <ellipse cx={x - 2} cy={y - 2} rx={5} ry={3} fill="#f0c27e" />
            </g>
          ))}
          <circle cx={58} cy={48} r={2} fill="#5f8f45" />
          <circle cx={40} cy={58} r={1.6} fill="#5f8f45" />
        </g>
      )}
      {course === 'soup' && (
        <g>
          <ellipse cx={50} cy={50} rx={30} ry={15} fill="#e3a65a" />
          <ellipse cx={46} cy={48} rx={12} ry={5} fill="#f1c88a" opacity={0.8} />
          <circle cx={56} cy={52} r={2.4} fill="#5f8f45" />
          <circle cx={44} cy={53} r={1.8} fill="#5f8f45" />
        </g>
      )}
      {course === 'salad' && (
        <g>
          {[[40, 50, -30], [56, 48, 20], [48, 58, 70], [62, 58, -10], [36, 60, 40]].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx={11} ry={6} fill={i % 2 ? '#7fae55' : '#5f9441'} transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <circle cx={46} cy={50} r={4} fill="#d8473a" />
          <circle cx={60} cy={54} r={3.4} fill="#d8473a" />
          <circle cx={52} cy={61} r={2.6} fill="#f3e3b4" />
        </g>
      )}
      {course === 'main' && (
        <g>
          <ellipse cx={46} cy={55} rx={18} ry={11} fill="#b7703c" />
          <ellipse cx={42} cy={52} rx={10} ry={5} fill="#d39257" />
          <ellipse cx={66} cy={56} rx={9} ry={7} fill="#f2e6c9" />
          <circle cx={63} cy={47} r={2.2} fill="#5f8f45" />
          <circle cx={68} cy={49} r={2} fill="#5f8f45" />
          <path d="M30 64 Q46 70 62 64" stroke="#c98a3d" strokeWidth={2} fill="none" opacity={0.6} />
        </g>
      )}
      {course === 'dessert' && (
        <g>
          <path d="M34 58 C34 40 66 40 66 58 Z" fill="#c98b5a" />
          <path d="M34 58 C38 52 62 52 66 58" fill="#f4e7d5" />
          <circle cx={50} cy={42} r={4.5} fill="#d8473a" />
          <path d="M50 38 l2 -3" stroke="#5f8f45" strokeWidth={1.6} />
          <circle cx={42} cy={60} r={1.5} fill="#7a4a2a" />
        </g>
      )}
    </svg>
  );
}

export function EmptyPlate({ course }: { course: Course }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="art-svg empty">
      <Plate bowl={course === 'soup'} />
    </svg>
  );
}

/** Real art when it exists and loads; otherwise the course placeholder. Name/price/rating are always text elsewhere. */
export function DishArt({ dish, decorative = true }: { dish: Dish; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!dish.imageSrc || failed) {
    return (
      <span className="dish-art placeholder" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${dish.name} (illustration coming soon)`}>
        <CoursePlaceholder course={dish.course} />
      </span>
    );
  }
  return (
    <span className="dish-art">
      <img
        src={BASE + dish.imageSrc}
        alt={decorative ? '' : dish.imageAlt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
