import { useMemo } from 'react';
import { catalog, ingredientLabel } from '../engine/catalog';
import type { Offer } from '../engine/engine';
import { CuisineFlag, INGREDIENT_EMOJI } from '../art/icons';
import { TIMING } from '../config';

interface Props {
  offer: Offer;
  revealing: boolean;
  reduceMotion: boolean;
}

const STRIP_LEN = 7;

/** Visual-only filler labels; the real outcome is already chosen and saved. */
function strip<T>(pool: T[], target: T, salt: number): T[] {
  const out: T[] = [];
  let x = salt * 9301 + 49297;
  while (out.length < STRIP_LEN - 1) {
    x = (x * 9301 + 49297) % 233280;
    const v = pool[x % pool.length];
    if (v !== target && v !== out[out.length - 1]) out.push(v);
  }
  out.push(target);
  return out;
}

function CuisineLabel({ c }: { c: string }) {
  return (
    <>
      <CuisineFlag cuisine={c} />
      <span>{c}</span>
    </>
  );
}

function IngredientLabel({ id }: { id: string }) {
  return (
    <>
      <span className="ing-emoji" aria-hidden="true">
        {INGREDIENT_EMOJI[id]}
      </span>
      <span>{ingredientLabel.get(id)}</span>
    </>
  );
}

export function Inspiration({ offer, revealing, reduceMotion }: Props) {
  const animate = revealing && !reduceMotion;
  const cuisines = useMemo(() => strip(catalog.cuisines, offer.cuisine, offer.turn * 7 + 3), [offer]);
  const ingredients = useMemo(
    () => strip(catalog.ingredients.map((i) => i.id), offer.ingredient, offer.turn * 13 + 5),
    [offer],
  );

  return (
    <section className="inspiration" aria-label="Today's inspiration">
      <h2 className="section-rule">
        <span>Today’s inspiration</span>
      </h2>
      <div className={`drums${revealing ? ' revealing' : ''}`}>
        <div className="drum">
          {animate ? (
            <div
              className="drum-strip"
              aria-hidden="true"
              style={{ animationDuration: `${TIMING.revealMs - TIMING.revealStaggerMs}ms`, ['--n' as string]: STRIP_LEN - 1 }}
            >
              {cuisines.map((c, i) => (
                <div className="drum-item" key={i}>
                  <CuisineLabel c={c} />
                </div>
              ))}
            </div>
          ) : (
            <div className={`drum-item settled${revealing ? ' fade' : ''}`}>
              <CuisineLabel c={offer.cuisine} />
            </div>
          )}
        </div>
        <div className="drum">
          {animate ? (
            <div
              className="drum-strip"
              aria-hidden="true"
              style={{ animationDuration: `${TIMING.revealMs}ms`, ['--n' as string]: STRIP_LEN - 1 }}
            >
              {ingredients.map((id, i) => (
                <div className="drum-item" key={i}>
                  <IngredientLabel id={id} />
                </div>
              ))}
            </div>
          ) : (
            <div className={`drum-item settled${revealing ? ' fade' : ''}`}>
              <IngredientLabel id={offer.ingredient} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
