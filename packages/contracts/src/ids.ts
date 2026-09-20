import { z } from 'zod';
import { EDIT_TOKEN_PATTERN, PUBLIC_ID_PATTERN, SHA256_HEX_PATTERN } from './constants';

export {
  EDIT_TOKEN_PATTERN,
  EDIT_TOKEN_SECRET_LENGTH,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  PUBLIC_ID_PATTERN,
  SHA256_HEX_PATTERN,
} from './constants';

export const PublicIdSchema = z.string().regex(PUBLIC_ID_PATTERN, 'Invalid public id');

export const ShareIdSchema = PublicIdSchema;
export const AssetIdSchema = PublicIdSchema;

export type ShareId = z.infer<typeof ShareIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;

export const Sha256HexSchema = z.string().regex(SHA256_HEX_PATTERN, 'Invalid sha-256 digest');

export const EditTokenSchema = z.string().regex(EDIT_TOKEN_PATTERN, 'Invalid edit token format');
