import { type App, Modal, Setting } from 'obsidian';

/**
 * A yes/no modal. Used for unsharing, which deletes the note and its
 * attachments from the server and cannot be undone — so it is worth asking.
 */
export class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly options: {
      title: string;
      body: string;
      confirmText: string;
      onConfirm: () => void;
    },
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.contentEl.createEl('p', { text: this.options.body });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('Cancel').onClick(() => {
          this.close();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(this.options.confirmText)
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.confirmed) this.options.onConfirm();
  }
}
