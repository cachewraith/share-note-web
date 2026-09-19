import type { PublicAsset } from '@share-note/contracts';
import { describe, expect, it } from 'vitest';
import { renderMarkdown, summarise } from './render';

const asset = (filename: string): PublicAsset => ({
  id: 'bbbbbbbbbbbbbbbbbbbbb',
  url: `https://api.example.com/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb`,
  filename,
  mime: 'image/png',
  size: 12,
  sha256: 'f'.repeat(64),
});

const render = (markdown: string, assets: readonly PublicAsset[] = []) =>
  renderMarkdown({ markdown, assets });

describe('markdown', () => {
  it('renders headings, emphasis and lists', async () => {
    await expect(
      render('# Title\n\nSome **bold** and *italic*.\n\n- one\n- two\n'),
    ).resolves.toMatchSnapshot();
  });

  it('renders GFM tables with alignment as classes, never inline styles', async () => {
    const html = await render('| a | b |\n| :- | --: |\n| 1 | 2 |\n');

    expect(html).toContain('align-left');
    expect(html).toContain('align-right');
    expect(html).not.toContain('style=');
    expect(html).toMatchSnapshot();
  });

  it('renders task lists', async () => {
    const html = await render('- [x] done\n- [ ] todo\n');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled');
    expect(html).toMatchSnapshot();
  });

  it('renders strikethrough and footnote-free GFM extras', async () => {
    await expect(render('~~gone~~ and https://example.com\n')).resolves.toMatchSnapshot();
  });

  it('strips frontmatter before rendering', async () => {
    const html = await render('---\nsecret: hunter2\n---\n\n# Public\n');

    expect(html).not.toContain('hunter2');
    expect(html).toContain('Public');
  });
});

describe('code blocks', () => {
  it('highlights a fenced block and wraps it with a copy button', async () => {
    const html = await render('```ts\nconst answer: number = 42;\n```\n');

    expect(html).toContain('code-block');
    expect(html).toContain('code-copy-button');
    expect(html).toContain('code-block-language');
    expect(html).toMatch(/<span[^>]*style="[^"]*"/);
    expect(html).toMatchSnapshot();
  });

  it('falls back to plain text for an unknown language instead of failing', async () => {
    const html = await render('```notalanguage\nsomething\n```\n');
    expect(html).toContain('something');
  });

  it('leaves an unfenced indented block highlightable', async () => {
    await expect(render('    plain indented\n')).resolves.toMatchSnapshot();
  });

  it('escapes html inside a code block rather than rendering it', async () => {
    const html = await render('```html\n<script>alert(1)</script>\n```\n');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    // Highlighted, so the escaped `<` and the keyword land in separate spans.
    expect(html).toContain('&#x3C;');
    expect(html).toContain('script');
  });
});

describe('obsidian syntax', () => {
  it('renders a callout with its title', async () => {
    const html = await render('> [!note] Remember\n> This is the body.\n');

    expect(html).toContain('callout callout-note');
    expect(html).toContain('Remember');
    expect(html).toContain('This is the body.');
    expect(html).toMatchSnapshot();
  });

  it('uses the type as the title when none is given', async () => {
    const html = await render('> [!warning]\n> Careful.\n');
    expect(html).toContain('Warning');
    expect(html).toContain('callout-warning');
  });

  it('falls back to note for an unknown callout type', async () => {
    const html = await render('> [!totally-made-up] Hi\n> Body\n');
    expect(html).toContain('callout-note');
    expect(html).not.toContain('callout-totally-made-up');
  });

  it('leaves an ordinary blockquote alone', async () => {
    const html = await render('> just a quote\n');
    expect(html).toContain('<blockquote>');
    expect(html).not.toContain('callout');
  });

  it('renders wikilinks as plain text', async () => {
    const html = await render('See [[Some Page]] and [[Other|the other one]].\n');

    expect(html).toContain('Some Page');
    expect(html).toContain('the other one');
    expect(html).not.toContain('[[');
    expect(html).not.toContain('<a');
  });

  it('leaves wikilinks inside code untouched', async () => {
    const html = await render('`[[Not A Link]]` and:\n\n```\n[[Also Not]]\n```\n');
    expect(html).toContain('[[Not A Link]]');
    expect(html).toContain('[[Also Not]]');
  });

  it('resolves an embed to the attachment endpoint', async () => {
    const html = await render('![[diagram.png]]\n', [asset('diagram.png')]);

    expect(html).toContain('src="https://api.example.com/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb"');
    expect(html).toContain('alt="diagram.png"');
    expect(html).toMatchSnapshot();
  });

  it('uses the alias as alt text', async () => {
    const html = await render('![[diagram.png|An architecture diagram]]\n', [asset('diagram.png')]);
    expect(html).toContain('alt="An architecture diagram"');
  });

  it('resolves an embed written with a folder path', async () => {
    const html = await render('![[attachments/diagram.png]]\n', [asset('diagram.png')]);
    expect(html).toContain('/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb');
  });

  it('resolves a markdown image against the attachments', async () => {
    const html = await render('![alt](diagram.png)\n', [asset('diagram.png')]);
    expect(html).toContain('/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb');
  });

  it('resolves a percent-encoded reference', async () => {
    const html = await render('![alt](my%20diagram.png)\n', [asset('my diagram.png')]);
    expect(html).toContain('/v1/public/assets/bbbbbbbbbbbbbbbbbbbbb');
  });

  it('renders an unresolved embed as text, not a broken image', async () => {
    const html = await render('Before ![[missing.png]] after\n');

    expect(html).not.toContain('<img');
    expect(html).toContain('missing.png');
    expect(html).toContain('Before');
    expect(html).toContain('after');
  });

  it('handles several embeds in one paragraph', async () => {
    const html = await render('![[a.png]] then ![[b.png]]\n', [asset('a.png')]);
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('b.png');
  });

  it('leaves an embed inside a code fence alone', async () => {
    const html = await render('```\n![[diagram.png]]\n```\n', [asset('diagram.png')]);
    expect(html).not.toContain('<img');
    expect(html).toContain('![[diagram.png]]');
  });
});

