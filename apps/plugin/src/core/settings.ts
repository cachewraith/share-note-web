import { isApiKey } from '@share-note/contracts/lite';

export interface ShareNoteSettings {
  /** Base URL of the share-note server, without a trailing slash. */
  serverUrl: string;
  apiKey: string;
  /** Copy the link to the clipboard after a successful share. */
  copyLinkAfterShare: boolean;
  /** Per-share record of what has already been uploaded, keyed by share id. */
  uploads: Record<string, Record<string, string>>;
}

export const DEFAULT_SETTINGS: ShareNoteSettings = {
  serverUrl: '',
  apiKey: '',
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
    apiKey: typeof source.apiKey === 'string' ? source.apiKey.trim() : '',
    copyLinkAfterShare:
      typeof source.copyLinkAfterShare === 'boolean' ? source.copyLinkAfterShare : true,
    uploads: normaliseUploads(source.uploads),
  };
}

export function normaliseServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export type SettingsProblem =
  | 'missing-server-url'
  | 'invalid-server-url'
  | 'insecure-server-url'
  | 'missing-api-key'
  | 'invalid-api-key';

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
  // An API key sent over plain http is readable by anything on the path. Local
  // development is the one case where that is the user's own machine.
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) return 'insecure-server-url';

  if (settings.apiKey === '') return 'missing-api-key';
  if (!isApiKey(settings.apiKey)) return 'invalid-api-key';

  return null;
}

export const SETTINGS_PROBLEM_MESSAGES: Record<SettingsProblem, string> = {
  'missing-server-url': 'Set the server URL in the share-note settings.',
  'invalid-server-url': 'The server URL is not a valid address.',
  'insecure-server-url':
    'Use https for a remote server: over http, your API key travels in the clear.',
  'missing-api-key': 'Set the API key in the share-note settings.',
  'invalid-api-key': 'That API key is not in the expected format (snw_…).',
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
