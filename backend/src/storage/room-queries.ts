/**
 * Pure functions and SQL definitions for RoomDO SQLite storage.
 * Supports messages, file attachments, and message reactions.
 */

import type { ChatMessage, FileAttachment } from "../domain/types";

export const ROOM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS room_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);
`;

export interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  attachment_json?: string | null;
  created_at: number;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

export const mapMessageRowToChatMessage = (
  row: MessageRow,
  reactionsMap?: Record<string, string[]>
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
    content: row.content,
    attachment,
    reactions: reactionsMap,
    createdAt: row.created_at,
  };
};
