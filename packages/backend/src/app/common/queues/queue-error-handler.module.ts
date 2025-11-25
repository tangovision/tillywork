import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueErrorHandlerService } from './queue-error-handler.service';

/**
 * Module for centralizing Bull queue error handling.
 *
 * Registers event listeners on all queues to handle:
 * - Failed jobs
 * - Stalled jobs
 * - Queue errors
 * - Job retries
 *
 * Import this module AFTER all queue modules to ensure
 * queues are registered before attaching event listeners.
 */
@Module({
    imports: [
        // Import queue tokens to inject into service
        BullModule.registerQueue(
            { name: 'automations' },
            { name: 'notifications' },
            { name: 'emails' }
        ),
    ],
    providers: [QueueErrorHandlerService],
    exports: [QueueErrorHandlerService],
})
export class QueueErrorHandlerModule {}
