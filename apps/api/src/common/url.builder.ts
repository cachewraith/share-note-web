import { Inject, Injectable } from '@nestjs/common';
import { ROUTES } from '@share-note/contracts';
import { APP_CONFIG, type AppConfig } from '../config';

/**
 * Builds the public URLs that go into responses. One place, so a deployment
 * behind a different hostname changes configuration rather than code, and so no
 * handler ever concatenates a URL by hand.
 */
@Injectable()
export class UrlBuilder {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  share(id: string): string {
    return `${this.config.publicWebUrl}/${id}`;
  }

  asset(id: string): string {
    return `${this.config.publicApiUrl}${ROUTES.publicAsset(id)}`;
  }
}
