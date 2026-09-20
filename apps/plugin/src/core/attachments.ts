export interface AttachmentReference {
  /** Exactly as the note writes it: `diagram.png`, `attachments/diagram.png`. */
  readonly reference: string;
  /** The name the viewer will resolve the embed against. */
  readonly filename: string;
}

/** `![[file]]` and `![[file|alias]]`. */
const EMBED = /!\[\[([^\][|]+)(?:\|[^\][]*)?\]\]/g;
/** `![alt](path)` and `![alt](<path with spaces>)`. */
const IMAGE = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Finds every local image a note embeds.
 *
 * Fenced and inline code are removed first, so a note that *documents*
 * `![[example.png]]` does not try to upload it. Absolute URLs are skipped: they
 * already point somewhere, and the viewer would not render them anyway (see
 * docs/decisions/0012).
 *
 * Returns each attachment once, in the order it first appears.
 */
export function collectAttachments(markdown: string): AttachmentReference[] {
  const prose = stripCode(markdown);
  const found = new Map<string, AttachmentReference>();

  for (const match of prose.matchAll(EMBED)) {
    add(found, match[1]);
  }
  for (const match of prose.matchAll(IMAGE)) {
    add(found, match[1] ?? match[2]);
  }

  return [...found.values()];
}

function add(found: Map<string, AttachmentReference>, raw: string | undefined): void {
  if (raw === undefined) return;

  const reference = decodeReference(raw.trim());
  if (reference === '') return;
  // Absolute (`https://…`) and protocol-relative (`//host/…`) destinations
  // already point somewhere; only vault-relative references are attachments.
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) return;
  if (!IMAGE_EXTENSIONS.has(extensionOf(reference))) return;
  if (found.has(reference)) return;

  found.set(reference, { reference, filename: basename(reference) });
}

/**
 * Removes code so its contents are never mistaken for an embed. Fenced blocks
 * go first, because a fence may contain backticks that would otherwise look
 * like the start of inline code.
 */
function stripCode(markdown: string): string {
  return markdown.replace(/^( {0,3})(`{3,}|~{3,})[\s\S]*?^\1\2.*$/gm, '').replace(/`[^`\n]*`/g, '');
}

function extensionOf(reference: string): string {
  const name = basename(reference);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function basename(reference: string): string {
  const index = reference.lastIndexOf('/');
  return index === -1 ? reference : reference.slice(index + 1);
}

function decodeReference(reference: string): string {
  try {
    return decodeURIComponent(reference);
  } catch {
    return reference;
  }
}
