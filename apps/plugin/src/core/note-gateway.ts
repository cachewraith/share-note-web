import type { AttachmentReference } from './attachments';

/** A note, identified the way the host identifies it. */
export interface NoteHandle {
  /** Vault-relative path. The adapter resolves it back to a file. */
  readonly path: string;
  /** What the shared page is titled: the note's name without its extension. */
  readonly title: string;
}

export interface AttachmentHandle {
  readonly reference: AttachmentReference;
  /** One of the types the server accepts. */
  readonly contentType: string;
  read(): Promise<ArrayBuffer>;
}

/**
 * Everything `ShareService` needs from the vault.
 *
 * Declared here, in `core`, with no Obsidian types anywhere in it — which is
 * what lets the whole sharing flow be unit-tested against an in-memory fake.
 * `src/obsidian/VaultAdapter` is the real implementation.
 */
export interface NoteGateway {
  readMarkdown(note: NoteHandle): Promise<string>;
  shareIdOf(note: NoteHandle): string | null;
  shareUrlOf(note: NoteHandle): string | null;
  writeShareDetails(note: NoteHandle, share: { id: string; url: string }): Promise<void>;
  clearShareDetails(note: NoteHandle): Promise<void>;
  /**
   * Turns the references a note makes into things that can be read, using the
   * host's own link resolution. References that resolve to nothing, or to a
   * type the server will not take, are left out.
   */
  resolveAttachments(
    references: readonly AttachmentReference[],
    note: NoteHandle,
  ): AttachmentHandle[];
}
