export const SHARE_ID_KEY = 'share_id';
export const SHARE_URL_KEY = 'share_url';
/**
 * The share's edit token. It is what lets this vault update or unshare the
 * note later, and the server cannot reissue it, so it lives with the note
 * rather than in plugin settings — copy the note to another vault and the
 * share moves with it.
 *
 * Frontmatter is never uploaded (see `splitFrontmatter`), so publishing a note
 * does not publish the token that controls it.
 */
export const SHARE_TOKEN_KEY = 'share_token';

/**
 * Splits a note into its frontmatter block and its body.
 *
 * The body is what gets uploaded. Frontmatter stays in the vault: it holds
 * tags, dates and whatever else the author keeps there, and a shared note's
 * markdown is readable by anyone with the link (see docs/decisions/0006).
 *
 * Stripping it here also keeps the content hash stable when the plugin writes
 * `share_id` back into the note, so sharing twice in a row is a no-op instead
 * of an update.
 */
export function splitFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
  const normalised = markdown.replace(/^\uFEFF/, '');
  if (!/^---[ \t]*\r?\n/.test(normalised)) return { frontmatter: null, body: markdown };

  const end = /\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(normalised.slice(3));
  if (!end) return { frontmatter: null, body: markdown };

  return {
    frontmatter: normalised.slice(0, 3 + end.index + end[0].length),
    body: normalised.slice(3 + end.index + end[0].length).replace(/^\s*\r?\n/, ''),
  };
}

export function stripFrontmatter(markdown: string): string {
  return splitFrontmatter(markdown).body;
}
