import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * `[[Page]]` and `[[Page|alias]]` render as plain text in v1: the target is a
 * note in somebody's vault, and there is nothing public to link to.
 *
 * Only `text` nodes are visited, so `[[...]]` inside a code block or inline code
 * is left exactly as written.
 */
const WIKILINK = /\[\[([^\][|]+)(?:\|([^\][]*))?\]\]/g;

export const remarkWikilinks: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'text', (node: Text) => {
    if (!node.value.includes('[[')) return;
    node.value = node.value.replace(WIKILINK, (_match, target: string, alias?: string) =>
      (alias ?? target).trim(),
    );
  });
};
