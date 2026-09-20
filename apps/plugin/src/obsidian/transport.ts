import { requestUrl } from 'obsidian';
import { ShareApiError } from '../core/errors';
import type { HttpRequest, HttpResponse, HttpTransport } from '../core/http';

/**
 * The only place the plugin makes a network call, and the only server it ever
 * calls is the one in settings. No telemetry, no third parties.
 *
 * `requestUrl()` rather than `fetch()`: it is Obsidian's own client, it works
 * identically on desktop and mobile, and it is not subject to the renderer's
 * CORS rules.
 */
export function createTransport(): HttpTransport {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    try {
      const response = await requestUrl({
        url: request.url,
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        // Error statuses are part of the protocol here, not exceptions.
        throw: false,
      });
      return { status: response.status, text: response.text };
    } catch (error) {
      throw new ShareApiError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Request failed',
      );
    }
  };
}
