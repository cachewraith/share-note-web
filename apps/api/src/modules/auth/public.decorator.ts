import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = 'share-note:public-route';

/**
 * Marks a route as reachable without an API key. Authentication is on by
 * default (ApiKeyGuard is global), so forgetting this decorator makes a route
 * private — the safe direction to fail (OWASP A01).
 */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
