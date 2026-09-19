import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import proxy from './proxy';

function csp(path = '/aaaaaaaaaaaaaaaaaaaaa'): Record<string, string> {
  const response = proxy(new NextRequest(`http://localhost:3000${path}`));
  const header = response.headers.get('Content-Security-Policy') ?? '';

  return Object.fromEntries(
    header.split(';').map((directive) => {
      const [name, ...values] = directive.trim().split(' ');
      return [name ?? '', values.join(' ')];
    }),
  );
}

describe('proxy', () => {
  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://api.example.com';
  });

  it('refuses everything by default', () => {
    expect(csp()['default-src']).toBe("'none'");
  });

  it('allows scripts only with the request nonce', () => {
    const directive = csp()['script-src'] ?? '';
    expect(directive).toMatch(/^'self' 'nonce-[A-Za-z0-9+/=]+'$/);
    expect(directive).not.toContain('unsafe-inline');
    expect(directive).not.toContain('unsafe-eval');
  });

  it('issues a different nonce per request', () => {
    expect(csp()['script-src']).not.toBe(csp()['script-src']);
  });

  it('allows images from this origin and the api only', () => {
    expect(csp()['img-src']).toBe("'self' data: https://api.example.com");
  });

  it('allows inline styles, which is what Shiki needs, and nothing more', () => {
    expect(csp()['style-src']).toBe("'self' 'unsafe-inline'");
  });

  it.each([
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['frame-ancestors', "'none'"],
  ])('locks down %s', (directive, expected) => {
    expect(csp()[directive]).toBe(expected);
  });

  it('sets the other security headers', () => {
    const response = proxy(new NextRequest('http://localhost:3000/'));

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('passes the nonce to the app so Next can use it', () => {
    const response = proxy(new NextRequest('http://localhost:3000/'));
    const nonce = /'nonce-([^']+)'/.exec(
      response.headers.get('Content-Security-Policy') ?? '',
    )?.[1];

    expect(nonce).toBeDefined();
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-nonce');
  });

  it('leaves static assets alone', () => {
    const response = proxy(new NextRequest('http://localhost:3000/_next/static/chunks/a.js'));
    expect(response.headers.get('Content-Security-Policy')).toBeNull();
  });
});
