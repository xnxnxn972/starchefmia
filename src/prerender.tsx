/**
 * Build-time entry used by tools/prerender.mjs: renders the title screen to static
 * HTML so the page has real content before any JavaScript runs (search engines,
 * link previews, slow phones). main.tsx then renders the same screen over it.
 */
import { renderToString } from 'react-dom/server';
import { Intro } from './App';

export function render(): string {
  const noop = () => {};
  return renderToString(
    <Intro
      onStart={noop}
      restoreFailed={false}
      miaLine="Let's build your opening-night menu."
      onHelp={noop}
      onBoard={noop}
      helpOpen={false}
      onCloseHelp={noop}
    />,
  );
}
