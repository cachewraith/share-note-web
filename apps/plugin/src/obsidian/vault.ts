import { type App, TFile } from 'obsidian';
import type { AttachmentReference } from '../core/attachments';
import { SHARE_ID_KEY, SHARE_URL_KEY } from '../core/frontmatter';
import type { AttachmentHandle, NoteGateway, NoteHandle } from '../core/note-gateway';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * `NoteGateway` implemented against Obsidian.
 *
 * Every line here is a call into the host. It exists so `src/core` never
 * imports `obsidian`, and so everything with a decision in it lives on the
 * other side of this boundary.
 */
export class VaultAdapter implements NoteGateway {
  constructor(private readonly app: App) {}

  async readMarkdown(note: NoteHandle): Promise<string> {
    return this.app.vault.read(this.fileFor(note));
  }

  shareIdOf(note: NoteHandle): string | null {
    return this.frontmatterString(note, SHARE_ID_KEY);
  }

  shareUrlOf(note: NoteHandle): string | null {
    return this.frontmatterString(note, SHARE_URL_KEY);
  }

  /**
   * `processFrontMatter` rather than rewriting the file: it edits the block in
   * place, leaves the rest of the note and anyone else's fields alone, and
   * serialises concurrent edits for us.
   */
  async writeShareDetails(note: NoteHandle, share: { id: string; url: string }): Promise<void> {
    await this.app.fileManager.processFrontMatter(
      this.fileFor(note),
      (frontmatter: Record<string, unknown>) => {
        frontmatter[SHARE_ID_KEY] = share.id;
        frontmatter[SHARE_URL_KEY] = share.url;
      },
    );
  }

  async clearShareDetails(note: NoteHandle): Promise<void> {
    await this.app.fileManager.processFrontMatter(
      this.fileFor(note),
      (frontmatter: Record<string, unknown>) => {
        delete frontmatter[SHARE_ID_KEY];
        delete frontmatter[SHARE_URL_KEY];
      },
    );
  }

  /**
   * Uses Obsidian's own link resolution, so shortest-path and folder-relative
   * names work the way they do in the editor.
   */
  resolveAttachments(
    references: readonly AttachmentReference[],
    note: NoteHandle,
  ): AttachmentHandle[] {
    const handles: AttachmentHandle[] = [];

    for (const reference of references) {
      const file = this.app.metadataCache.getFirstLinkpathDest(reference.reference, note.path);
      if (!(file instanceof TFile)) continue;

      const contentType = CONTENT_TYPES[file.extension.toLowerCase()];
      if (contentType === undefined) continue;

      handles.push({
        reference,
        contentType,
        read: () => this.app.vault.readBinary(file),
      });
    }
    return handles;
  }

  /**
   * Obsidian types a frontmatter cache as `[key: string]: any`, so it is
   * narrowed to `unknown` here and checked, rather than trusted.
   */
  private frontmatterString(note: NoteHandle, key: string): string | null {
    const frontmatter: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(
      this.fileFor(note),
    )?.frontmatter;

    const value = frontmatter?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private fileFor(note: NoteHandle): TFile {
    const file = this.app.vault.getAbstractFileByPath(note.path);
    if (!(file instanceof TFile)) {
      throw new Error(`No note at ${note.path}`);
    }
    return file;
  }
}

/** Obsidian hands commands a TFile; the rest of the plugin works on handles. */
export function toNoteHandle(file: TFile): NoteHandle {
  return { path: file.path, title: file.basename };
}
