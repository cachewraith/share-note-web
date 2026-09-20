import { describe, expect, it } from 'vitest';
import { splitFrontmatter, stripFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('separates the block from the body', () => {
    const { frontmatter, body } = splitFrontmatter('---\ntags: [a]\n---\n\n# Heading');
    expect(frontmatter).toBe('---\ntags: [a]\n---\n');
    expect(body).toBe('# Heading');
  });

  it('reports no frontmatter when there is none', () => {
    const { frontmatter, body } = splitFrontmatter('# Heading');
    expect(frontmatter).toBeNull();
    expect(body).toBe('# Heading');
  });
});

describe('stripFrontmatter', () => {
  it('keeps private fields out of what gets uploaded', () => {
    const body = stripFrontmatter('---\nsecret: hunter2\ntags: [private]\n---\n\n# Public');
    expect(body).toBe('# Public');
    expect(body).not.toContain('hunter2');
  });

  it('removes the share fields the plugin writes back', () => {
    const body = stripFrontmatter(
      '---\nshare_id: abcdefghijklmnopqrstu\nshare_url: https://x/y\n---\n\nBody',
    );
    expect(body).toBe('Body');
  });

  it('gives the same body before and after the plugin records the share', () => {
    const before = stripFrontmatter('# Note\n\nBody');
    const after = stripFrontmatter('---\nshare_id: abcdefghijklmnopqrstu\n---\n# Note\n\nBody');
    expect(after).toBe(before);
  });

  it('accepts the ... terminator', () => {
    expect(stripFrontmatter('---\na: 1\n...\nBody')).toBe('Body');
  });

  it('handles CRLF', () => {
    expect(stripFrontmatter('---\r\na: 1\r\n---\r\n\r\nBody')).toBe('Body');
  });

  it('leaves a thematic break alone', () => {
    expect(stripFrontmatter('---\n\nBody')).toBe('---\n\nBody');
  });

  it('leaves an unterminated block alone rather than eating the note', () => {
    expect(stripFrontmatter('---\na: 1\n\nBody')).toBe('---\na: 1\n\nBody');
  });

  it('does not touch --- inside a code fence', () => {
    const markdown = '# Note\n\n```yaml\n---\na: 1\n---\n```';
    expect(stripFrontmatter(markdown)).toBe(markdown);
  });
});
