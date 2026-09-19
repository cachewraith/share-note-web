import { type FastifyRequest } from 'fastify';

/** Who a request is acting as. Attached by ApiKeyGuard, read by controllers. */
export interface Principal {
  readonly userId: string;
  readonly email: string | null;
  readonly userCreatedAt: Date;
  readonly apiKeyId: string;
  readonly apiKeyName: string;
  readonly apiKeyPrefix: string;
}

/**
 * A request that may have been authenticated.
 *
 * Declared as its own interface rather than by augmenting Fastify's: the
 * `declare module 'fastify'` form has to repeat every one of FastifyRequest's
 * type parameters, and getting that subtly wrong degrades the whole interface
 * to `any` — which silently disables exactly the type checks that make the
 * header handling in ApiKeyGuard safe.
 */
export interface RequestWithPrincipal extends FastifyRequest {
  principal?: Principal;
}
