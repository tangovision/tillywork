import { Module, Global } from '@nestjs/common';
import { SanitizationService } from './sanitization.service';

/**
 * Global module providing XSS sanitization services.
 *
 * Exports SanitizationService for use throughout the application.
 */
@Global()
@Module({
    providers: [SanitizationService],
    exports: [SanitizationService],
})
export class SanitizationModule {}
