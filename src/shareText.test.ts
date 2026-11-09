import { describe, expect, it } from 'vitest';
import { catalog } from './engine/catalog';
import { dishEmoji, emojiRow, SHARE_URL, shareText } from './shareText';

describe('share text', () => {
  it('gives every dish an emoji that older phones can display', () => {
    for (const d of catalog.dishes) {
      const e = dishEmoji(d);
      expect(e, d.id).toBeTruthy();
      const cp = e.codePointAt(0)!;
      // Unicode 14+ food emoji (U+1FAD7 onwards, e.g. beans, flatbread) render as boxes on older devices.
      expect(cp >= 0x1fad7 && cp <= 0x1faff, `${d.id} uses a too-new emoji ${e}`).toBe(false);
    }
  });

  it('lists courses in menu order, whatever order they were bought in', () => {
    // bought main first, appetizer last (the brief's sample order)
    expect(emojiRow(['in-main-02', 'fr-soup-02', 'it-appetizer-01', 'mx-salad-02', 'jp-dessert-02'])).toBe('🍅🧅🌽🍗🍓');
  });

  it('matches the agreed format for the sample game', () => {
    const text = shareText(['jp-appetizer-03', 'in-soup-01', 'mx-salad-02', 'in-main-01', 'mx-dessert-03'], 'Xnxnxn');
    expect(text).toBe(
      [
        'Xnxnxn ⭐ 4.68 / 5',
        '🦐🍅🌽🍛🍫',
        'I built a five-course dinner with Chef Mia at 5-Star Chef Restaurant. Can you beat my menu?',
        'https://starchefmia.com/?s=share',
      ].join('\n'),
    );
  });

  it('falls back to "My restaurant" and always links the real domain with the share tag', () => {
    const text = shareText(['jp-appetizer-03', 'in-soup-01', 'mx-salad-02', 'in-main-01', 'mx-dessert-03'], '  ');
    expect(text.startsWith('My restaurant ⭐')).toBe(true);
    expect(text.endsWith(SHARE_URL)).toBe(true);
    expect(SHARE_URL).toBe('https://starchefmia.com/?s=share');
  });
});
