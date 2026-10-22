/**
 * Pure functions and SQL definitions for UserDO SQLite storage.
 */

import type { ChannelInfo, UserRecord } from "../domain/types";

export const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  joined_channels_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_activity (
  room_id TEXT PRIMARY KEY,
  last_message_at INTEGER NOT NULL,
  last_sender TEXT NOT NULL,
  snippet TEXT NOT NULL,
  message_id TEXT,
  parent_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_channels_invite ON channels(invite_code);
`;

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  joined_channels_json: string;
  created_at: number;
}

export interface ChannelRow {
  id: string;
  name: string;
  created_by: string;
  invite_code: string;
  created_at: number;
}

export const mapUserRowToRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  username: row.username,
  passwordHash: row.password_hash,
  salt: row.salt,
  joinedChannels: JSON.parse(row.joined_channels_json) as string[],
  createdAt: row.created_at,
});

export const mapChannelRowToInfo = (row: ChannelRow): ChannelInfo => ({
  id: row.id,
  name: row.name,
  createdBy: row.created_by,
  inviteCode: row.invite_code,
  createdAt: row.created_at,
});
