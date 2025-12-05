import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { TillyLogger } from '../logger/tilly.logger';

/**
 * Service for handling Bull queue errors and failures.
 *
 * Registers event listeners on queues to handle:
 * - Failed jobs
 * - Stalled jobs
 * - Queue errors
 * - Job completion (for monitoring)
 *
 * Provides centralized error logging and monitoring for all background jobs.
 */
@Injectable()
export class QueueErrorHandlerService implements OnModuleInit {
    private readonly logger = new TillyLogger('QueueErrorHandler');

    constructor(
        @InjectQueue('automations') private automationsQueue: Queue,
        @InjectQueue('notifications') private notificationsQueue: Queue,
        @InjectQueue('emails') private emailsQueue?: Queue
    ) {}

    onModuleInit() {
        // Register error handlers for all queues
        this.registerQueueHandlers(this.automationsQueue, 'automations');
        this.registerQueueHandlers(this.notificationsQueue, 'notifications');

        if (this.emailsQueue) {
            this.registerQueueHandlers(this.emailsQueue, 'emails');
        }

        this.logger.log('Queue error handlers registered');
    }

    /**
     * Register error event handlers for a Bull queue
     */
    private registerQueueHandlers(queue: Queue, queueName: string) {
        // Handle failed jobs
        queue.on('failed', (job: Job, err: Error) => {
            this.handleFailedJob(queueName, job, err);
        });

        // Handle stalled jobs (jobs that stopped processing without completing)
        queue.on('stalled', (job: Job) => {
            this.handleStalledJob(queueName, job);
        });

        // Handle queue-level errors
        queue.on('error', (error: Error) => {
            this.handleQueueError(queueName, error);
        });

        // Handle completed jobs (for monitoring/metrics)
        queue.on('completed', (job: Job) => {
            this.handleCompletedJob(queueName, job);
        });

        // Handle jobs being retried
        queue.on('retrying', (job: Job, err: Error) => {
            this.handleRetryingJob(queueName, job, err);
        });
    }

    /**
     * Handle failed jobs that exhausted all retry attempts
     */
    private handleFailedJob(queueName: string, job: Job, err: Error) {
        this.logger.error(
            `[${queueName}] Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts: ${err.message}`,
            err.stack,
            queueName
        );

        // Critical Alert: Job Failed
        this.logger.error(
            `[ALERT][${queueName}] Job failure: ${job.id}`,
            {
                jobId: job.id,
                jobName: job.name,
                attempts: job.attemptsMade,
                error: err.message,
                stack: err.stack,
                data: job.data,
            }
        );
    }

    /**
     * Handle stalled jobs (e.g., worker crashed, process killed)
     */
    private handleStalledJob(queueName: string, job: Job) {
        this.logger.warn(
            `[${queueName}] Job ${job.id} (${job.name}) stalled - worker may have crashed. Processed on: ${job.processedOn}`,
            queueName
        );

        // Stalled jobs are automatically retried by Bull
        // But we log them for monitoring worker health
    }

    /**
     * Handle queue-level errors (Redis connection, etc.)
     */
    private handleQueueError(queueName: string, error: Error) {
        this.logger.error(
            `[${queueName}] Queue error occurred: ${error.message}`,
            error.stack,
            queueName
        );

        // Critical Alert: Queue Infrastructure Error
        this.logger.error(
            `[CRITICAL][${queueName}] Infrastructure error: ${error.message}`,
            {
                error: error.message,
                stack: error.stack,
            }
        );
    }

    /**
     * Handle successfully completed jobs
     */
    private handleCompletedJob(queueName: string, job: Job) {
        const duration = job.finishedOn ? job.finishedOn - job.processedOn : 0;
        this.logger.debug(
            `[${queueName}] Job ${job.id} (${job.name}) completed successfully in ${duration}ms`,
            queueName
        );

        // Metrics: Job Completion
        this.logger.log(
            `[METRIC][${queueName}] Job completed`,
            {
                jobId: job.id,
                jobName: job.name,
                duration,
                attempts: job.attemptsMade,
            }
        );
    }

    /**
     * Handle jobs being retried after failure
     */
    private handleRetryingJob(queueName: string, job: Job, err: Error) {
        this.logger.warn(
            `[${queueName}] Job ${job.id} (${job.name}) retrying (attempt ${job.attemptsMade + 1}): ${err.message}`,
            queueName
        );
    }

    /**
     * Get queue statistics for monitoring
     */
    async getQueueStats(queueName: string): Promise<any> {
        const queue = this.getQueue(queueName);
        if (!queue) {
            return null;
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
        ]);

        return {
            queueName,
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + completed + failed + delayed,
        };
    }

    /**
     * Get queue instance by name
     */
    private getQueue(queueName: string): Queue | null {
        switch (queueName) {
            case 'automations':
                return this.automationsQueue;
            case 'notifications':
                return this.notificationsQueue;
            case 'emails':
                return this.emailsQueue || null;
            default:
                return null;
        }
    }
}
