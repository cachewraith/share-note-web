import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'share-note', template: '%s · share-note' },
  description: 'Publish a single Obsidian note to a link you can send to anyone.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Set by middleware.ts. Next puts it on the scripts it injects, which is what
  // lets `script-src` stay nonce-only.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <body>
        <script nonce={nonce} />
        {children}
      </body>
    </html>
  );
}
