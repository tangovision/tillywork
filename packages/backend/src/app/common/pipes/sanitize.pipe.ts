import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { SanitizationService } from '../sanitization/sanitization.service';

/**
 * Pipe that sanitizes incoming data to prevent XSS attacks.
 *
 * Applies DOMPurify sanitization to:
 * - String values
 * - Objects with string properties
 * - Arrays of strings or objects
 *
 * Usage:
 * @Body(SanitizePipe) body: CreateDto
 *
 * Or globally in main.ts:
 * app.useGlobalPipes(new SanitizePipe(sanitizationService));
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
    constructor(private readonly sanitizationService: SanitizationService) {}

    transform(value: any, metadata: ArgumentMetadata) {
        // Only sanitize body and query parameters
        if (metadata.type !== 'body' && metadata.type !== 'query') {
            return value;
        }

        // Don't sanitize if value is null/undefined
        if (value === null || value === undefined) {
            return value;
        }

        // Sanitize the value recursively
        return this.sanitizationService.sanitizeObject(value);
    }
}
