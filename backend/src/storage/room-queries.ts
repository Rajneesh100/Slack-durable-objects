/**
 * Pure functions and SQL definitions for RoomDO SQLite storage.
 */

import type { ChatMessage } from "../domain/types";

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
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
`;

export interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: number;
}

export const mapMessageRowToChatMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  roomId: row.room_id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  content: row.content,
  createdAt: row.created_at,
});
