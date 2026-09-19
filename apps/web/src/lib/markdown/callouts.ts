import type { Blockquote, Paragraph, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Obsidian callouts: a blockquote whose first line is `> [!type] Optional title`.
 *
 * The blockquote is re-labelled as a `<div class="callout callout-type">` via
 * mdast-to-hast's `hName`/`hProperties` hints, so the transformation happens
 * inside remark-rehype rather than by building HTML here — which means the
 * sanitizer still sees a normal tree and the class names are checked against
 * its allowlist like everything else.
 */
export const CALLOUT_TYPES = [
  'note',
  'abstract',
  'summary',
  'tldr',
  'info',
  'todo',
  'tip',
  'hint',
  'important',
  'success',
  'check',
  'done',
  'question',
  'help',
  'faq',
  'warning',
  'caution',
  'attention',
  'failure',
  'fail',
  'missing',
  'danger',
  'error',
  'bug',
  'example',
  'quote',
  'cite',
] as const;

const CALLOUT_PATTERN = /^\[!([A-Za-z-]+)\]([+-]?)[ \t]*(.*)$/;

export const remarkCallouts: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'blockquote', (node: Blockquote) => {
    const firstParagraph = node.children[0];
    if (firstParagraph?.type !== 'paragraph') return;

    const firstText = firstParagraph.children[0];
    if (firstText?.type !== 'text') return;

    const [firstLine, ...restLines] = firstText.value.split('\n');
    const match = CALLOUT_PATTERN.exec(firstLine ?? '');
    if (!match) return;

    const [, rawType, fold, titleText] = match as unknown as [string, string, string, string];
    const type = normaliseType(rawType);
    const title = titleText.trim() || capitalise(type);

    // Drop the marker line; whatever followed it stays as the callout body.
    firstText.value = restLines.join('\n');
    if (firstText.value === '') {
      firstParagraph.children.shift();
      if (firstParagraph.children.length === 0) node.children.shift();
    }

    node.data = {
      ...node.data,
      hName: 'div',
      hProperties: {
        className: ['callout', `callout-${type}`, ...(fold ? ['callout-foldable'] : [])],
      },
    };

    node.children.unshift(titleNode(title));
  });
};

function titleNode(title: string): Paragraph {
  const text: Text = { type: 'text', value: title };
  return {
    type: 'paragraph',
    children: [text],
    data: { hName: 'div', hProperties: { className: ['callout-title'] } },
  };
}

/** An unrecognised type renders as a plain note rather than an unstyled box. */
function normaliseType(raw: string): string {
  const lower = raw.toLowerCase();
  return (CALLOUT_TYPES as readonly string[]).includes(lower) ? lower : 'note';
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
