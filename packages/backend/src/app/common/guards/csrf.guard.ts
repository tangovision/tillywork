import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { randomBytes, timingSafeEqual } from 'crypto';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

/**
 * CSRF Guard for protecting state-changing operations.
 *
 * This guard implements a double-submit cookie pattern:
 * 1. A CSRF token is set as a cookie on the first request
 * 2. The client must include this token in the X-CSRF-Token header
 * 3. The guard compares the cookie value with the header value
 *
 * Note: Since the application primarily uses JWT in Authorization headers
 * (not cookies), CSRF risk is already mitigated for most operations.
 * This guard provides additional protection for sensitive operations.
 *
 * Usage: @UseGuards(CsrfGuard) on sensitive endpoints
 */
@Injectable()
export class CsrfGuard implements CanActivate {
    private readonly CSRF_COOKIE_NAME = 'XSRF-TOKEN';
    private readonly CSRF_HEADER_NAME = 'x-csrf-token';

    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        // Check if endpoint has @SkipCsrf decorator
        const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (skipCsrf) {
            return true;
        }

        const request = context.switchToHttp().getRequest<FastifyRequest>();

        // Get CSRF token from cookie
        const cookieToken = (request.cookies as any)?.[this.CSRF_COOKIE_NAME];

        // Get CSRF token from header
        const headerToken = request.headers[this.CSRF_HEADER_NAME] as string;

        // If no cookie token exists, this is the first request - allow it
        // The cookie will be set by the response interceptor
        if (!cookieToken) {
            return true;
        }

        // If cookie exists but no header token, reject
        if (!headerToken) {
            throw new ForbiddenException('CSRF token missing in request header');
        }

        // Compare tokens using timing-safe comparison to prevent timing attacks
        if (!this.compareTokens(cookieToken, headerToken)) {
            throw new ForbiddenException('Invalid CSRF token');
        }

        return true;
    }

    /**
     * Timing-safe token comparison to prevent timing attacks
     */
    private compareTokens(a: string, b: string): boolean {
        try {
            const bufferA = Buffer.from(a, 'utf-8');
            const bufferB = Buffer.from(b, 'utf-8');

            // Tokens must be the same length
            if (bufferA.length !== bufferB.length) {
                return false;
            }

            return timingSafeEqual(bufferA, bufferB);
        } catch {
            return false;
        }
    }

    /**
     * Generate a new CSRF token
     */
    static generateToken(): string {
        return randomBytes(32).toString('hex');
    }
}
