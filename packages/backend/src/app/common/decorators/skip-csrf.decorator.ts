import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to skip CSRF protection on specific endpoints.
 *
 * Use this for endpoints that:
 * - Are idempotent (GET, HEAD, OPTIONS)
 * - Are called by non-browser clients
 * - Have alternative CSRF protection mechanisms
 *
 * @example
 * @SkipCsrf()
 * @Get('public-data')
 * getPublicData() { ... }
 */
export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
