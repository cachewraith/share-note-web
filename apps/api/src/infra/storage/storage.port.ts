import { type Readable } from 'node:stream';

export interface StoredObject {
  readonly stream: Readable;
  readonly contentType: string;
  readonly contentLength: number;
  readonly etag?: string;
}

export interface StoredObjectSummary {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Date;
}

export interface PutObjectInput {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
  /** Base64 sha-256 of `body`; the store verifies it server-side. */
  readonly checksumSha256: string;
}

/**
 * Everything the app needs from object storage, and nothing else.
 *
 * Deliberately an interface with a token rather than a concrete class: the S3
 * adapter is one implementation, and tests (and a future filesystem or GCS
 * backend) are others. Nothing above this line imports the AWS SDK.
 */
export interface StoragePort {
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: readonly string[]): Promise<void>;
  /** Lists every object under a prefix. Used by the orphaned-object sweep. */
  list(prefix: string): Promise<StoredObjectSummary[]>;
  isReachable(): Promise<boolean>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
