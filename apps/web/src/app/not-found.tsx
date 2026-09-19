import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="message-page">
      <h1>Nothing here</h1>
      <p>
        This link does not point at a shared note. It may have been unshared, or the address may
        have a typo in it.
      </p>
      <p>
        Unsharing is permanent, so if the note was taken down there is nothing to recover — ask
        whoever sent you the link for a new one.
      </p>
      <p>
        <Link href="/">About share-note</Link>
      </p>
    </main>
  );
}
