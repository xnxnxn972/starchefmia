import { useState } from 'react';
import { COURSE_LABEL, getDish } from '../engine/catalog';
import { formatMoney, formatRating, isLegal, RunState } from '../engine/engine';
import { DishArt } from '../art/FoodArt';
import { StarIcon } from '../art/icons';
import { ineligibleNote } from '../copy';

interface Props {
  run: RunState;
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
}

const INITIAL = 3;

export function Offers({ run, selected, disabled, onSelect }: Props) {
  const offer = run.offer!;
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);
  const expanded = expandedTurn === offer.turn;
  const ids = offer.dishIds;
  const legalCount = ids.filter((id) => isLegal(run, id)).length;
  const shown = expanded ? ids : ids.slice(0, INITIAL);

  return (
    <section className="offers" aria-label="Dishes you can choose" aria-busy={disabled}>
      <p className="offers-count">
        {ids.length} matching dish{ids.length === 1 ? '' : 'es'}
        {legalCount < ids.length ? ` · ${legalCount} you can serve` : ''}
      </p>
      <ul className="offer-list">
        {shown.map((id) => {
          const d = getDish(id);
          const note = ineligibleNote(run, id);
          const isSel = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                className={`offer${isSel ? ' selected' : ''}${note ? ' blocked' : ''}`}
                aria-pressed={isSel}
                disabled={disabled || !!note}
                onClick={() => onSelect(isSel ? null : id)}
              >
                <span className="offer-art">
                  <DishArt dish={d} />
                </span>
                <span className="offer-main">
                  <span className="offer-name">{d.name}</span>
                  <span className="offer-course">
                    {COURSE_LABEL[d.course]} · {d.cuisine}
                  </span>
                  {note ? <span className="offer-note">{note}</span> : <span className="offer-desc">{d.description}</span>}
                </span>
                <span className="offer-price">{formatMoney(d.costCents)}</span>
                <span className="offer-rating" aria-label={`${formatRating(d.ratingTenths)} stars`}>
                  <StarIcon /> {formatRating(d.ratingTenths)}
                </span>
                {isSel && <span className="sr-only">Selected.</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {ids.length > INITIAL && (
        <button type="button" className="link-btn" onClick={() => setExpandedTurn(expanded ? null : offer.turn)} aria-expanded={expanded}>
          {expanded ? 'Show fewer' : `Show all ${ids.length} dishes`}
        </button>
      )}
    </section>
  );
}
