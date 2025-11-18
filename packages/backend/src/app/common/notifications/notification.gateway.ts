import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from "@nestjs/websockets";
import { UseFilters } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { TillyLogger } from "../logger/tilly.logger";
import { WsExceptionFilter } from "../filters/ws-exception.filter";
import { Notification } from "./notification.entity";
import { SocketAuthService } from "../sockets/socket-auth.service";

@UseFilters(new WsExceptionFilter())
@WebSocketGateway({
    cors: {
        origin: process.env.TW_FRONTEND_URL || "http://localhost:4200",
        credentials: true,
    },
})
export class NotificationsGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    server: Server;
    private logger = new TillyLogger("NotificationsGateway");

    constructor(private readonly socketAuthService: SocketAuthService) {}

    async handleConnection(client: Socket) {
        const user = await this.socketAuthService.authenticateSocket(client);
        if (!user) {
            this.logger.warn(
                `Unauthenticated connection attempt (socket ${client.id})`
            );
            client.disconnect();
            return;
        }

        client.data.user = user;
        client.join(String(user.id));
        this.logger.log(`User connected: ${user.id} (socket ${client.id})`);
    }

    handleDisconnect(client: Socket) {
        const userId = client.data.user?.id;
        if (userId) {
            this.logger.log(
                `User disconnected: ${userId} (socket ${client.id})`
            );
        }
    }

    sendNotificationToUser(userId: number, notification: Notification) {
        this.server.to(String(userId)).emit("notification", notification);
    }
}
