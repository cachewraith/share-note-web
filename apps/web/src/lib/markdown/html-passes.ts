import type { Element, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Turns GFM table alignment into a class name.
 *
 * mdast-to-hast expresses it as the presentational `align` attribute (older
 * versions used an inline `text-align` style); both are handled here and
 * neither survives, because the sanitizer allows no `style` at all and no
 * `align`. Allowing `style` would let a note position and colour arbitrary
 * boxes over the page.
 */
export const rehypeTableAlignment: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'th' && node.tagName !== 'td') return;

    const { align, style } = node.properties;
    delete node.properties.align;
    delete node.properties.style;

    const alignment =
      typeof align === 'string'
        ? align
        : typeof style === 'string'
          ? /text-align:\s*(left|center|right)/.exec(style)?.[1]
          : undefined;

    if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
      node.properties.className = [`align-${alignment}`];
    }
  });
};

/**
 * Marks up links that leave the page.
 *
 * `noopener`/`noreferrer` stop the opened page from reaching back through
 * `window.opener` and from learning where its visitor came from; `nofollow`
 * keeps a shared note from being useful for SEO spam. Runs after the sanitizer
 * so the attributes it adds are not filtered back out.
 */
export const rehypeExternalLinks: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'a') return;

    const href = node.properties.href;
    if (typeof href !== 'string' || !/^https?:/i.test(href)) return;

    node.properties.target = '_blank';
    node.properties.rel = ['nofollow', 'noopener', 'noreferrer'];
  });
};

/**
 * Wraps each highlighted code block in a figure carrying the language and a
 * copy button.
 *
 * Runs after the sanitizer on purpose: this is our own markup, and putting it
 * in beforehand would mean allowing `button` and its classes for note content
 * too. The button carries no handler — `CodeCopyButtons` delegates clicks for
 * the whole article, so the rendered HTML stays static.
 */
export const rehypeCodeBlocks: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'pre' || parent === undefined || index === undefined) return;
    if (parent.type === 'element' && parent.properties.className === 'code-block') return;

    const language = languageOf(node);
    const figure: Element = {
      type: 'element',
      tagName: 'figure',
      properties: { className: ['code-block'] },
      children: [
        {
          type: 'element',
          tagName: 'figcaption',
          properties: { className: ['code-block-header'] },
          children: [
            {
              type: 'element',
              tagName: 'span',
              properties: { className: ['code-block-language'] },
              children: [{ type: 'text', value: language ?? 'text' }],
            },
            {
              type: 'element',
              tagName: 'button',
              properties: {
                type: 'button',
                className: ['code-copy-button'],
                'data-copy': 'true',
              },
              children: [{ type: 'text', value: 'Copy' }],
            },
          ],
        },
        node,
      ],
    };

    parent.children[index] = figure;
    return index + 1;
  });
};

function languageOf(pre: Element): string | undefined {
  const code = pre.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  const classes = code?.properties.className;
  const list = Array.isArray(classes) ? classes : [];
  for (const entry of list) {
    if (typeof entry === 'string' && entry.startsWith('language-')) {
      return entry.slice('language-'.length);
    }
  }
  return undefined;
}
