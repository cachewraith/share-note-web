import { beforeAll } from 'vitest';

/**
 * Builds Shiki's highlighter once per worker, before any test runs.
 *
 * The first render loads Shiki's grammars and themes, which takes seconds — and
 * Vitest isolates each test file, so without this the cost lands inside
 * whichever test happens to render first in each file and trips its timeout on
 * a loaded machine. Paying it in a hook keeps every test's timing honest.
 *
 * The server pays the same warm-up once per process; `docs/ROADMAP.md` records
 * it as a cold-start cost.
 */
beforeAll(async () => {
  const { renderMarkdown } = await import('./src/lib/markdown/render');
  await renderMarkdown({ markdown: '```ts\nconst warm = true;\n```\n', assets: [] });
}, 180_000);
