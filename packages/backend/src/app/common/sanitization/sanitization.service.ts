import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

/**
 * Service for sanitizing user input to prevent XSS attacks.
 *
 * Uses DOMPurify to remove malicious scripts, event handlers,
 * and other XSS vectors from HTML content.
 */
@Injectable()
export class SanitizationService {
    private readonly DOMPurify: ReturnType<typeof createDOMPurify>;

    constructor() {
        // Create a JSDOM window for server-side DOMPurify
        const window = new JSDOM('').window;
        this.DOMPurify = createDOMPurify(window as unknown as Window);
    }

    /**
     * Sanitize HTML content to prevent XSS attacks.
     *
     * Removes:
     * - Script tags
     * - Event handlers (onclick, onerror, etc.)
     * - JavaScript URLs (javascript:)
     * - Data URLs with scripts
     * - Unsafe SVG content
     *
     * @param dirty - Potentially unsafe HTML content
     * @param options - DOMPurify configuration options
     * @returns Sanitized HTML safe for rendering
     */
    sanitizeHtml(
        dirty: string,
        options?: {
            allowedTags?: string[];
            allowedAttributes?: string[];
            allowDataAttributes?: boolean;
        }
    ): string {
        if (!dirty) {
            return '';
        }

        const config: any = {
            // Return a string instead of a DocumentFragment
            RETURN_DOM: false,
            RETURN_DOM_FRAGMENT: false,

            // Forbid tags
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base'],

            // Forbid attributes
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],

            // Allow data attributes if specified
            ALLOW_DATA_ATTR: options?.allowDataAttributes ?? false,
        };

        // Apply custom allowed tags if provided
        if (options?.allowedTags) {
            config.ALLOWED_TAGS = options.allowedTags;
        }

        // Apply custom allowed attributes if provided
        if (options?.allowedAttributes) {
            config.ALLOWED_ATTR = options.allowedAttributes;
        }

        return this.DOMPurify.sanitize(dirty, config);
    }

    /**
     * Sanitize plain text by escaping HTML entities.
     *
     * Converts:
     * - < to &lt;
     * - > to &gt;
     * - & to &amp;
     * - " to &quot;
     * - ' to &#x27;
     *
     * @param text - Plain text that may contain HTML entities
     * @returns Escaped text safe for HTML rendering
     */
    sanitizePlainText(text: string): string {
        if (!text) {
            return '';
        }

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Recursively sanitize an object's string properties.
     *
     * Traverses the object and sanitizes all string values using sanitizeHtml.
     * Useful for sanitizing request bodies, JSONB data, etc.
     *
     * @param obj - Object to sanitize
     * @param maxDepth - Maximum recursion depth (default: 10)
     * @returns Sanitized object
     */
    sanitizeObject<T>(obj: T, maxDepth = 10): T {
        if (maxDepth === 0) {
            return obj;
        }

        if (typeof obj === 'string') {
            return this.sanitizeHtml(obj) as T;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.sanitizeObject(item, maxDepth - 1)) as T;
        }

        if (obj !== null && typeof obj === 'object') {
            const sanitized: any = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = this.sanitizeObject(value, maxDepth - 1);
            }
            return sanitized as T;
        }

        return obj;
    }

    /**
     * Sanitize a string for use in SQL LIKE queries.
     *
     * Escapes special characters: %, _, \
     *
     * @param input - User input for LIKE query
     * @returns Escaped input safe for LIKE queries
     */
    sanitizeForLike(input: string): string {
        if (!input) {
            return '';
        }

        return input.replace(/[%_\\]/g, '\\$&');
    }
}
