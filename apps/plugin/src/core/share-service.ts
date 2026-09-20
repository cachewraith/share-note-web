import type { ShareApiClient } from './api-client';
import { collectAttachments } from './attachments';
import { ShareApiError } from './errors';
import { stripFrontmatter } from './frontmatter';
import { sha256Hex } from './hash';
import type { NoteGateway, NoteHandle } from './note-gateway';
import type { ShareNoteSettings } from './settings';

export interface ShareResult {
  readonly kind: 'created' | 'updated' | 'unchanged';
  readonly id: string;
  readonly url: string;
  readonly uploaded: number;
  readonly skipped: number;
}

export interface UnshareResult {
  /** False when the server had already forgotten the share. */
  readonly deletedOnServer: boolean;
}

export type ProgressReporter = (message: string) => void;

/**
 * Sharing, updating and unsharing a note.
 *
 * This is the only place that knows the *order* of things — read, publish,
 * upload, record — which is why it is worth having rather than spreading across
 * the command handlers. It depends on `NoteGateway` rather than on Obsidian, so
 * every branch below is reachable from a test.
 */
export class ShareService {
  constructor(
    private readonly api: ShareApiClient,
    private readonly notes: NoteGateway,
    private readonly settings: ShareNoteSettings,
    private readonly persist: () => Promise<void>,
  ) {}

  /**
   * Publishes a note, or republishes it to the same URL.
   *
   * The note goes up first and the attachments after: an attachment needs a
   * share to belong to. A note can therefore be briefly visible with an image
   * still uploading, which is better than holding the note back.
   */
  async share(note: NoteHandle, report: ProgressReporter = () => undefined): Promise<ShareResult> {
    const markdown = stripFrontmatter(await this.notes.readMarkdown(note));

    const existingId = this.notes.shareIdOf(note);
    const existingToken = this.notes.shareTokenOf(note);
    const published = await this.publish(
      existingId,
      existingToken,
      { title: note.title, markdown },
      report,
    );

    const { uploaded, skipped } = await this.uploadAttachments(
      published.id,
      published.editToken,
      markdown,
      note,
      report,
    );

    await this.notes.writeShareDetails(note, {
      id: published.id,
      url: published.url,
      // Written only when this run created the share; an update leaves the
      // token already in the note alone.
      ...(published.mintedToken === undefined ? {} : { editToken: published.mintedToken }),
    });

    // "Unchanged" only holds if nothing had to be uploaded either.
    const kind = published.kind === 'unchanged' && uploaded > 0 ? 'updated' : published.kind;
    return { kind, id: published.id, url: published.url, uploaded, skipped };
  }

  /** Deletes the note and its attachments from the server, permanently. */
  async unshare(note: NoteHandle): Promise<UnshareResult> {
    const id = this.notes.shareIdOf(note);
    if (id === null) throw new ShareApiError('NOT_FOUND', 'This note is not shared');

    const token = this.notes.shareTokenOf(note);
    if (token === null) {
      throw new ShareApiError(
        'FORBIDDEN',
        `This note has no ${'share_token'} in its frontmatter, so this vault cannot unshare it. ` +
          'Ask the server operator to run "cli issue-token" for it.',
      );
    }

    let deletedOnServer = true;
    try {
      await this.api.deleteShare(id, token);
    } catch (error) {
      // Already gone server-side: still worth tidying the note.
      if (!(error instanceof ShareApiError) || error.code !== 'NOT_FOUND') throw error;
      deletedOnServer = false;
    }

    await this.notes.clearShareDetails(note);
    delete this.settings.uploads[id];
    await this.persist();

    return { deletedOnServer };
  }

  /**
   * Creates the share, or updates the existing one. A note whose recorded share
   * no longer exists — unshared from another device, or from the CLI — is
   * published afresh rather than failing.
   */
  private async publish(
    existingId: string | null,
    existingToken: string | null,
    input: { title: string; markdown: string },
    report: ProgressReporter,
  ): Promise<{
    kind: ShareResult['kind'];
    id: string;
    url: string;
    editToken: string;
    /** Set only when this call created the share, so the note records it once. */
    mintedToken?: string;
  }> {
    // Without the token an update cannot be authorised, so a note that has an
    // id but no token is republished as a new share rather than failing. The
    // old one stays up at its own link until somebody removes it.
    if (existingId !== null && existingToken !== null) {
      report('Updating shared note…');
      try {
        const updated = await this.api.updateShare(existingId, existingToken, input);
        return {
          kind: updated.updated ? 'updated' : 'unchanged',
          id: updated.id,
          url: updated.url,
          editToken: existingToken,
        };
      } catch (error) {
        if (!(error instanceof ShareApiError) || error.code !== 'NOT_FOUND') throw error;
        report('That share is gone; publishing a new one…');
      }
    }

    report('Sharing note…');
    const created = await this.api.createShare(input);
    return {
      kind: 'created',
      id: created.id,
      url: created.url,
      editToken: created.editToken,
      mintedToken: created.editToken,
    };
  }

  /**
   * Uploads the images the note embeds, skipping any whose bytes have not
   * changed since the last share — which is the usual case, and what keeps
   * re-sharing a note with a large diagram cheap.
   */
  private async uploadAttachments(
    shareId: string,
    editToken: string,
    markdown: string,
    note: NoteHandle,
    report: ProgressReporter,
  ): Promise<{ uploaded: number; skipped: number }> {
    const resolved = this.notes.resolveAttachments(collectAttachments(markdown), note);

    const known = this.settings.uploads[shareId] ?? {};
    const next: Record<string, string> = {};
    let uploaded = 0;
    let skipped = 0;

    for (const [index, attachment] of resolved.entries()) {
      const bytes = await attachment.read();
      const digest = await sha256Hex(bytes);
      const filename = attachment.reference.filename;

      if (known[filename] === digest) {
        next[filename] = digest;
        skipped += 1;
        continue;
      }

      report(`Uploading attachment ${String(index + 1)} of ${String(resolved.length)}…`);
      await this.api.uploadAsset({
        shareId,
        editToken,
        filename,
        contentType: attachment.contentType,
        bytes,
      });
      next[filename] = digest;
      uploaded += 1;
    }

    // Replaces rather than merges, so an attachment removed from the note stops
    // being remembered and is uploaded again if it comes back.
    this.settings.uploads[shareId] = next;
    await this.persist();

    return { uploaded, skipped };
  }
}
