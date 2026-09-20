/**
 * SHA-256, hex encoded, via Web Crypto.
 *
 * `crypto.subtle` rather than Node's `crypto`: the plugin declares
 * `isDesktopOnly: false`, so everything in `core` has to run on iOS and Android
 * too, where there is no Node runtime.
 */
export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : toUint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
