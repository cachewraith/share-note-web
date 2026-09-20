/**
 * The bit of HTTP the plugin needs, as an interface.
 *
 * `core` stays free of Obsidian imports, so it cannot call `requestUrl()`
 * itself; the adapter in `src/obsidian` supplies one of these. Tests supply a
 * fake, which is what lets the whole client be unit-tested with no network and
 * no Obsidian.
 */
export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly headers: Record<string, string>;
  readonly body?: string | ArrayBuffer;
}

export interface HttpResponse {
  readonly status: number;
  readonly text: string;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export const MULTIPART_BOUNDARY_PREFIX = '----ShareNoteBoundary';

/**
 * Builds a `multipart/form-data` body by hand.
 *
 * Obsidian's `requestUrl()` takes an ArrayBuffer, and `FormData` is not
 * available in every context the plugin runs in, so the body is assembled
 * here — where it is pure, and tested.
 *
 * The boundary is random, and the filename is escaped, so neither the file's
 * contents nor its name can close the part early and inject a header.
 */
export function buildMultipartBody(input: {
  field: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
  boundary?: string;
}): { body: ArrayBuffer; contentType: string } {
  const boundary = input.boundary ?? `${MULTIPART_BOUNDARY_PREFIX}${randomToken()}`;
  const encoder = new TextEncoder();

  const head = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${escapeHeaderValue(input.field)}"; ` +
      `filename="${escapeHeaderValue(input.filename)}"\r\n` +
      `Content-Type: ${escapeHeaderValue(input.contentType)}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const file = new Uint8Array(input.bytes);

  const body = new Uint8Array(head.byteLength + file.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(file, head.byteLength);
  body.set(tail, head.byteLength + file.byteLength);

  return {
    body: body.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Quotes and control characters are the only way out of a header value. */
function escapeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return value.replace(/[\u0000-\u001f\u007f"\\]/g, '_');
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