describe('xss', () => {
  it.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an image error handler', '<img src=x onerror="alert(1)">'],
    ['an svg handler', '<svg onload="alert(1)"></svg>'],
    ['an iframe', '<iframe src="https://evil.example.com"></iframe>'],
    ['an object tag', '<object data="data:text/html,<script>alert(1)</script>"></object>'],
    ['a style block', '<style>body{display:none}</style>'],
    ['a form', '<form action="https://evil.example.com"><input name="a"></form>'],
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example.com">'],
    ['a base tag', '<base href="https://evil.example.com/">'],
    ['an event handler on a div', '<div onclick="alert(1)">click</div>'],
    ['a math/annotation trick', '<math><mtext><script>alert(1)</script></mtext></math>'],
    ['mixed case', '<ScRiPt>alert(1)</ScRiPt>'],
    ['a null byte', '<scr\u0000ipt>alert(1)</scr\u0000ipt>'],
  ])('neutralises %s', async (_label, payload) => {
    const html = await render(`Before\n\n${payload}\n\nAfter\n`);

    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html.toLowerCase()).not.toContain('onload');
    expect(html.toLowerCase()).not.toContain('onclick');
    expect(html.toLowerCase()).not.toContain('<iframe');
    expect(html.toLowerCase()).not.toContain('<object');
    expect(html.toLowerCase()).not.toContain('<style');
    expect(html.toLowerCase()).not.toContain('<form');
    expect(html.toLowerCase()).not.toContain('<base');
    expect(html.toLowerCase()).not.toContain('http-equiv');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('neutralises an unclosed script tag', async () => {
    // An unterminated HTML block swallows the rest of the document, which is
    // why "After" is gone here. Dropped content is the safe outcome.
    const html = await render('Before\n\n<script>alert(1)\n\nAfter\n');

    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('alert(1)');
    expect(html).toContain('Before');
  });

  it.each([
    ['javascript:', '[click](javascript:alert(1))'],
    ['JaVaScRiPt:', '[click](JaVaScRiPt:alert(1))'],
    ['javascript with entities', '[click](javascript&#58;alert(1))'],
    ['data: html', '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript:', '[click](vbscript:msgbox(1))'],
    ['a tab inside the scheme', '[click](java\tscript:alert(1))'],
  ])('drops a %s link destination', async (_label, markdown) => {
    const html = await render(markdown);

    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html.toLowerCase()).not.toContain('vbscript:');
    expect(html.toLowerCase()).not.toContain('data:text/html');
    expect(html).toContain('click');
  });

  it.each([
    ['javascript: image', '![x](javascript:alert(1))'],
    ['data: image', '![x](data:image/svg+xml,<svg onload="alert(1)"/>)'],
  ])('drops a %s source', async (_label, markdown) => {
    const html = await render(markdown);

    expect(html).not.toContain('<img');
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html.toLowerCase()).not.toContain('onload');
  });

  it('cannot inject a class the viewer styles', async () => {
    const html = await render('<div class="callout callout-danger">fake</div>\n');
    expect(html).not.toContain('callout-danger');
  });

  it('cannot inject an id that collides with the page', async () => {
    const html = await render('<div id="main">hijack</div>\n');
    expect(html).not.toContain('id="main"');
  });

  it('cannot smuggle markup through a callout title', async () => {
    const html = await render('> [!note] <script>alert(1)</script>\n> body\n');
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('cannot smuggle markup through an image alias', async () => {
    const html = await render('![[a.png|"onerror="alert(1)]]\n', [asset('a.png')]);
    expect(html.toLowerCase()).not.toContain('onerror=alert');
    expect(html).toContain('&#x22;onerror=&#x22;alert(1)');
  });

  it('marks outward links so they cannot reach back', async () => {
    const html = await render('[out](https://example.com)\n');

    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('keeps a mailto link', async () => {
    const html = await render('[mail](mailto:someone@example.com)\n');
    expect(html).toContain('mailto:someone@example.com');
  });

  it('renders a very long line without hanging', async () => {
    const html = await render(`${'a'.repeat(100_000)}\n`);
    expect(html.length).toBeGreaterThan(100_000);
  });
});

describe('summarise', () => {
  it('uses the first line of prose', () => {
    expect(summarise('# Title\n\nThe body starts here.')).toBe('Title The body starts here.');
  });

  it('drops frontmatter', () => {
    expect(summarise('---\nsecret: hunter2\n---\n\nBody')).toBe('Body');
  });

  it('drops embeds and keeps link text', () => {
    expect(summarise('![[a.png]] see [docs](https://example.com)')).toBe('see docs');
  });

  it('resolves wikilinks to their alias', () => {
    expect(summarise('See [[Page|the page]]')).toBe('See the page');
  });

  it('truncates with an ellipsis', () => {
    expect(summarise('a '.repeat(500), 20)).toHaveLength(20);
    expect(summarise('a '.repeat(500), 20).endsWith('…')).toBe(true);
  });

  it('drops callout markers', () => {
    expect(summarise('> [!warning] Careful\n> Mind the gap')).toBe('Careful Mind the gap');
  });

  it('never contains markup', () => {
    expect(summarise('<script>alert(1)</script> hello')).not.toContain('<script>');
  });
});
