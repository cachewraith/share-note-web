import { describe, expect, it } from 'vitest';
import { stripFrontmatter } from './frontmatter';

describe('stripFrontmatter', () => {
  it('removes a leading block', () => {
    expect(stripFrontmatter('---\ntitle: Note\ntags: [a]\n---\n\n# Heading')).toBe('# Heading');
  });

  it('removes an empty block', () => {
    expect(stripFrontmatter('---\n---\n# Heading')).toBe('# Heading');
  });

  it('accepts the ... terminator', () => {
    expect(stripFrontmatter('---\na: 1\n...\n# Heading')).toBe('# Heading');
  });

  it('leaves a note without frontmatter untouched', () => {
    expect(stripFrontmatter('# Heading\n\nBody')).toBe('# Heading\n\nBody');
  });

  it('leaves a thematic break at the top alone', () => {
    expect(stripFrontmatter('---\n\n# Heading')).toBe('---\n\n# Heading');
  });

  it('does not touch a --- inside the body', () => {
    const markdown = '# Heading\n\n---\n\nMore';
    expect(stripFrontmatter(markdown)).toBe(markdown);
  });

  it('does not touch --- inside a fenced code block', () => {
    const markdown = '# Heading\n\n```yaml\n---\na: 1\n---\n```\n';
    expect(stripFrontmatter(markdown)).toBe(markdown);
  });

  it('handles CRLF line endings', () => {
    expect(stripFrontmatter('---\r\ntitle: Note\r\n---\r\n\r\n# Heading')).toBe('# Heading');
  });

  it('handles a byte order mark', () => {
    expect(stripFrontmatter('﻿---\ntitle: Note\n---\n# Heading')).toBe('# Heading');
  });

  it('leaves an unterminated block alone rather than eating the note', () => {
    const markdown = '---\ntitle: Note\n\n# Heading';
    expect(stripFrontmatter(markdown)).toBe(markdown);
  });

  it('really removes private fields, not just hides them', () => {
    const output = stripFrontmatter('---\nsecret: hunter2\n---\n# Public');
    expect(output).not.toContain('hunter2');
  });
});
