'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="message-page">
      <h1>Something went wrong</h1>
      <p>The note could not be loaded. This is usually temporary.</p>
      <p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </p>
    </main>
  );
}
