import type { Options as SanitizeSchema } from 'rehype-sanitize';
import { defaultSchema } from 'rehype-sanitize';
import { CALLOUT_TYPES } from './callouts';

/**
 * What a shared note is allowed to turn into.
 *
 * This is the last line of defence, not the only one: `remark-rehype` runs with
 * `allowDangerousHtml: false`, so raw HTML in the source never becomes an
 * element in the first place. The schema exists for the tree our own plugins
 * build, and for anything a future plugin might get wrong.
 *
 * Class names are allowlisted by value, not merely by attribute, so a note
 * cannot borrow the viewer's own styling to fake an interface element.
 */
const CALLOUT_CLASSES = CALLOUT_TYPES.map((type) => `callout-${type}`);

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  // Absolute is allowed only for http(s); everything else — javascript:, data:,
  // vbscript: — is dropped. Asset URLs are absolute http(s) to the API origin.
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'div',
    'section',
    'figure',
    'figcaption',
    'sup',
    'sub',
  ],
  attributes: {
    ...defaultSchema.attributes,
    div: [['className', 'callout', 'callout-foldable', 'callout-title', ...CALLOUT_CLASSES]],
    // Alignment from GFM tables, converted from inline styles before this runs.
    th: [['className', 'align-left', 'align-center', 'align-right']],
    td: [['className', 'align-left', 'align-center', 'align-right']],
    code: [['className', /^language-./]],
    pre: [['className', /^language-./]],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    a: ['href', 'title'],
    input: [['type', 'checkbox'], 'checked', 'disabled'],
  },
  // A note must not be able to hand out ids that collide with the page's own.
  clobber: [],
  clobberPrefix: '',
};
