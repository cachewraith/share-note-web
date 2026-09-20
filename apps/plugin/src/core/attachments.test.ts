import { describe, expect, it } from 'vitest';
import { collectAttachments } from './attachments';

const references = (markdown: string) =>
  collectAttachments(markdown).map((attachment) => attachment.reference);

describe('collectAttachments', () => {
  it('finds obsidian embeds', () => {
    expect(references('![[diagram.png]]')).toEqual(['diagram.png']);
  });

  it('finds embeds with an alias', () => {
    expect(references('![[diagram.png|An architecture diagram]]')).toEqual(['diagram.png']);
  });

  it('finds markdown images', () => {
    expect(references('![alt](photo.jpg)')).toEqual(['photo.jpg']);
  });

  it('finds an angle-bracketed destination with spaces', () => {
    expect(references('![alt](<my photo.png>)')).toEqual(['my photo.png']);
  });

  it('decodes a percent-encoded destination', () => {
    expect(references('![alt](my%20photo.png)')).toEqual(['my photo.png']);
  });

  it('reports the basename separately from the reference', () => {
    expect(collectAttachments('![[attachments/sub/diagram.png]]')).toEqual([
      { reference: 'attachments/sub/diagram.png', filename: 'diagram.png' },
    ]);
  });

  it('returns each attachment once, in first-seen order', () => {
    expect(references('![[b.png]] ![[a.png]] ![[b.png]]')).toEqual(['b.png', 'a.png']);
  });

  it('ignores absolute urls', () => {
    expect(references('![alt](https://example.com/x.png)')).toEqual([]);
    expect(references('![alt](//example.com/x.png)')).toEqual([]);
  });

  it('ignores non-image files', () => {
    expect(references('![[report.pdf]] ![[notes.md]] ![[archive.zip]]')).toEqual([]);
  });

  it('ignores svg, which the server refuses anyway', () => {
    expect(references('![[logo.svg]]')).toEqual([]);
  });

  it('accepts every extension the server accepts', () => {
    expect(references('![[a.png]] ![[b.jpg]] ![[c.jpeg]] ![[d.gif]] ![[e.webp]]')).toHaveLength(5);
  });

  it('is case insensitive about the extension', () => {
    expect(references('![[Photo.PNG]]')).toEqual(['Photo.PNG']);
  });

  it('ignores embeds inside a fenced code block', () => {
    expect(references('```md\n![[example.png]]\n```')).toEqual([]);
  });

  it('ignores embeds inside a tilde fence', () => {
    expect(references('~~~\n![[example.png]]\n~~~')).toEqual([]);
  });

  it('ignores embeds inside inline code', () => {
    expect(references('Write `![[example.png]]` to embed one.')).toEqual([]);
  });

  it('still finds the real ones around a code block', () => {
    const markdown = '![[before.png]]\n\n```\n![[inside.png]]\n```\n\n![[after.png]]';
    expect(references(markdown)).toEqual(['before.png', 'after.png']);
  });

  it('ignores a plain link that is not an embed', () => {
    expect(references('[not an image](photo.png)')).toEqual([]);
    expect(references('[[Some Note]]')).toEqual([]);
  });

  it('finds nothing in an empty note', () => {
    expect(references('')).toEqual([]);
  });
});
