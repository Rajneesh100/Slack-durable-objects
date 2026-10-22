/**
 * RoomDO: Imperative Shell for Real-time Channel Durable Object.
 * Uses WebSocket Hibernation API and Embedded SQLite.
 * Executes effects produced by pure `reduceRoom` state machine.
 */

import { verifySession } from "../domain/auth-crypto";
import { initialRoomState, reduceRoom } from "../domain/room-reducer";
import type {
  ChatMessage,
  ClientMessage,
  Participant,
  RoomDomainEvent,
  RoomEffect,
  RoomState,
  ServerMessage,
  UserSession,
} from "../domain/types";
import {
  type MessageRow,
  type ReactionRow,
  mapMessageRowToChatMessage,
  ROOM_SCHEMA_SQL,
} from "../storage/room-queries";

export class RoomDO {
  private readonly state: DurableObjectState;
  private roomState: RoomState | null = null;
  private isInitialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async ensureInitialized(roomId: string, name?: string, inviteCode?: string): Promise<void> {
    if (this.isInitialized && this.roomState) return;

    this.state.storage.sql.exec(ROOM_SCHEMA_SQL);

    // Migration safe check: add attachment_json to messages if not present
    try {
      this.state.storage.sql.exec("ALTER TABLE messages ADD COLUMN attachment_json TEXT");
    } catch {
      // Column already exists, safe to ignore
    }

    // Retrieve or store room metadata
    const metaRows = this.state.storage.sql
      .exec("SELECT key, value FROM room_metadata")
      .toArray() as unknown as { key: string; value: string }[];

    const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));

    const roomName = name || metaMap.get("name") || roomId;
    const roomInvite = inviteCode || metaMap.get("inviteCode") || roomId;

    if (!metaMap.has("name")) {
      this.state.storage.sql.exec(
        "INSERT OR REPLACE INTO room_metadata (key, value) VALUES ('name', ?), ('inviteCode', ?)",
        roomName,
        roomInvite
      );
    }

    // Reconstruct in-memory state from connected hibernated sockets
    this.roomState = initialRoomState(roomId, roomName, roomInvite);

    // Check existing hibernated WebSockets to restore participants
    const activeSockets = this.state.getWebSockets();
    const restoredParticipants = new Map<string, Participant>();

    for (const ws of activeSockets) {
      const tags = this.state.getTags(ws);
      const userId = tags[0];
      const username = tags[1];
      if (userId && username) {
        restoredParticipants.set(userId, {
          userId,
          username,
          joinedAt: Date.now(),
          lastActiveAt: Date.now(),
        });
      }
    }

    if (restoredParticipants.size > 0) {
      this.roomState = {
        ...this.roomState,
        participants: restoredParticipants,
      };
    }

    this.isInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.pathname.split("/")[2] || "general";
    const name = url.searchParams.get("name") || undefined;
    const inviteCode = url.searchParams.get("inviteCode") || undefined;

    await this.ensureInitialized(roomId, name, inviteCode);

    // WebSocket Upgrade Handler
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // REST: Get Recent Messages
    if (request.method === "GET" && url.pathname.endsWith("/messages")) {
      const messages = this.getRecentMessages();
      return Response.json({ messages });
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Unauthorized: missing token", { status: 401 });
    }

    const session = await verifySession<UserSession>(token);
    if (!session || !session.userId || !session.username) {
      return new Response("Unauthorized: invalid or expired token", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Tag the WebSocket with userId and username for hibernation identification
    this.state.acceptWebSocket(server, [session.userId, session.username]);

    const participant: Participant = {
      userId: session.userId,
      username: session.username,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    // Transition state
    this.dispatch({
      type: "USER_CONNECTED",
      user: participant,
    });

    // Send initial snapshot directly to connecting client
    const recentMessages = this.getRecentMessages();
    const currentParticipants = this.roomState
      ? Array.from(this.roomState.participants.values())
      : [participant];

    const snapshot: ServerMessage = {
      type: "ROOM_SNAPSHOT",
      room: {
        id: this.roomState?.roomId || "general",
        name: this.roomState?.name || "general",
        inviteCode: this.roomState?.inviteCode || "general",
      },
      participants: currentParticipants,
      messages: recentMessages,
    };

    server.send(JSON.stringify(snapshot));

    return new Response(null, { status: 101, webSocket: client });
  }

  // WebSocket Hibernation Event Handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    const tags = this.state.getTags(ws);
    const userId = tags[0];
    if (!userId) return;

    try {
      const parsed = JSON.parse(message) as ClientMessage;

      switch (parsed.type) {
        case "SEND_MESSAGE": {
          this.dispatch({
            type: "POST_MESSAGE",
            senderId: userId,
            content: parsed.content,
            attachment: parsed.attachment,
            messageId: "msg_" + crypto.randomUUID().slice(0, 12),
            timestamp: Date.now(),
          });
          break;
        }

        case "TOGGLE_REACTION": {
          this.dispatch({
            type: "TOGGLE_REACTION",
            userId,
            messageId: parsed.messageId,
            emoji: parsed.emoji,
          });
          break;
        }

        case "TYPING": {
          this.dispatch({
            type: "SET_TYPING",
            userId,
            isTyping: parsed.isTyping,
            timestamp: Date.now(),
          });

          // Schedule alarm to prune typing if not already set
          const currentAlarm = await this.state.storage.getAlarm();
          if (currentAlarm === null) {
            await this.state.storage.setAlarm(Date.now() + 4500);
          }
          break;
        }
      }
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Malformed JSON message" }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.state.getTags(ws);
    const userId = tags[0];
    if (!userId) return;

    // Check if user has any other active connections in this room before announcing departure
    const userSockets = this.state.getWebSockets(userId);
    if (userSockets.length <= 1) {
      this.dispatch({
        type: "USER_DISCONNECTED",
        userId,
      });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    // Pure prune typing transition
    this.dispatch({
      type: "PRUNE_TYPING",
      currentTimestamp: Date.now(),
    });
  }

  /**
   * Pure Dispatcher: Passes event to pure roomReducer and executes resulting effects.
   */
  private dispatch(event: RoomDomainEvent): void {
    if (!this.roomState) return;

    const [nextState, effects] = reduceRoom(this.roomState, event);
    this.roomState = nextState;

    this.executeEffects(effects);
  }

  /**
   * Imperative Effect Interpreter
   */
  private executeEffects(effects: readonly RoomEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "PERSIST_MESSAGE": {
          this.state.storage.sql.exec(
            "INSERT INTO messages (id, room_id, sender_id, sender_name, content, attachment_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            effect.message.id,
            effect.message.roomId,
            effect.message.senderId,
            effect.message.senderName,
            effect.message.content,
            effect.message.attachment ? JSON.stringify(effect.message.attachment) : null,
            effect.message.createdAt
          );
          break;
        }

        case "PERSIST_REACTION": {
          const existing = this.state.storage.sql
            .exec(
              "SELECT * FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
              effect.messageId,
              effect.userId,
              effect.emoji
            )
            .toArray();

          if (existing.length > 0) {
            this.state.storage.sql.exec(
              "DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
              effect.messageId,
              effect.userId,
              effect.emoji
            );
          } else {
            this.state.storage.sql.exec(
              "INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
              effect.messageId,
              effect.userId,
              effect.emoji
            );
          }

          // Broadcast updated reactions for this message to everyone
          const allReactions = this.state.storage.sql
            .exec("SELECT user_id FROM reactions WHERE message_id = ? AND emoji = ?", effect.messageId, effect.emoji)
            .toArray() as { user_id: string }[];

          const userIds = allReactions.map((r) => r.user_id);

          const broadcastMsg: ServerMessage = {
            type: "REACTION_UPDATED",
            messageId: effect.messageId,
            emoji: effect.emoji,
            userIds,
          };

          this.executeEffects([{ type: "BROADCAST_ALL", message: broadcastMsg }]);
          break;
        }

        case "BROADCAST_ALL": {
          const payload = JSON.stringify(effect.message);
          for (const ws of this.state.getWebSockets()) {
            try {
              ws.send(payload);
            } catch {
              // Hibernated or dropped connection handled on next wake
            }
          }
          break;
        }

        case "BROADCAST_OTHERS": {
          const payload = JSON.stringify(effect.message);
          for (const ws of this.state.getWebSockets()) {
            const tags = this.state.getTags(ws);
            if (tags[0] !== effect.excludeUserId) {
              try {
                ws.send(payload);
              } catch {
                // Ignore dropped socket
              }
            }
          }
          break;
        }

        case "SEND_DIRECT": {
          const payload = JSON.stringify(effect.message);
          for (const ws of this.state.getWebSockets(effect.userId)) {
            try {
              ws.send(payload);
            } catch {
              // Ignore dropped socket
            }
          }
          break;
        }
      }
    }
  }

  private getRecentMessages(limit = 100): readonly ChatMessage[] {
    const rows = this.state.storage.sql
      .exec(
        "SELECT id, room_id, sender_id, sender_name, content, attachment_json, created_at FROM messages ORDER BY created_at ASC LIMIT ?",
        limit
      )
      .toArray() as unknown as MessageRow[];

    if (rows.length === 0) return [];

    const reactionRows = this.state.storage.sql
      .exec("SELECT message_id, user_id, emoji FROM reactions")
      .toArray() as unknown as ReactionRow[];

    const reactionsMap = new Map<string, Record<string, string[]>>();
    for (const r of reactionRows) {
      if (!reactionsMap.has(r.message_id)) {
        reactionsMap.set(r.message_id, {});
      }
      const record = reactionsMap.get(r.message_id)!;
      if (!record[r.emoji]) {
        record[r.emoji] = [];
      }
      record[r.emoji]!.push(r.user_id);
    }

    return rows.map((row) => mapMessageRowToChatMessage(row, reactionsMap.get(row.id)));
  }
}
