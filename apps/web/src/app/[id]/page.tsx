import { ShareIdSchema } from '@share-note/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CodeCopyButtons } from '@/components/code-copy-buttons';
import { fetchShare } from '@/lib/api/client';
import { getConfig } from '@/lib/config';
import { summarise } from '@/lib/markdown/render';
import { renderShare } from '@/lib/render-cache';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** The id is checked here so a malformed one never reaches the API. */
async function load(params: PageProps['params']) {
  const { id } = await params;
  if (!ShareIdSchema.safeParse(id).success) notFound();

  const share = await fetchShare(id);
  if (!share) notFound();
  return share;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!ShareIdSchema.safeParse(id).success) return { title: 'Not found' };

  const share = await fetchShare(id);
  if (!share) return { title: 'Not found' };

  const config = getConfig();
  const description = summarise(share.markdown);
  const url = `${config.publicWebUrl}/${share.id}`;

  return {
    title: share.title,
    description,
    alternates: { canonical: url },
    // A shared link is meant to be sent to specific people, not found. The API
    // sets the same header on its own responses.
    robots: { index: false, follow: false },
    openGraph: {
      type: 'article',
      title: share.title,
      description,
      url,
      siteName: 'share-note',
      publishedTime: share.createdAt,
      modifiedTime: share.updatedAt,
    },
    twitter: { card: 'summary', title: share.title, description },
  };
}

export default async function SharePage({ params }: PageProps) {
  const share = await load(params);
  const html = await renderShare(share);

  return (
    <main className="share">
      <article className="share-article">
        <header className="share-header">
          <h1>{share.title}</h1>
          <p className="share-meta">
            Updated <time dateTime={share.updatedAt}>{formatDate(share.updatedAt)}</time>
          </p>
        </header>
        <CodeCopyButtons>
          {/*
            The HTML is produced by the pipeline in lib/markdown, which sanitizes
            before it highlights. This is the only place the viewer injects
            markup, and it is the reason that pipeline has the test suite it has.
          */}
          <div className="share-body" dangerouslySetInnerHTML={{ __html: html }} />
        </CodeCopyButtons>
      </article>
      <footer className="share-footer">
        <p>
          Shared with <a href="https://github.com/cachewraith/share-note-web">share-note</a>.
        </p>
      </footer>
    </main>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
