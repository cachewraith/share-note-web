/**
 * Every path the API serves, in one place. The API mounts these, the web app and
 * the plugin call them; nobody hand-writes a URL.
 */
export const API_VERSION = 'v1';

export const ROUTES = {
  health: '/health',
  ready: '/ready',
  docs: '/docs',

  me: `/${API_VERSION}/me`,

  shares: `/${API_VERSION}/shares`,
  share: (id: string) => `/${API_VERSION}/shares/${id}`,
  shareAssets: (id: string) => `/${API_VERSION}/shares/${id}/assets`,

  publicShare: (id: string) => `/${API_VERSION}/public/shares/${id}`,
  publicAsset: (id: string) => `/${API_VERSION}/public/assets/${id}`,
} as const;

/** Controller-level path segments, for the API's own routing decorators. */
export const CONTROLLER_PATHS = {
  shares: `${API_VERSION}/shares`,
  me: `${API_VERSION}/me`,
  public: `${API_VERSION}/public`,
} as const;

export const AUTH_HEADER = 'authorization';
export const AUTH_SCHEME = 'Bearer';

/** The multipart field the attachment bytes arrive in. */
export const ASSET_FILE_FIELD = 'file';

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
