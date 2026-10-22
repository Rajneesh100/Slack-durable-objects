/**
 * Pure Domain Types for Functional Durable Objects Chat
 * All models are strictly immutable (Readonly).
 */

export type UserId = string;
export type RoomId = string;
export type MessageId = string;

export interface FileAttachment {
  readonly name: string;
  readonly type: string; // MIME type (e.g. image/png, application/pdf)
  readonly size: number; // in bytes
  readonly dataUrl: string; // Base64 data URI
}

export interface ChannelInfo {
  readonly id: RoomId;
  readonly name: string;
  readonly createdBy: UserId;
  readonly inviteCode: string;
  readonly createdAt: number;
}

export interface UserRecord {
  readonly id: UserId;
  readonly username: string;
  readonly passwordHash: string;
  readonly salt: string;
  readonly joinedChannels: readonly string[];
  readonly createdAt: number;
}

export interface UserSession {
  readonly userId: UserId;
  readonly username: string;
  readonly exp: number;
}

export interface ChatMessage {
  readonly id: MessageId;
  readonly roomId: RoomId;
  readonly senderId: UserId;
  readonly senderName: string;
  readonly content: string;
  readonly attachment?: FileAttachment;
  readonly reactions?: Readonly<Record<string, readonly UserId[]>>; // emoji -> array of userIds
  readonly parentId?: MessageId; // For Slack thread replies
  readonly replyCount?: number;  // Total thread replies for top-level message
  readonly lastReplyAt?: number; // Latest thread reply timestamp
  readonly createdAt: number;
}

export interface Participant {
  readonly userId: UserId;
  readonly username: string;
  readonly joinedAt: number;
  readonly lastActiveAt: number;
}

export interface RoomState {
  readonly roomId: RoomId;
  readonly name: string;
  readonly inviteCode: string;
  readonly participants: ReadonlyMap<UserId, Participant>;
  readonly typingUsers: ReadonlyMap<UserId, number>; // userId -> expiration timestamp
}

// Client to Server WebSocket Protocol
export type ClientMessage =
  | { readonly type: "JOIN"; readonly token: string }
  | { readonly type: "SEND_MESSAGE"; readonly content: string; readonly attachment?: FileAttachment; readonly parentId?: MessageId; readonly tempId?: string }
  | { readonly type: "TOGGLE_REACTION"; readonly messageId: MessageId; readonly emoji: string }
  | { readonly type: "TYPING"; readonly isTyping: boolean }
  | { readonly type: "PING" };

// Server to Client WebSocket Protocol
export type ServerMessage =
  | {
      readonly type: "ROOM_SNAPSHOT";
      readonly room: { readonly id: RoomId; readonly name: string; readonly inviteCode: string };
      readonly participants: readonly Participant[];
      readonly messages: readonly ChatMessage[];
    }
  | { readonly type: "NEW_MESSAGE"; readonly message: ChatMessage }
  | { readonly type: "REACTION_UPDATED"; readonly messageId: MessageId; readonly emoji: string; readonly userIds: readonly UserId[] }
  | { readonly type: "USER_JOINED"; readonly participant: Participant }
  | { readonly type: "USER_LEFT"; readonly userId: UserId }
  | { readonly type: "TYPING_INDICATOR"; readonly typingUsers: readonly string[] }
  | { readonly type: "ERROR"; readonly message: string }
  | { readonly type: "PONG" };

// Domain Events (Inputs to the Pure Reducer)
export type RoomDomainEvent =
  | { readonly type: "USER_CONNECTED"; readonly user: Participant }
  | { readonly type: "USER_DISCONNECTED"; readonly userId: UserId }
  | {
      readonly type: "POST_MESSAGE";
      readonly senderId: UserId;
      readonly content: string;
      readonly attachment?: FileAttachment;
      readonly messageId: MessageId;
      readonly parentId?: MessageId;
      readonly timestamp: number;
    }
  | {
      readonly type: "TOGGLE_REACTION";
      readonly userId: UserId;
      readonly messageId: MessageId;
      readonly emoji: string;
    }
  | { readonly type: "SET_TYPING"; readonly userId: UserId; readonly isTyping: boolean; readonly timestamp: number }
  | { readonly type: "PRUNE_TYPING"; readonly currentTimestamp: number };

// Side-effects (Outputs from Pure Reducer to be executed by the DO Shell)
export type RoomEffect =
  | { readonly type: "PERSIST_MESSAGE"; readonly message: ChatMessage }
  | { readonly type: "PERSIST_REACTION"; readonly messageId: MessageId; readonly userId: UserId; readonly emoji: string }
  | { readonly type: "BROADCAST_ALL"; readonly message: ServerMessage }
  | { readonly type: "BROADCAST_OTHERS"; readonly excludeUserId: UserId; readonly message: ServerMessage }
  | { readonly type: "SEND_DIRECT"; readonly userId: UserId; readonly message: ServerMessage };
