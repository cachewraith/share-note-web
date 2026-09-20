import {
  ASSET_FILE_FIELD,
  AUTH_SCHEME,
  isApiError,
  isCreateAssetResponse,
  isCreateShareResponse,
  isMeResponse,
  isUpdateShareResponse,
  joinUrl,
  ROUTES,
  type CreateAssetResponse,
  type CreateShareResponse,
  type MeResponse,
  type UpdateShareResponse,
} from '@share-note/contracts/lite';
import { ShareApiError } from './errors';
import { buildMultipartBody, type HttpTransport } from './http';

/**
 * The plugin's view of the API.
 *
 * Depends on an `HttpTransport` rather than on Obsidian's `requestUrl`, so the
 * whole client is unit-testable without a network or a vault. Responses are
 * checked against the contract's guards: if the URL points at something that is
 * not a share-note server, that is caught here and says so, rather than
 * surfacing later as an undefined property.
 */
export class ShareApiClient {
  constructor(
    private readonly transport: HttpTransport,
    private readonly options: { serverUrl: string; apiKey: string },
  ) {}

  async me(): Promise<MeResponse> {
    return this.request('GET', ROUTES.me, isMeResponse);
  }

  async createShare(input: { title: string; markdown: string }): Promise<CreateShareResponse> {
    return this.request('POST', ROUTES.shares, isCreateShareResponse, input);
  }

  async updateShare(
    id: string,
    input: { title: string; markdown: string },
  ): Promise<UpdateShareResponse> {
    return this.request('PUT', ROUTES.share(id), isUpdateShareResponse, input);
  }

  async deleteShare(id: string): Promise<void> {
    const response = await this.send({
      method: 'DELETE',
      path: ROUTES.share(id),
      headers: {},
    });
    if (response.status !== 204) this.fail(response);
  }

  async uploadAsset(input: {
    shareId: string;
    filename: string;
    contentType: string;
    bytes: ArrayBuffer;
  }): Promise<CreateAssetResponse> {
    const multipart = buildMultipartBody({
      field: ASSET_FILE_FIELD,
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
    });

    const response = await this.send({
      method: 'POST',
      path: ROUTES.shareAssets(input.shareId),
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    });

    if (response.status !== 201) this.fail(response);
    return this.parse(response.text, isCreateAssetResponse);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    isExpected: (value: unknown) => value is T,
    body?: unknown,
  ): Promise<T> {
    const response = await this.send({
      method,
      path,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status < 200 || response.status >= 300) this.fail(response);
    return this.parse(response.text, isExpected);
  }

  private async send(input: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    headers: Record<string, string>;
    body?: string | ArrayBuffer;
  }) {
    return this.transport({
      url: joinUrl(this.options.serverUrl, input.path),
      method: input.method,
      headers: {
        ...input.headers,
        Authorization: `${AUTH_SCHEME} ${this.options.apiKey}`,
        Accept: 'application/json',
      },
      ...(input.body === undefined ? {} : { body: input.body }),
    });
  }

  /** Turns an error response into a `ShareApiError` carrying the contract code. */
  private fail(response: { status: number; text: string }): never {
    const body = safeJson(response.text);
    if (isApiError(body)) {
      throw new ShareApiError(body.error.code, body.error.message, response.status);
    }
    throw new ShareApiError(
      'BAD_RESPONSE',
      `Unexpected response (status ${String(response.status)})`,
      response.status,
    );
  }

  private parse<T>(text: string, isExpected: (value: unknown) => value is T): T {
    const body = safeJson(text);
    if (!isExpected(body)) {
      throw new ShareApiError('BAD_RESPONSE', 'Response did not match the API contract');
    }
    return body;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
