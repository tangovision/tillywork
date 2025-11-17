import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { TillyLogger } from '../logger/tilly.logger';

/**
 * Global exception filter that catches all HTTP exceptions and provides
 * consistent error responses while preventing information leakage.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new TillyLogger('HttpExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = 'Internal server error';
        let error = 'Internal Server Error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                message = (exceptionResponse as any).message || message;
                error = (exceptionResponse as any).error || error;
            }
        } else if (exception instanceof Error) {
            // Log the full error for debugging, but don't expose details to client
            this.logger.error(
                `Unhandled error: ${exception.message}`,
                exception.stack
            );
        } else {
            this.logger.error('Unknown exception type', String(exception));
        }

        // Log the exception with request context
        this.logger.error(
            `${request.method} ${request.url} - Status: ${status} - ${message}`,
            exception instanceof Error ? exception.stack : undefined
        );

        // Send standardized error response
        response.status(status).send({
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            error,
            message,
        });
    }
}
