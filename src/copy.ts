import { COURSE_LABEL, COURSE_SHORT, getDish, ingredientLabel } from './engine/catalog';
import { checkPurchase, formatMoney, openCourses, remainingCents, RunState } from './engine/engine';
import type { MiaMood } from './art/Mia';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function reserveMessage(reserveCents: number, coursesLeft: number): string {
  return `Keep ${formatMoney(reserveCents)} for your remaining ${countWord(coursesLeft)} course${coursesLeft === 1 ? '' : 's'}.`;
}

export function ineligibleNote(run: RunState, dishId: string): string | null {
  const e = checkPurchase(run, dishId);
  if (e.ok) return null;
  if (e.reason === 'reserve') return reserveMessage(e.reserveCents!, e.coursesLeft!);
  if (e.reason === 'cash') return `Costs more than your ${formatMoney(remainingCents(run))} left.`;
  return 'Course already served.';
}

export function leavesLine(run: RunState, dishId: string): string {
  const d = getDish(dishId);
  const left = remainingCents(run) - d.costCents;
  const coursesLeft = openCourses(run).length - 1;
  if (coursesLeft === 0) return `That completes your menu with ${formatMoney(left)} to spare.`;
  return `That leaves ${formatMoney(left)} for ${countWord(coursesLeft)} course${coursesLeft === 1 ? '' : 's'}.`;
}

export interface MiaState {
  mood: MiaMood;
  line: string;
}

/** Brief, state-derived comments. They never hint at hidden scoring or judge the player. */
export function miaFor(run: RunState | null, selected: string | null, lastServed: string | null): MiaState {
  if (!run) return { mood: 'welcome', line: "Let's build your opening-night menu." };
  switch (run.phase) {
    case 'revealing':
      return { mood: 'curious', line: run.picks.length === 0 ? "Here is today's inspiration." : 'Next inspiration…' };
    case 'serving': {
      const d = lastServed ? getDish(lastServed) : null;
      return { mood: 'serving', line: d ? `${COURSE_LABEL[d.course]}, ready.` : 'Serving…' };
    }
    case 'results':
      return { mood: 'celebrate', line: 'Your opening-night menu is complete.' };
    case 'choosing': {
      if (selected) {
        const note = ineligibleNote(run, selected);
        return { mood: 'thoughtful', line: note ?? leavesLine(run, selected) };
      }
      const open = openCourses(run);
      if (run.picks.length === 0) return { mood: 'welcome', line: "Let's build your opening-night menu." };
      if (open.length === 1) return { mood: 'welcome', line: `Last one: the ${COURSE_SHORT[open[0]]}.` };
      return { mood: 'welcome', line: `${cap(countWord(open.length))} courses to go.` };
    }
  }
}

export function inspirationAnnouncement(run: RunState): string {
  if (!run.offer) return '';
  const n = run.offer.dishIds.length;
  return `Today's inspiration: ${run.offer.cuisine} and ${ingredientLabel.get(run.offer.ingredient)}. ${n} matching dish${n === 1 ? '' : 'es'}.`;
}
