import { COURSE_LABEL, COURSES, Course, Dish, getDish } from '../engine/catalog';
import { formatMoney, formatRating } from '../engine/engine';
import { DishArt, EmptyPlate, SIZES } from '../art/FoodArt';
import { StarIcon } from '../art/icons';

interface Props {
  /** Dish ids on the table (any order). */
  picks: string[];
  /** Course the current preview would fill. */
  previewCourse?: Course | null;
  /** Course that was just served (plays the placement animation). */
  servedCourse?: Course | null;
  compact?: boolean;
}

export function Table({ picks, previewCourse, servedCourse, compact }: Props) {
  const byCourse = new Map<Course, Dish>();
  for (const id of picks) {
    const d = getDish(id);
    byCourse.set(d.course, d);
  }
  return (
    <ul className={`table${compact ? ' compact' : ''}`} aria-label="Your dinner table">
      {COURSES.map((c) => {
        const d = byCourse.get(c);
        const isPreview = previewCourse === c && !d;
        return (
          <li
            key={c}
            className={`setting setting-${c}${d ? ' filled' : ''}${isPreview ? ' preview' : ''}${servedCourse === c ? ' served' : ''}`}
          >
            <div className="plate">{d ? <DishArt dish={d} sizes={SIZES.plate} /> : <EmptyPlate course={c} />}</div>
            <div className="setting-label">
              <span className="course-name">{COURSE_LABEL[c]}</span>
              {d ? (
                <span className="setting-dish">
                  <span className="setting-dish-name">{d.name}</span>
                  <span className="setting-meta">
                    {formatMoney(d.costCents)} · <StarIcon /> {formatRating(d.ratingTenths)}
                  </span>
                </span>
              ) : (
                isPreview && <span className="setting-meta preview-note">Selected</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
