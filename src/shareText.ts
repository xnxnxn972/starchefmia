/**
 * The text that goes with a shared menu. Kept short on purpose (research notes in the
 * README): who + score, a Wordle-style emoji row of the five courses, one sentence that
 * says what the game is, the challenge, and the tagged link. The full menu with prices
 * lives in the attached picture card, and the link's preview card shows the game.
 */
import { COURSES, Dish, getDish } from './engine/catalog';
import { formatStars, scoreHundredths } from './engine/engine';

/** Always the real domain (and the ?s=share tag the dashboard counts), wherever it was played. */
export const SHARE_URL = 'https://starchefmia.com/?s=share';

// Most recognisable ingredient first. Only long-supported emoji (no 🫘/🫓/🫛, which show
// as blank boxes on older phones).
const BY_INGREDIENT: [string, string][] = [
  ['shrimp', '🦐'],
  ['fish', '🐟'],
  ['beef', '🥩'],
  ['chicken', '🍗'],
  ['strawberry', '🍓'],
  ['chocolate', '🍫'],
  ['mango', '🥭'],
  ['banana', '🍌'],
  ['apple', '🍎'],
  ['coconut', '🥥'],
  ['lemon', '🍋'],
  ['mushroom', '🍄'],
  ['corn', '🌽'],
  ['potato', '🥔'],
  ['tomato', '🍅'],
  ['cucumber', '🥒'],
  ['greens', '🥬'],
];

// Where the dish itself is the better picture than any one ingredient.
const BY_DISH: Record<string, string> = {
  'it-main-01': '🍝', // Spaghetti Pomodoro
  'it-dessert-02': '🍮', // Panna Cotta
  'it-dessert-03': '🍰', // Tiramisu
  'fr-appetizer-01': '🧀', // Goat Cheese Toast
  'fr-appetizer-02': '🧀', // Cheese Gougeres
  'fr-soup-02': '🧅', // French Onion Soup
  'fr-salad-01': '🥒', // Cucumber and Dill Salad
  'fr-dessert-03': '🍮', // Creme Brulee
  'jp-appetizer-01': '🌱', // Edamame
  'jp-appetizer-02': '🥟', // Vegetable Gyoza
  'jp-soup-01': '🍲', // Miso Soup
  'jp-main-01': '🍳', // Tamagoyaki Rice Bowl
  'in-appetizer-01': '🍘', // Lentil Papadums
  'in-appetizer-03': '🍢', // Paneer Tikka
  'in-soup-02': '🥕', // Lentil Carrot Soup
  'in-salad-02': '🥗', // Chickpea Salad
  'in-main-01': '🍛', // Chana Masala with Rice
  'in-dessert-03': '🍨', // Saffron Kulfi
  'mx-appetizer-02': '🧀', // Cheese Quesadillas
  'mx-main-01': '🌯', // Bean Enchiladas
  'mx-main-03': '🌮', // Beef Barbacoa Tacos
  'us-main-01': '🧀', // Mac and Cheese
};

const BY_COURSE = { appetizer: '🥟', soup: '🍲', salad: '🥗', main: '🍛', dessert: '🍨' } as const;

export function dishEmoji(d: Dish): string {
  return BY_DISH[d.id] ?? BY_INGREDIENT.find(([tag]) => d.ingredientTags.includes(tag))?.[1] ?? BY_COURSE[d.course];
}

/** Courses in menu order (appetizer → dessert), whatever order they were bought in. */
export function emojiRow(picks: string[]): string {
  const dishes = picks.map(getDish);
  return COURSES.map((c) => dishes.find((d) => d.course === c))
    .filter((d): d is Dish => !!d)
    .map(dishEmoji)
    .join('');
}

export function shareText(picks: string[], restaurantName: string): string {
  const who = restaurantName.trim() || 'My restaurant';
  return [
    `${who} ⭐ ${formatStars(scoreHundredths(picks))} / 5`,
    emojiRow(picks),
    'I built a five-course dinner with Chef Mia at 5-Star Chef Restaurant. Can you beat my menu?',
    SHARE_URL,
  ].join('\n');
}
