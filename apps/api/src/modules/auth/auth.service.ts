import { Injectable, Logger } from '@nestjs/common';
import { timingSafeEqualHex } from '../../common/hash';
import { parseApiKey } from '../../common/ids';
import { AuthRepository } from './auth.repository';
import { type Principal } from './principal';

/**
 * A digest of a key that cannot exist, compared against when no row matches so
 * that a request with an unknown prefix costs the same as one with a known
 * prefix and a wrong secret. Without it, response time tells an attacker which
 * prefixes are real.
 */
const DECOY_HASH = '0'.repeat(64);

/** Only write `lastUsedAt` when it is this stale, so reads do not cost a write. */
const LAST_USED_RESOLUTION_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly repository: AuthRepository) {}

  /**
   * Resolves a presented bearer key to a principal, or null. Every rejection —
   * malformed, unknown, revoked, wrong secret — returns the same null, so the
   * caller cannot tell them apart.
   */
  async authenticate(presentedKey: string): Promise<Principal | null> {
    const parsed = parseApiKey(presentedKey);
    if (!parsed) return null;

    const record = await this.repository.findKeyByPrefix(parsed.prefix);
    const matches = timingSafeEqualHex(record?.keyHash ?? DECOY_HASH, parsed.keyHash);

    if (!record || !matches || record.revokedAt !== null) return null;

    void this.touch(record.id, record.lastUsedAt);

    return {
      userId: record.user.id,
      email: record.user.email,
      userCreatedAt: record.user.createdAt,
      apiKeyId: record.id,
      apiKeyName: record.name,
      apiKeyPrefix: record.prefix,
    };
  }

  private async touch(id: string, lastUsedAt: Date | null): Promise<void> {
    const now = new Date();
    if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS) return;
    try {
      await this.repository.touchKey(id, now);
    } catch (error) {
      // Bookkeeping, not authorization: a failure here must not fail the request.
      this.logger.warn(`could not update lastUsedAt: ${String(error)}`);
    }
  }
}
