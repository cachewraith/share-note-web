import { type App, PluginSettingTab, Setting } from 'obsidian';
import { ShareApiClient } from '../core/api-client';
import { describeError } from '../core/errors';
import { normaliseServerUrl, SETTINGS_PROBLEM_MESSAGES, validateSettings } from '../core/settings';
import { createTransport } from '../obsidian/transport';
import type ShareNotePlugin from '../main';

/**
 * All text here is sentence case, and every message says what to do next rather
 * than only what went wrong.
 */
export class ShareNoteSettingTab extends PluginSettingTab {
  private status: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly plugin: ShareNotePlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('The address of your share-note server, for example https://notes.example.com.')
      .addText((text) =>
        text
          .setPlaceholder('https://notes.example.com')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = normaliseServerUrl(value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Copy link after sharing')
      .setDesc('Put the share link on the clipboard as soon as a note is published.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.copyLinkAfterShare).onChange(async (value) => {
          this.plugin.settings.copyLinkAfterShare = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Checks that the address answers and is a note-share server.')
      .addButton((button) =>
        button
          .setButtonText('Test connection')
          .setCta()
          .onClick(() => {
            void this.testConnection(button.buttonEl);
          }),
      );

    // Built with createEl rather than innerHTML: nothing here is ever assembled
    // from a string, so there is no way for a value to become markup.
    this.status = containerEl.createEl('p', { cls: 'share-note-setting-status' });
    this.setStatus('');
  }

  private async testConnection(button: HTMLButtonElement): Promise<void> {
    const problem = validateSettings(this.plugin.settings);
    if (problem !== null) {
      this.setStatus(SETTINGS_PROBLEM_MESSAGES[problem], 'error');
      return;
    }

    button.disabled = true;
    this.setStatus('Checking…');

    try {
      const client = new ShareApiClient(createTransport(), {
        serverUrl: this.plugin.settings.serverUrl,
      });
      const ready = await client.ready();
      this.setStatus(
        ready.status === 'ready'
          ? 'Connected. The server is ready to publish notes.'
          : 'Reached the server, but it reports a dependency down; publishing may fail.',
        ready.status === 'ready' ? 'success' : 'error',
      );
    } catch (error) {
      this.setStatus(describeError(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  private setStatus(message: string, kind?: 'error' | 'success'): void {
    const status = this.status;
    if (!status) return;

    status.setText(message);
    status.removeClass('is-error');
    status.removeClass('is-success');
    if (kind === 'error') status.addClass('is-error');
    if (kind === 'success') status.addClass('is-success');
  }
}
