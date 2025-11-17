import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { TillyLogger } from '../logger/tilly.logger';

/**
 * Global WebSocket exception filter for Socket.IO connections.
 *
 * Catches and handles errors in WebSocket event handlers, providing:
 * - Consistent error responses to clients
 * - Detailed server-side logging
 * - Prevention of connection drops on errors
 *
 * Without this filter, WebSocket errors can cause:
 * - Silent failures (client never knows what went wrong)
 * - Connection drops
 * - Poor debugging experience
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
    private readonly logger = new TillyLogger('WsExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
        const client = host.switchToWs().getClient();
        const data = host.switchToWs().getData();

        let error: any = {
            status: 'error',
            message: 'Internal server error',
        };

        if (exception instanceof WsException) {
            // Handle NestJS WebSocket exceptions
            const exceptionData = exception.getError();

            if (typeof exceptionData === 'string') {
                error.message = exceptionData;
            } else if (typeof exceptionData === 'object') {
                error = { ...error, ...exceptionData };
            }

            this.logger.warn(
                `WebSocket exception: ${error.message}`,
                {
                    event: data?.event,
                    clientId: client.id,
                }
            );
        } else if (exception instanceof Error) {
            // Handle standard JavaScript errors
            error.message = exception.message;

            this.logger.error(
                `WebSocket error: ${exception.message}`,
                exception.stack,
                {
                    event: data?.event,
                    clientId: client.id,
                }
            );
        } else {
            // Handle unknown exceptions
            this.logger.error(
                'Unknown WebSocket exception',
                String(exception),
                {
                    event: data?.event,
                    clientId: client.id,
                }
            );
        }

        // Send error to client
        client.emit('error', error);

        // Don't disconnect the client - let them handle the error
        // For critical errors, the gateway can explicitly disconnect
    }
}
