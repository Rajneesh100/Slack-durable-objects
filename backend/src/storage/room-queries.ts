/**
 * Pure functions and SQL definitions for RoomDO SQLite storage.
 * Enforces room membership tables, AES-GCM encrypted message columns, and reactions.
 */

import type { ChatMessage, FileAttachment } from "../domain/types";

export const ROOM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS room_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  iv TEXT,
  attachment_json TEXT,
  parent_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
`;

export interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  iv?: string | null;
  attachment_json?: string | null;
  parent_id?: string | null;
  created_at: number;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface RoomMemberRow {
  user_id: string;
  role: string;
  joined_at: number;
}

export const mapMessageRowToChatMessage = (
  row: MessageRow,
  decryptedContent: string,
  reactionsMap?: Record<string, string[]>,
  replyCount?: number,
  lastReplyAt?: number
): ChatMessage => {
  let attachment: FileAttachment | undefined;
  if (row.attachment_json) {
    try {
      attachment = JSON.parse(row.attachment_json) as FileAttachment;
    } catch {
      attachment = undefined;
    }
  }

  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: decryptedContent,
    attachment,
    reactions: reactionsMap,
    parentId: row.parent_id || undefined,
    replyCount,
    lastReplyAt,
    createdAt: row.created_at,
  };
};
