import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { UseFilters } from "@nestjs/common";
import { Server } from "socket.io";
import { TillyLogger } from "../logger/tilly.logger";
import { WsExceptionFilter } from "../filters/ws-exception.filter";
import { Notification } from "./notification.entity";

@UseFilters(new WsExceptionFilter())
@WebSocketGateway({
    cors: {
        origin: process.env.TW_FRONTEND_URL || "http://localhost:4200",
        credentials: true,
    },
})
export class NotificationsGateway {
    @WebSocketServer()
    server: Server;
    private logger = new TillyLogger("NotificationsGateway");

    sendNotificationToUser(userId: number, notification: Notification) {
        this.server.to(String(userId)).emit("notification", notification);
    }
}
