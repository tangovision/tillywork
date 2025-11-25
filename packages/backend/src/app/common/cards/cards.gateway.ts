import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from "@nestjs/websockets";
import { UseFilters } from "@nestjs/common";
import { TillyLogger } from "../logger/tilly.logger";
import { WsExceptionFilter } from "../filters/ws-exception.filter";

import { ClsService } from "nestjs-cls";
import { YjsPersistenceService } from "../collaboration/yjs.persistence.service";
import { CardsService } from "./cards.service";
import { SocketAuthService } from "../sockets/socket-auth.service";

import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { Schema } from "prosemirror-model";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";

import { fromUint8Array, toUint8Array } from "js-base64";

import { JSONContent } from "@tiptap/core";
import { assertNotNullOrUndefined, editorSchema } from "@tillywork/shared";

@UseFilters(new WsExceptionFilter())
@WebSocketGateway({
    cors: {
        origin: process.env.TW_FRONTEND_URL || "http://localhost:4200",
        credentials: true,
    },
})
export class CardsGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    server: Server;

    private docs = new Map<string, Y.Doc>();
    private socketToRoom = new Map<string, string>();
    private awarenessStates = new Map<string, awarenessProtocol.Awareness>();
    private saveTimers = new Map<
        string,
        { timer: NodeJS.Timeout; latestContent: any }
    >();

    private readonly logger = new TillyLogger("CardsGateway");
    private readonly SAVE_DEBOUNCE_MS = 1000 * 2;

    constructor(
        private readonly yjsPersistenceService: YjsPersistenceService,
        private readonly cardsService: CardsService,
        private readonly clsService: ClsService,
        private readonly socketAuthService: SocketAuthService
    ) {
        // In production, TW_FRONTEND_URL must be set for security
        if (
            process.env.NODE_ENV === "production" &&
            !process.env.TW_FRONTEND_URL
        ) {
            throw new Error(
                "TW_FRONTEND_URL environment variable must be set in production for WebSocket security"
            );
        }
    }

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
        this.logger.log(`User connected: ${user.id} (socket ${client.id})`);
    }

    @SubscribeMessage("card:join")
    async onJoin(
        @MessageBody() data: { cardId: number },
        @ConnectedSocket() client: Socket
    ) {
        const room = `card:${data.cardId}`;

        // Verify user has access to the card before allowing them to join
        try {
            await this.cardsService.findOne(data.cardId);
        } catch (error) {
            this.logger.warn(
                `User ${client.data.user?.id} attempted to join card ${data.cardId} without authorization`
            );
            throw error;
        }

        client.join(room);

        let doc = this.docs.get(room);
        if (!doc) {
            doc = await this.yjsPersistenceService.loadDocument(room);
            if (!doc) {
                doc = new Y.Doc();
            }
            this.docs.set(room, doc);
        }

        let awareness = this.awarenessStates.get(room);
        if (!awareness) {
            awareness = new awarenessProtocol.Awareness(doc);
            this.awarenessStates.set(room, awareness);
        }

        awareness.setLocalState(null);
        client.on(
            "awareness:update",
            (data: { room: string; update: string }) => {
                if (data.room !== room) return;

                const update = toUint8Array(data.update);
                awarenessProtocol.applyAwarenessUpdate(
                    awareness,
                    update,
                    client.id
                );

                client.to(room).emit("awareness:update", {
                    room,
                    update: data.update,
                });
            }
        );

        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
            awareness,
            Array.from(awareness.getStates().keys())
        );
        client.emit("awareness:update", {
            room,
            update: fromUint8Array(awarenessUpdate),
        });

        const state = fromUint8Array(Y.encodeStateAsUpdate(doc));
        client.emit("card:sync", state);
    }

    @SubscribeMessage("card:leave")
    async onLeave(
        @MessageBody() data: { cardId: number },
        @ConnectedSocket() client: Socket
    ) {
        const { cardId } = data;
        const room = `card:${cardId}`;
        const awareness = this.awarenessStates.get(room);

        client.leave(`card:${cardId}`);
        this.socketToRoom.delete(client.id);

        if (awareness) {
            awareness.getStates().delete(Number(client.id));
            const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [
                Number(client.id),
            ]);

            this.server.to(room).emit("awareness:update", {
                room,
                update: fromUint8Array(update),
            });
        }
    }

    @SubscribeMessage("card:update")
    async onUpdate(
        @MessageBody() data: { cardId: string; update: string },
        @ConnectedSocket() client: Socket
    ) {
        const { cardId, update } = data;

        // Verify user still has access to the card
        try {
            await this.cardsService.findOne(+cardId);
        } catch (error) {
            this.logger.warn(
                `User ${client.data.user?.id} attempted to update card ${cardId} without authorization`
            );
            throw error;
        }

        const doc = this.docs.get(`card:${cardId}`);
        assertNotNullOrUndefined(doc, "doc");

        const updateUint8 = toUint8Array(update);

        Y.applyUpdate(doc, updateUint8);
        await this.yjsPersistenceService.saveDocument(`card:${cardId}`, doc);

        client.to(`card:${cardId}`).emit("card:update", {
            cardId,
            update,
        });

        const yXmlFragment = doc.getXmlFragment("prosemirror");
        const json = this.yXmlFragmentToJSON(yXmlFragment);

        this.clsService.enter();
        this.clsService.set("user", client.data.user);
        this.debounceSave(cardId, json);
    }

    async handleDisconnect(client: Socket) {
        const userId = client.data.user?.id;
        if (userId) {
            this.logger.log(
                `User disconnected: ${userId} (socket ${client.id})`
            );
        }

        const room = this.socketToRoom.get(client.id);
        if (!room) return;

        const awareness = this.awarenessStates.get(room);
        if (awareness) {
            awareness.getStates().delete(Number(client.id));

            const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [
                Number(client.id),
            ]);

            this.server.to(room).emit("awareness:update", {
                room,
                update: fromUint8Array(update),
            });
        }

        this.socketToRoom.delete(client.id);
    }

    private yXmlFragmentToJSON(yXmlFragment: Y.XmlFragment) {
        const schema = new Schema(editorSchema);
        const pmNode = yXmlFragmentToProseMirrorRootNode(yXmlFragment, schema);

        return pmNode.toJSON();
    }

    private debounceSave(cardId: string, jsonContent: JSONContent) {
        const existing = this.saveTimers.get(cardId);
        if (existing) {
            clearTimeout(existing.timer);
        }

        const timer = setTimeout(async () => {
            try {
                await this.cardsService.updateCardDescription(
                    +cardId,
                    jsonContent
                );
            } catch (err) {
                this.logger.error(`Failed to save card ${cardId}`, err);
            } finally {
                this.saveTimers.delete(cardId);
            }
        }, this.SAVE_DEBOUNCE_MS);

        this.saveTimers.set(cardId, { timer, latestContent: jsonContent });
    }
}
