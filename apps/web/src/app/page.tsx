import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'share-note',
  description: 'Publish a single Obsidian note to a link you can send to anyone.',
};

export default function LandingPage() {
  return (
    <main className="message-page">
      <h1>share-note</h1>
      <p>
        Publish a single Obsidian note to a link you can send to anyone. The note renders in any
        browser, with syntax highlighting, tables, callouts and its attachments — no Obsidian needed
        on the other end.
      </p>
      <p>
        This server hosts notes shared by the people who run it. There is nothing to sign up for
        here: a link someone sent you will open directly.
      </p>
      <p>
        <a href="https://github.com/cachewraith/share-note-web">
          Source, documentation and the Obsidian plugin
        </a>
      </p>
    </main>
  );
}
