import { type NextRequest, NextResponse } from 'next/server';
import { getConfig } from './lib/config';

/**
 * Sets the viewer's Content-Security-Policy.
 *
 * Every response carries a fresh nonce, and `script-src` accepts nothing else —
 * so even if something slipped past the sanitizer, an injected `<script>` would
 * not run.
 *
 * `style-src` keeps `'unsafe-inline'`: Shiki colours each token with an inline
 * style, and there is no way to hash them ahead of time. An inline *style*
 * cannot execute script, and everything that could — scripts, objects, frames,
 * form targets, the document base — is locked down, so this is the one relaxed
 * directive and it is a narrow one.
 *
 * `img-src` names the API origin, which is where attachments are served from;
 * the pipeline drops every image that does not resolve to one, so no other
 * origin can be reached from a note.
 *
 * This is Next 16's `proxy` convention (the renamed `middleware`), which always
 * runs on the Node.js runtime — so the API origin is read at request time
 * rather than inlined at build, and one image works for any host.
 */
const SKIP = /^\/(?:_next\/static|_next\/image|favicon\.ico)/;

export default function proxy(request: NextRequest): NextResponse {
  if (SKIP.test(request.nextUrl.pathname)) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const { publicApiUrl } = getConfig();

  const directives = [
    `default-src 'none'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: ${publicApiUrl}`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `manifest-src 'self'`,
  ].join('; ');

  const headers = new Headers(request.headers);
  // Next reads this to put the nonce on the scripts it injects.
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', directives);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}
