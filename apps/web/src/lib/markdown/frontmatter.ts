/**
 * Removes a leading YAML frontmatter block.
 *
 * The plugin already strips frontmatter before uploading, so a note shared from
 * Obsidian never has any (see docs/decisions/0006). This runs anyway, because a
 * share can also be created with curl and the viewer must not render a stray
 * `---` block as a table.
 *
 * Only a block at the very start counts, and `---` inside a fenced code block is
 * left alone because the block must open on line 1.
 */
export function stripFrontmatter(markdown: string): string {
  const normalised = markdown.replace(/^\uFEFF/, '');
  if (!/^---[ \t]*\r?\n/.test(normalised)) return markdown;

  const end = /\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(normalised.slice(3));
  if (!end) return markdown;

  const rest = normalised.slice(3 + end.index + end[0].length);
  return rest.replace(/^\s*\r?\n/, '');
}
