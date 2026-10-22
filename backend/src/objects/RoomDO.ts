/**
 * RoomDO: Secure Imperative Shell for Real-time Channel Durable Object.
 * Features:
 * - Enterprise AES-256-GCM message encryption at rest in SQLite
 * - Strict Channel Membership Authorization (Zero-leakage private channels)
 * - WebSocket Hibernation & Reactive state machine
 */

import { verifySession } from "../domain/auth-crypto";
import { decryptWithAESGCM, deriveRoomKey, encryptWithAESGCM } from "../domain/crypto-vault";
import { initialRoomState, reduceRoom } from "../domain/room-reducer";
import type {
  ChatMessage,
  ClientMessage,
  FileAttachment,
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

interface Env {
  USERS: DurableObjectNamespace;
  ROOMS: DurableObjectNamespace;
}

export class RoomDO {
  private readonly state: DurableObjectState;
  private readonly env?: Env;
  private roomState: RoomState | null = null;
  private cryptoKey: CryptoKey | null = null;
  private messageCache = new Map<string, ChatMessage>();
  private isInitialized = false;

  constructor(state: DurableObjectState, env?: Env) {
    this.state = state;
    this.env = env;
  }

  private async ensureInitialized(roomId?: string, name?: string, inviteCode?: string): Promise<void> {
    if (this.isInitialized && this.roomState && this.cryptoKey) return;

    this.state.storage.sql.exec(ROOM_SCHEMA_SQL);

    // Run graceful column migrations if updating an existing database
    try {
      this.state.storage.sql.exec("ALTER TABLE messages ADD COLUMN iv TEXT");
    } catch {}
    try {
      this.state.storage.sql.exec("ALTER TABLE messages ADD COLUMN attachment_json TEXT");
    } catch {}
    try {
      this.state.storage.sql.exec("ALTER TABLE messages ADD COLUMN parent_id TEXT");
    } catch {}

    // Safe index creation after columns are guaranteed to exist
    try {
      this.state.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC)");
    } catch {}
    try {
      this.state.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id)");
    } catch {}
    try {
      this.state.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_messages_room_parent ON messages(room_id, parent_id, created_at ASC)");
    } catch {}
    try {
      this.state.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id)");
    } catch {}
    try {
      this.state.storage.sql.exec("CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id)");
    } catch {}

    // Retrieve or store room metadata
    const metaRows = this.state.storage.sql
      .exec("SELECT key, value FROM room_metadata")
      .toArray() as unknown as { key: string; value: string }[];

    const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));
    const effectiveRoomId = roomId || metaMap.get("roomId") || "general";
    const roomName = name || metaMap.get("name") || effectiveRoomId;
    const roomInvite = inviteCode || metaMap.get("inviteCode") || effectiveRoomId;

    if (!metaMap.has("roomId") || !metaMap.has("name")) {
      this.state.storage.sql.exec(
        "INSERT OR REPLACE INTO room_metadata (key, value) VALUES ('roomId', ?), ('name', ?), ('inviteCode', ?)",
        effectiveRoomId,
        roomName,
        roomInvite
      );
    }

    // Derive deterministic AES-256-GCM key for this room
    this.cryptoKey = await deriveRoomKey(effectiveRoomId);

    // Reconstruct in-memory state
    this.roomState = initialRoomState(effectiveRoomId, roomName, roomInvite);

    // Check existing hibernated WebSockets
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
    const parts = url.pathname.split("/");
    const roomId = parts[2] || "general";
    const action = parts[3] || "";
    const name = url.searchParams.get("name") || undefined;
    const inviteCode = url.searchParams.get("inviteCode") || undefined;

    await this.ensureInitialized(roomId, name, inviteCode);

    // Internal endpoint: Add an authorized member to this channel
    if (request.method === "POST" && action === "add-member") {
      const body = (await request.json()) as { userId?: string; role?: string };
      if (!body.userId) {
        return Response.json({ error: "userId required" }, { status: 400 });
      }

      this.state.storage.sql.exec(
        "INSERT OR REPLACE INTO room_members (user_id, role, joined_at) VALUES (?, ?, ?)",
        body.userId,
        body.role || "member",
        Date.now()
      );
      return Response.json({ success: true, roomId, userId: body.userId });
    }

    // WebSocket Upgrade Handler with Strict Authorization
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade(request, roomId);
    }

    // REST: Get Recent Messages or Thread Replies (Requires authorization)
    if (request.method === "GET" && action === "messages") {
      const token = url.searchParams.get("token");
      if (!token) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const session = await verifySession<UserSession>(token);
      if (!session || !(await this.isAuthorized(session.userId, roomId))) {
        return Response.json({ error: "Forbidden: Not a member of this channel" }, { status: 403 });
      }

      const parentId = url.searchParams.get("parentId") || undefined;
      const messageId = url.searchParams.get("messageId") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);

      // Look up specific message (and its thread if it is a reply)
      if (messageId) {
        const targetMsg = await this.getMessageById(messageId);
        if (!targetMsg) {
          return Response.json({ error: "Message not found" }, { status: 404 });
        }
        if (targetMsg.parentId) {
          const rootMessage = await this.getMessageById(targetMsg.parentId);
          const replies = await this.getRecentMessages({ parentId: targetMsg.parentId, limit: 100 });
          return Response.json({
            message: targetMsg,
            parentId: targetMsg.parentId,
            rootMessage,
            messages: replies,
          });
        }
        return Response.json({
          message: targetMsg,
          parentId: null,
          rootMessage: targetMsg,
          messages: [targetMsg],
        });
      }

      // Fetch thread replies plus the root message
      if (parentId) {
        const rootMessage = await this.getMessageById(parentId);
        const messages = await this.getRecentMessages({ parentId, limit });
        return Response.json({ messages, rootMessage });
      }

      const messages = await this.getRecentMessages({ limit });
      return Response.json({ messages });
    }

    return new Response("Not found", { status: 404 });
  }

  private async isAuthorized(userId: string, roomId: string): Promise<boolean> {
    // Default public channels are accessible to all registered users
    if (roomId === "general" || roomId === "random") {
      return true;
    }

    // Custom channels require explicit membership in SQLite table
    const rows = this.state.storage.sql
      .exec("SELECT user_id FROM room_members WHERE user_id = ?", userId)
      .toArray();

    if (rows.length > 0) return true;

    // Auto-healing fallback with UserDO registry
    if (this.env?.USERS) {
      try {
        const userStub = this.env.USERS.get(this.env.USERS.idFromName("global_user_registry"));
        const res = await userStub.fetch(`http://internal/me?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          const data = (await res.json()) as { user?: { joinedChannels?: { id: string }[] } };
          const hasChannel = data.user?.joinedChannels?.some((c) => c.id === roomId);
          if (hasChannel) {
            this.state.storage.sql.exec(
              "INSERT OR REPLACE INTO room_members (user_id, role, joined_at) VALUES (?, 'member', ?)",
              userId,
              Date.now()
            );
            return true;
          }
        }
      } catch {}
    }

    return false;
  }

  private async handleWebSocketUpgrade(request: Request, roomId: string): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized: missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = await verifySession<UserSession>(token);
    if (!session || !session.userId || !session.username) {
      return new Response(JSON.stringify({ error: "Unauthorized: invalid or expired session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Strict Authorization Check: User MUST be an approved member of this room
    if (!(await this.isAuthorized(session.userId, roomId))) {
      return new Response(
        JSON.stringify({
          error: "FORBIDDEN",
          message: "Access Denied: You are not an authorized member of this private channel. Please join via invite link.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server, [session.userId, session.username]);

    const participant: Participant = {
      userId: session.userId,
      username: session.username,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    this.dispatch({
      type: "USER_CONNECTED",
      user: participant,
    });

    // Send initial snapshot with top-level decrypted history and reply counts
    const recentMessages = await this.getRecentMessages();
    const currentParticipants = this.roomState
      ? Array.from(this.roomState.participants.values())
      : [participant];

    const snapshot: ServerMessage = {
      type: "ROOM_SNAPSHOT",
      room: {
        id: this.roomState?.roomId || roomId,
        name: this.roomState?.name || roomId,
        inviteCode: this.roomState?.inviteCode || roomId,
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

    // Wakeup Guarantee: Ensure state and AES-GCM crypto key are initialized even if waking directly from hibernation
    await this.ensureInitialized();

    try {
      const parsed = JSON.parse(message) as ClientMessage;

      switch (parsed.type) {
        case "SEND_MESSAGE": {
          let parentSenderId: string | undefined = undefined;
          let parentSenderName: string | undefined = undefined;
          if (parsed.parentId) {
            if (this.messageCache.has(parsed.parentId)) {
              const p = this.messageCache.get(parsed.parentId)!;
              parentSenderId = p.senderId;
              parentSenderName = p.senderName;
            } else {
              const rows = this.state.storage.sql
                .exec("SELECT sender_id, sender_name FROM messages WHERE id = ?", parsed.parentId)
                .toArray() as { sender_id: string; sender_name: string }[];
              if (rows.length > 0 && rows[0]) {
                parentSenderId = rows[0].sender_id;
                parentSenderName = rows[0].sender_name;
              }
            }
          }

          this.dispatch({
            type: "POST_MESSAGE",
            senderId: userId,
            content: parsed.content,
            attachment: parsed.attachment,
            messageId: parsed.tempId || ("msg_" + crypto.randomUUID().slice(0, 12)),
            parentId: parsed.parentId,
            parentSenderId,
            parentSenderName,
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

          const currentAlarm = await this.state.storage.getAlarm();
          if (currentAlarm === null) {
            await this.state.storage.setAlarm(Date.now() + 4500);
          }
          break;
        }

        case "PING": {
          ws.send(JSON.stringify({ type: "PONG" }));
          break;
        }
      }
    } catch {
      ws.send(JSON.stringify({ type: "ERROR", message: "Malformed JSON message" }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ensureInitialized();
    const tags = this.state.getTags(ws);
    const userId = tags[0];
    if (!userId) return;

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
    await this.ensureInitialized();
    this.dispatch({
      type: "PRUNE_TYPING",
      currentTimestamp: Date.now(),
    });
  }

  private dispatch(event: RoomDomainEvent): void {
    if (!this.roomState) return;

    const [nextState, effects] = reduceRoom(this.roomState, event);
    this.roomState = nextState;

    this.executeEffects(effects);
  }

  private async executeEffects(effects: readonly RoomEffect[]): Promise<void> {
    for (const effect of effects) {
      switch (effect.type) {
        case "PERSIST_MESSAGE": {
          // Encrypt message content with AES-256-GCM before writing to SQLite
          let ciphertext = effect.message.content;
          let ivHex: string | null = null;

          if (this.cryptoKey && effect.message.content.length > 0) {
            const encrypted = await encryptWithAESGCM(effect.message.content, this.cryptoKey);
            ciphertext = encrypted.ciphertextHex;
            ivHex = encrypted.ivHex;
          }

          let attachmentJson: string | null = null;
          if (effect.message.attachment) {
            const rawAttachment = JSON.stringify(effect.message.attachment);
            if (this.cryptoKey) {
              const encAtt = await encryptWithAESGCM(rawAttachment, this.cryptoKey);
              attachmentJson = JSON.stringify({
                encrypted: true,
                iv: encAtt.ivHex,
                data: encAtt.ciphertextHex,
              });
            } else {
              attachmentJson = rawAttachment;
            }
          }

          this.state.storage.sql.exec(
            "INSERT INTO messages (id, room_id, sender_id, sender_name, content, iv, attachment_json, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            effect.message.id,
            effect.message.roomId,
            effect.message.senderId,
            effect.message.senderName,
            ciphertext,
            ivHex,
            attachmentJson,
            effect.message.parentId || null,
            effect.message.createdAt
          );

          // Update in-memory message cache
          this.messageCache.set(effect.message.id, effect.message);

          // If this is a thread reply, increment replyCount of parent in cache
          if (effect.message.parentId && this.messageCache.has(effect.message.parentId)) {
            const parent = this.messageCache.get(effect.message.parentId)!;
            this.messageCache.set(effect.message.parentId, {
              ...parent,
              replyCount: (parent.replyCount || 0) + 1,
              lastReplyAt: effect.message.createdAt,
            });
          }

          // Broadcast channel activity to global UserDO for cross-channel unread highlights
          if (this.env?.USERS) {
            try {
              const userStub = this.env.USERS.get(this.env.USERS.idFromName("global_user_registry"));
              userStub
                .fetch("http://internal/activity/record", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    roomId: effect.message.roomId,
                    messageId: effect.message.id,
                    parentId: effect.message.parentId || null,
                    senderName: effect.message.senderName,
                    snippet: effect.message.content.slice(0, 100),
                    timestamp: effect.message.createdAt,
                  }),
                })
                .catch(() => {});
            } catch {}
          }
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

          const isAdded = existing.length === 0;
          if (isAdded) {
            this.state.storage.sql.exec(
              "INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
              effect.messageId,
              effect.userId,
              effect.emoji
            );
          } else {
            this.state.storage.sql.exec(
              "DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
              effect.messageId,
              effect.userId,
              effect.emoji
            );
          }

          const allReactions = this.state.storage.sql
            .exec("SELECT user_id FROM reactions WHERE message_id = ? AND emoji = ?", effect.messageId, effect.emoji)
            .toArray() as { user_id: string }[];

          const userIds = allReactions.map((r) => r.user_id);

          // Find target message sender and snippet
          let targetSenderId: string | undefined;
          let targetSenderName: string | undefined;
          let targetSnippet: string | undefined;
          if (this.messageCache.has(effect.messageId)) {
            const cached = this.messageCache.get(effect.messageId)!;
            targetSenderId = cached.senderId;
            targetSenderName = cached.senderName;
            targetSnippet = cached.content;
            const updatedReactions = { ...(cached.reactions || {}) };
            if (userIds.length > 0) {
              updatedReactions[effect.emoji] = userIds;
            } else {
              delete updatedReactions[effect.emoji];
            }
            this.messageCache.set(effect.messageId, { ...cached, reactions: updatedReactions });
          } else {
            const rows = this.state.storage.sql
              .exec("SELECT sender_id, sender_name FROM messages WHERE id = ?", effect.messageId)
              .toArray() as { sender_id: string; sender_name: string }[];
            if (rows.length > 0 && rows[0]) {
              targetSenderId = rows[0].sender_id;
              targetSenderName = rows[0].sender_name;
            }
          }

          const broadcastMsg: ServerMessage = {
            type: "REACTION_UPDATED",
            messageId: effect.messageId,
            emoji: effect.emoji,
            userIds,
            actorId: effect.userId,
            action: isAdded ? "ADD" : "REMOVE",
            targetSenderId,
            targetSenderName,
            targetSnippet: targetSnippet ? targetSnippet.slice(0, 80) : undefined,
            roomId: this.roomState?.roomId || "",
          };

          this.executeEffects([{ type: "BROADCAST_ALL", message: broadcastMsg }]);
          break;
        }

        case "BROADCAST_ALL": {
          const payload = JSON.stringify(effect.message);
          for (const ws of this.state.getWebSockets()) {
            try {
              ws.send(payload);
            } catch {}
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
              } catch {}
            }
          }
          break;
        }

        case "SEND_DIRECT": {
          const payload = JSON.stringify(effect.message);
          for (const ws of this.state.getWebSockets(effect.userId)) {
            try {
              ws.send(payload);
            } catch {}
          }
          break;
        }
      }
    }
  }

  private async getMessageById(messageId: string): Promise<ChatMessage | null> {
    if (this.messageCache.has(messageId)) {
      return this.messageCache.get(messageId)!;
    }
    const rows = this.state.storage.sql
      .exec(
        "SELECT id, room_id, sender_id, sender_name, content, iv, attachment_json, parent_id, created_at FROM messages WHERE id = ?",
        messageId
      )
      .toArray() as unknown as MessageRow[];
    if (rows.length === 0) return null;

    const msgs = await this.decryptRows(rows, true);
    return msgs[0] || null;
  }

  private async decryptRows(rows: MessageRow[], isThread = false): Promise<readonly ChatMessage[]> {
    if (rows.length === 0) return [];

    // Fast aggregation for thread reply counts and timestamps (only needed for top-level messages)
    const replyStatsMap = new Map<string, { count: number; lastReplyAt: number }>();
    if (!isThread) {
      try {
        const replyStats = this.state.storage.sql
          .exec(
            "SELECT parent_id, COUNT(*) as reply_count, MAX(created_at) as last_reply_at FROM messages WHERE parent_id IS NOT NULL GROUP BY parent_id"
          )
          .toArray() as unknown as { parent_id: string; reply_count: number; last_reply_at: number }[];

        for (const r of replyStats) {
          replyStatsMap.set(r.parent_id, { count: r.reply_count, lastReplyAt: r.last_reply_at });
        }
      } catch {}
    }

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

    // Decrypt messages with AES-GCM (with in-memory cache for speed)
    const decryptedMessages: ChatMessage[] = [];
    for (const row of rows) {
      const stats = replyStatsMap.get(row.id);

      // Check cache first to avoid re-decryption latency
      if (this.messageCache.has(row.id)) {
        const cached = this.messageCache.get(row.id)!;
        const updated = {
          ...cached,
          reactions: reactionsMap.get(row.id) || cached.reactions,
          replyCount: stats?.count || cached.replyCount || 0,
          lastReplyAt: stats?.lastReplyAt || cached.lastReplyAt,
        };
        this.messageCache.set(row.id, updated);
        decryptedMessages.push(updated);
        continue;
      }

      let content = row.content;
      if (row.iv && this.cryptoKey) {
        content = await decryptWithAESGCM(row.content, row.iv, this.cryptoKey);
      }

      let attachment: FileAttachment | undefined;
      if (row.attachment_json) {
        try {
          const parsed = JSON.parse(row.attachment_json);
          if (parsed && parsed.encrypted && parsed.iv && parsed.data && this.cryptoKey) {
            const decryptedJson = await decryptWithAESGCM(parsed.data, parsed.iv, this.cryptoKey);
            attachment = JSON.parse(decryptedJson) as FileAttachment;
          } else {
            attachment = parsed as FileAttachment;
          }
        } catch {
          attachment = undefined;
        }
      }

      const chatMessage: ChatMessage = {
        id: row.id,
        roomId: row.room_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        content,
        attachment,
        reactions: reactionsMap.get(row.id),
        parentId: row.parent_id || undefined,
        replyCount: stats?.count || 0,
        lastReplyAt: stats?.lastReplyAt,
        createdAt: row.created_at,
      };

      this.messageCache.set(row.id, chatMessage);
      decryptedMessages.push(chatMessage);
    }

    return decryptedMessages;
  }

  private async getRecentMessages(options?: { parentId?: string; limit?: number }): Promise<readonly ChatMessage[]> {
    const limit = options?.limit || 100;
    const parentId = options?.parentId;

    let rows: MessageRow[];
    if (parentId) {
      rows = this.state.storage.sql
        .exec(
          "SELECT id, room_id, sender_id, sender_name, content, iv, attachment_json, parent_id, created_at FROM messages WHERE parent_id = ? ORDER BY created_at ASC LIMIT ?",
          parentId,
          limit
        )
        .toArray() as unknown as MessageRow[];
    } else {
      rows = this.state.storage.sql
        .exec(
          "SELECT id, room_id, sender_id, sender_name, content, iv, attachment_json, parent_id, created_at FROM messages WHERE parent_id IS NULL ORDER BY created_at ASC LIMIT ?",
          limit
        )
        .toArray() as unknown as MessageRow[];
    }

    return this.decryptRows(rows, Boolean(parentId));
  }
}
