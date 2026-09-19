'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Makes the copy buttons in rendered code blocks work.
 *
 * One delegated listener for the whole article rather than a component per
 * block: the note is server-rendered HTML, so there is nothing to hydrate
 * per block, and this stays a single small client component whatever the note
 * contains.
 */
export function CodeCopyButtons({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const timers = new Set<ReturnType<typeof setTimeout>>();

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const button = target.closest<HTMLButtonElement>('button[data-copy]');
      if (!button) return;

      const code = button.closest('figure')?.querySelector('code');
      if (!code) return;

      void navigator.clipboard
        .writeText(code.textContent ?? '')
        .then(() => {
          setLabel(button, 'Copied');
        })
        .catch(() => {
          // Clipboard access can be refused; say so rather than looking broken.
          setLabel(button, 'Press ctrl+c');
        });
    };

    const setLabel = (button: HTMLButtonElement, label: string) => {
      button.textContent = label;
      const timer = setTimeout(() => {
        button.textContent = 'Copy';
        timers.delete(timer);
      }, 2000);
      timers.add(timer);
    };

    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('click', onClick);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return <div ref={container}>{children}</div>;
}
