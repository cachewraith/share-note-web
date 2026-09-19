import rehypeShiki from '@shikijs/rehype';
import type { PublicAsset } from '@share-note/contracts';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { remarkAssets } from './assets';
import { remarkCallouts } from './callouts';
import { stripFrontmatter } from './frontmatter';
import { rehypeCodeBlocks, rehypeExternalLinks, rehypeTableAlignment } from './html-passes';
import { sanitizeSchema } from './sanitize';
import { remarkWikilinks } from './wikilinks';

export interface RenderInput {
  readonly markdown: string;
  readonly assets: readonly PublicAsset[];
}

/**
 * The pipeline.
 *
 * Its order is the security property (see docs/decisions/0007):
 *
 *   parse -> gfm -> obsidian syntax -> to hast (raw HTML discarded)
 *         -> SANITIZE -> decorate -> highlight -> stringify
 *
 * Everything that interprets note content runs before the sanitizer, so the
 * sanitizer is the single gate the whole document passes through. The copy
 * button and Shiki's spans are added after it, which is why our own markup and
 * Shiki's inline styles do not have to be allowed for note content.
 *
 * Built once and reused: constructing it per request would build a new Shiki
 * highlighter every time, which is by far the most expensive part.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkCallouts)
  .use(remarkAssets)
  .use(remarkWikilinks)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeTableAlignment)
  .use(rehypeSanitize, sanitizeSchema)
  // After the sanitizer (so its markup survives) but before Shiki, which
  // rewrites `<pre>` and drops the `language-*` class the header reads.
  .use(rehypeCodeBlocks)
  .use(rehypeShiki, {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    // An unknown or misspelt language must not fail the render.
    fallbackLanguage: 'text',
  })
  .use(rehypeExternalLinks)
  .use(rehypeStringify)
  .freeze();

export async function renderMarkdown(input: RenderInput): Promise<string> {
  const file = new VFile({ value: stripFrontmatter(input.markdown) });
  file.data.assets = input.assets;
  return String(await processor.process(file));
}

/**
 * First heading or first sentence, for the OpenGraph description. Runs on the
 * markdown source rather than the rendered HTML so it cannot pick up markup.
 */
export function summarise(markdown: string, maxLength = 200): string {
  const body = stripFrontmatter(markdown)
    .replace(/^```[\s\S]*?```$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s*\[![A-Za-z-]+\][+-]?\s*/gm, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(
      /\[\[([^\][|]+)(?:\|([^\][]*))?\]\]/g,
      (_match, target: string, alias?: string) => alias ?? target,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength - 1).trimEnd()}…`;
}
