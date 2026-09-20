import { type Menu, Notice, Plugin, TFile } from 'obsidian';
import { ShareApiClient } from './core/api-client';
import { describeError } from './core/errors';
import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  SETTINGS_PROBLEM_MESSAGES,
  validateSettings,
  type ShareNoteSettings,
} from './core/settings';
import { ShareService, type ShareResult } from './core/share-service';
import { createTransport } from './obsidian/transport';
import { toNoteHandle, VaultAdapter } from './obsidian/vault';
import { ConfirmModal } from './ui/confirm-modal';
import { ShareNoteSettingTab } from './ui/settings-tab';

export default class ShareNotePlugin extends Plugin {
  override settings: ShareNoteSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new ShareNoteSettingTab(this.app, this));
    this.registerCommands();
    this.registerFileMenu();
  }

  async loadSettings(): Promise<void> {
    this.settings = normaliseSettings((await this.loadData()) as unknown);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'share-note',
      name: 'Share note',
      checkCallback: (checking) => this.withNote(checking, (file) => this.runShare(file)),
    });

    this.addCommand({
      id: 'update-shared-note',
      name: 'Update shared note',
      checkCallback: (checking) =>
        this.withSharedNote(checking, (file) => this.runShare(file, { requireShared: true })),
    });

    this.addCommand({
      id: 'copy-share-link',
      name: 'Copy share link',
      checkCallback: (checking) => this.withSharedNote(checking, (file) => this.runCopyLink(file)),
    });

    this.addCommand({
      id: 'unshare-note',
      name: 'Unshare note',
      checkCallback: (checking) =>
        this.withSharedNote(checking, (file) => this.confirmUnshare(file)),
    });
  }

  private registerFileMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        const shared = new VaultAdapter(this.app).shareIdOf(toNoteHandle(file)) !== null;

        menu.addItem((item) =>
          item
            .setTitle(shared ? 'Update shared note' : 'Share note')
            .setIcon('share')
            .onClick(() => {
              void this.runShare(file);
            }),
        );

        if (!shared) return;

        menu.addItem((item) =>
          item
            .setTitle('Copy share link')
            .setIcon('link')
            .onClick(() => {
              void this.runCopyLink(file);
            }),
        );

        menu.addItem((item) =>
          item
            .setTitle('Unshare note')
            .setIcon('trash')
            .onClick(() => {
              this.confirmUnshare(file);
            }),
        );
      }),
    );
  }

  /* ---------------------------------------------------------------- actions */

  private async runShare(file: TFile, options: { requireShared?: boolean } = {}): Promise<void> {
    const service = this.createService();
    if (!service) return;

    if (
      options.requireShared &&
      new VaultAdapter(this.app).shareIdOf(toNoteHandle(file)) === null
    ) {
      new Notice('This note has not been shared yet.');
      return;
    }

    const progress = new Notice('Sharing note…', 0);
    try {
      const result = await service.share(toNoteHandle(file), (message) => {
        progress.setMessage(message);
      });
      progress.hide();

      if (this.settings.copyLinkAfterShare) {
        await navigator.clipboard.writeText(result.url).catch(() => {
          // Reported below; a copy failure must not look like a share failure.
        });
      }
      new Notice(this.describeShare(result));
    } catch (error) {
      progress.hide();
      new Notice(describeError(error));
      console.error('share-note: sharing failed', error);
    }
  }

  private async runCopyLink(file: TFile): Promise<void> {
    const url = new VaultAdapter(this.app).shareUrlOf(toNoteHandle(file));
    if (url === null) {
      new Notice('This note has not been shared yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      new Notice('Share link copied.');
    } catch {
      new Notice('Could not reach the clipboard. The link is in the note frontmatter.');
    }
  }

  private confirmUnshare(file: TFile): void {
    new ConfirmModal(this.app, {
      title: 'Unshare note',
      body: `"${file.basename}" and its attachments will be deleted from the server. The link will stop working immediately, and this cannot be undone.`,
      confirmText: 'Unshare',
      onConfirm: () => {
        void this.runUnshare(file);
      },
    }).open();
  }

  private async runUnshare(file: TFile): Promise<void> {
    const service = this.createService();
    if (!service) return;

    try {
      const result = await service.unshare(toNoteHandle(file));
      new Notice(
        result.deletedOnServer
          ? 'Note unshared. The link no longer works.'
          : 'That note was already unshared. The link has been removed from it.',
      );
    } catch (error) {
      new Notice(describeError(error));
      console.error('share-note: unsharing failed', error);
    }
  }

  /* ---------------------------------------------------------------- helpers */

  /** Builds the service, or tells the user what to fix and returns null. */
  private createService(): ShareService | null {
    const problem = validateSettings(this.settings);
    if (problem !== null) {
      new Notice(SETTINGS_PROBLEM_MESSAGES[problem]);
      return null;
    }

    const client = new ShareApiClient(createTransport(), {
      serverUrl: this.settings.serverUrl,
    });

    return new ShareService(client, new VaultAdapter(this.app), this.settings, () =>
      this.saveSettings(),
    );
  }

  private describeShare(result: ShareResult): string {
    const attachments =
      result.uploaded > 0
        ? ` ${String(result.uploaded)} attachment${result.uploaded === 1 ? '' : 's'} uploaded.`
        : '';
    const copied = this.settings.copyLinkAfterShare ? ' Link copied.' : '';

    switch (result.kind) {
      case 'created':
        return `Note shared.${attachments}${copied}`;
      case 'updated':
        return `Shared note updated.${attachments}${copied}`;
      case 'unchanged':
        return `Nothing to update; the shared note is already current.${copied}`;
    }
  }

  /** `checkCallback` wiring: report whether the command applies, then run it. */
  private withNote(checking: boolean, run: (file: TFile) => Promise<void> | void): boolean {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension !== 'md') return false;
    if (!checking) void run(file);
    return true;
  }

  private withSharedNote(checking: boolean, run: (file: TFile) => Promise<void> | void): boolean {
    const file = this.app.workspace.getActiveFile();
    if (file?.extension !== 'md') return false;
    if (new VaultAdapter(this.app).shareIdOf(toNoteHandle(file)) === null) return false;
    if (!checking) void run(file);
    return true;
  }
}
