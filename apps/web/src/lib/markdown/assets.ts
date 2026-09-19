import type { PublicAsset } from '@share-note/contracts';
import type { Image, Parent, PhrasingContent, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

declare module 'vfile' {
  interface DataMap {
    assets: readonly PublicAsset[];
  }
}

/** `![[image.png]]` and `![[image.png|alt text]]`. */
const EMBED = /!\[\[([^\][|]+)(?:\|([^\][]*))?\]\]/g;

/**
 * Resolves image references against the share's attachments.
 *
 * Two passes. The first rewrites Obsidian's `![[image.png]]` into an ordinary
 * mdast image node, so that from then on there is only one kind of image to
 * think about. The second resolves every image's destination — however it was
 * written — against the attachment manifest.
 *
 * An image that resolves to nothing is replaced by its alt text rather than
 * left pointing outward. That is deliberate: a shared note is untrusted input,
 * and an `<img>` at an arbitrary URL would let its author see the IP and
 * user-agent of everyone who opens the link. The viewer's CSP would block it
 * anyway; rendering the alt text makes the result legible instead of broken.
 *
 * The manifest arrives on the vfile rather than as a plugin option, so the
 * processor itself is stateless and can be built once and reused — which is
 * what keeps Shiki from constructing a new highlighter on every request.
 */
export const remarkAssets: Plugin<[], Root> = () => (tree, file) => {
  const byName = indexByName(file.data.assets ?? []);

  // Embeds first: `remarkWikilinks` would otherwise strip the brackets off
  // `![[image.png]]` and leave a stray `!`.
  visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
    if (parent === undefined || index === undefined) return;
    if (!node.value.includes('![[')) return;

    const replacement = expandEmbeds(node.value);
    if (replacement === null) return;

    parent.children.splice(index, 1, ...replacement);
    return index + replacement.length;
  });

  visit(tree, 'image', (node: Image, index, parent: Parent | undefined) => {
    if (parent === undefined || index === undefined) return;

    const asset = resolve(node.url, byName);
    if (asset) {
      node.url = asset.url;
      // An image written as `![](file.png)` has an empty alt, not a missing
      // one, so the filename stands in for it.
      const alt = node.alt?.trim() ?? '';
      node.alt = alt === '' ? asset.filename : alt;
      return;
    }

    const fallback: Text = { type: 'text', value: node.alt ?? node.url };
    parent.children.splice(index, 1, fallback);
    return index + 1;
  });
};

/** Rewrites every embed in a text node, leaving the surrounding text intact. */
function expandEmbeds(value: string): PhrasingContent[] | null {
  const nodes: PhrasingContent[] = [];
  let cursor = 0;
  let matched = false;

  for (const match of value.matchAll(EMBED)) {
    const [whole, target, alias] = match as unknown as [string, string, string | undefined];
    matched = true;

    if (match.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    }

    const image: Image = {
      type: 'image',
      url: target.trim(),
      alt: alias?.trim() ?? target.trim(),
      title: null,
    };
    nodes.push(image);

    cursor = match.index + whole.length;
  }

  if (!matched) return null;
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

/**
 * Attachments are indexed by their own name and by their percent-encoded form,
 * because a Markdown image destination may be encoded. Directory prefixes are
 * handled at lookup time, so `![[attachments/diagram.png]]` finds
 * `diagram.png`.
 */
function indexByName(assets: readonly PublicAsset[]): Map<string, PublicAsset> {
  const byName = new Map<string, PublicAsset>();
  for (const asset of assets) {
    for (const key of [asset.filename, encodeURI(asset.filename)]) {
      if (!byName.has(key)) byName.set(key, asset);
    }
  }
  return byName;
}

function resolve(reference: string, byName: Map<string, PublicAsset>): PublicAsset | undefined {
  const trimmed = reference.trim();
  const decoded = safeDecode(trimmed);
  for (const candidate of [trimmed, basename(trimmed), decoded, basename(decoded)]) {
    const asset = byName.get(candidate);
    if (asset) return asset;
  }
  return undefined;
}

function basename(value: string): string {
  const index = value.lastIndexOf('/');
  return index === -1 ? value : value.slice(index + 1);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
