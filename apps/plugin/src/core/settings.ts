export interface ShareNoteSettings {
  /** Base URL of the share-note server, without a trailing slash. */
  serverUrl: string;
  /** Copy the link to the clipboard after a successful share. */
  copyLinkAfterShare: boolean;
  /** Per-share record of what has already been uploaded, keyed by share id. */
  uploads: Record<string, Record<string, string>>;
}

export const DEFAULT_SETTINGS: ShareNoteSettings = {
  serverUrl: '',
  copyLinkAfterShare: true,
  uploads: {},
};

/**
 * Settings arrive from `data.json`, which a user can edit by hand, so every
 * field is checked rather than trusted.
 */
export function normaliseSettings(raw: unknown): ShareNoteSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  return {
    serverUrl: normaliseServerUrl(typeof source.serverUrl === 'string' ? source.serverUrl : ''),
    copyLinkAfterShare:
      typeof source.copyLinkAfterShare === 'boolean' ? source.copyLinkAfterShare : true,
    uploads: normaliseUploads(source.uploads),
  };
}

export function normaliseServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export type SettingsProblem = 'missing-server-url' | 'invalid-server-url' | 'insecure-server-url';

/**
 * What is wrong with the settings, in the order a user would fix it. Returns
 * null when the plugin is ready to talk to a server.
 */
export function validateSettings(settings: ShareNoteSettings): SettingsProblem | null {
  if (settings.serverUrl === '') return 'missing-server-url';

  let url: URL;
  try {
    url = new URL(settings.serverUrl);
  } catch {
    return 'invalid-server-url';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'invalid-server-url';
  // There is no key to protect any more, but a note and its edit token still
  // travel in the request: over plain http anything on the path can read the
  // note and keep the token, which is what lets a share be rewritten later.
  // Local development is the one case where the path is the user's own machine.
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) return 'insecure-server-url';

  return null;
}

export const SETTINGS_PROBLEM_MESSAGES: Record<SettingsProblem, string> = {
  'missing-server-url': 'Set the server URL in the Self-Hosted Note Share settings.',
  'invalid-server-url': 'The server URL is not a valid address.',
  'insecure-server-url':
    'Use https for a remote server: over http, your note and its edit token travel in the clear.',
};

function isLoopback(hostname: string): boolean {
  // URL keeps the brackets around an IPv6 host.
  const host = hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

function normaliseUploads(raw: unknown): Record<string, Record<string, string>> {
  if (typeof raw !== 'object' || raw === null) return {};

  const uploads: Record<string, Record<string, string>> = {};
  for (const [shareId, files] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof files !== 'object' || files === null) continue;

    const entries = Object.entries(files as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    if (entries.length > 0) uploads[shareId] = Object.fromEntries(entries);
  }
  return uploads;
}
