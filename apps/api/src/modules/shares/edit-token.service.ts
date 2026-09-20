import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../../common/app-error';
import { hashPresentedEditToken } from '../../common/ids';
import { ShareRepository, type ShareRecord } from './share.repository';

/**
 * The one authorization rule this API has.
 *
 * There is no authentication: anyone who can reach the server may publish. What
 * a caller may not do is change or delete somebody else's note, and a share's
 * id cannot be the thing that stops them — the id is in the link the author
 * hands out. So creation mints an edit token, returns it once, and stores only
 * its digest; every write to an existing share has to present it.
 *
 * Kept out of the controllers, and out of a Nest guard, so it can be tested
 * without a request object — the same reason the ownership check that preceded
 * it lived in the service layer.
 */
@Injectable()
export class EditTokenService {
  constructor(private readonly shares: ShareRepository) {}

  /**
   * Returns the share if the presented token matches, and throws NOT_FOUND
   * otherwise — for a missing share, a missing token and a wrong token alike.
   *
   * They are one answer on purpose. Distinguishing them would tell a caller
   * holding a public link whether that id is live and merely locked, which is
   * the fact the 404 exists to withhold (OWASP A01).
   */
  async assertWritable(id: string, presented: string | undefined): Promise<ShareRecord> {
    const share = await this.shares.findForWrite(id, new Date());
    const presentedHash = hashPresentedEditToken(presented);

    if (share?.editTokenHash == null || presentedHash === null) {
      throw AppError.notFound('No such share');
    }
    if (!digestsMatch(share.editTokenHash, presentedHash)) {
      throw AppError.notFound('No such share');
    }
    return share;
  }
}

/**
 * Both operands are sha-256 hex of the same fixed width, so the length check
 * leaks nothing a malformed token had not already given away.
 */
function digestsMatch(stored: string, presented: string): boolean {
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
