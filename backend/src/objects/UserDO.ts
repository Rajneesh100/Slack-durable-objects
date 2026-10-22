/**
 * UserDO: Imperative Shell for User Authentication, Profiles, and Channel Subscriptions.
 * Backed by Embedded SQLite (ctx.storage.sql).
 */

import { generateSalt, hashPassword, signSession, verifyPassword } from "../domain/auth-crypto";
import { generateInviteCode, isValidInviteCode, slugifyChannelName } from "../domain/invite";
import type { ChannelInfo, UserRecord } from "../domain/types";
import {
  type ChannelRow,
  type UserRow,
  mapChannelRowToInfo,
  mapUserRowToRecord,
  USER_SCHEMA_SQL,
} from "../storage/user-queries";

interface Env {
  ROOMS: DurableObjectNamespace;
  USERS: DurableObjectNamespace;
}

export class UserDO {
  private readonly state: DurableObjectState;
  private readonly env?: Env;
  private isInitialized = false;

  constructor(state: DurableObjectState, env?: Env) {
    this.state = state;
    this.env = env;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    // Run DDL migrations on embedded SQLite
    this.state.storage.sql.exec(USER_SCHEMA_SQL);

    // Seed default channels if not present
    const defaultChannels = [
      { id: "general", name: "general", createdBy: "system", inviteCode: "general" },
      { id: "random", name: "random", createdBy: "system", inviteCode: "random" },
    ];

    for (const ch of defaultChannels) {
      const existing = this.state.storage.sql
        .exec("SELECT id FROM channels WHERE id = ?", ch.id)
        .toArray();
      if (existing.length === 0) {
        this.state.storage.sql.exec(
          "INSERT INTO channels (id, name, created_by, invite_code, created_at) VALUES (?, ?, ?, ?, ?)",
          ch.id,
          ch.name,
          ch.createdBy,
          ch.inviteCode,
          Date.now()
        );
      }
    }

    // Migration for channel_activity columns
    try {
      this.state.storage.sql.exec("ALTER TABLE channel_activity ADD COLUMN message_id TEXT");
    } catch {}
    try {
      this.state.storage.sql.exec("ALTER TABLE channel_activity ADD COLUMN parent_id TEXT");
    } catch {}

    this.isInitialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/register") {
        if (request.method !== "POST") {
          return Response.json({ message: "Register endpoint requires a POST request with { username, password }" }, { status: 405 });
        }
        return await this.handleRegister(request);
      }
      if (path === "/login") {
        if (request.method !== "POST") {
          return Response.json({ message: "Login endpoint requires a POST request with { username, password }" }, { status: 405 });
        }
        return await this.handleLogin(request);
      }
      if (request.method === "GET" && path === "/me") {
        return await this.handleMe(url);
      }
      if (request.method === "POST" && path === "/channels/create") {
        return await this.handleCreateChannel(request);
      }
      if (request.method === "POST" && path === "/channels/join-invite") {
        return await this.handleJoinInvite(request);
      }
      if (request.method === "GET" && path === "/channels/resolve-invite") {
        return await this.handleResolveInvite(url);
      }
      if (request.method === "POST" && path === "/activity/record") {
        return await this.handleRecordActivity(request);
      }
      if (request.method === "GET" && path === "/activity/feed") {
        return await this.handleActivityFeed();
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal UserDO Error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async handleRegister(request: Request): Promise<Response> {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password;

    if (!username || username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return Response.json(
        { error: "Username must be 3-24 characters (alphanumeric, underscore, dash)" },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if username taken
    const existing = this.state.storage.sql
      .exec("SELECT id FROM users WHERE username = ?", username)
      .toArray();
    if (existing.length > 0) {
      return Response.json({ error: "Username already taken" }, { status: 409 });
    }

    const salt = generateSalt();
    const { hashHex } = await hashPassword(password, salt);
    const userId = "usr_" + crypto.randomUUID().slice(0, 12);
    const defaultJoined = JSON.stringify(["general", "random"]);
    const now = Date.now();

    this.state.storage.sql.exec(
      "INSERT INTO users (id, username, password_hash, salt, joined_channels_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      userId,
      username,
      hashHex,
      salt,
      defaultJoined,
      now
    );

    const sessionPayload = {
      userId,
      username,
      exp: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    const token = await signSession(sessionPayload);
    const channels = this.getChannelsByIds(["general", "random"]);

    return Response.json({
      token,
      user: {
        id: userId,
        username,
        joinedChannels: channels,
      },
    });
  }

  private async handleLogin(request: Request): Promise<Response> {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return Response.json({ error: "Username and password required" }, { status: 400 });
    }

    const rows = this.state.storage.sql
      .exec("SELECT * FROM users WHERE username = ?", username)
      .toArray() as unknown as UserRow[];

    if (rows.length === 0 || !rows[0]) {
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const userRow = rows[0];
    const isValid = await verifyPassword(password, userRow.password_hash, userRow.salt);
    if (!isValid) {
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const userRecord = mapUserRowToRecord(userRow);
    const sessionPayload = {
      userId: userRecord.id,
      username: userRecord.username,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const token = await signSession(sessionPayload);
    const channels = this.getChannelsByIds(userRecord.joinedChannels);

    return Response.json({
      token,
      user: {
        id: userRecord.id,
        username: userRecord.username,
        joinedChannels: channels,
      },
    });
  }

  private async handleMe(url: URL): Promise<Response> {
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "User ID required" }, { status: 400 });
    }

    const rows = this.state.storage.sql
      .exec("SELECT * FROM users WHERE id = ?", userId)
      .toArray() as unknown as UserRow[];

    if (rows.length === 0 || !rows[0]) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const record = mapUserRowToRecord(rows[0]);
    const channels = this.getChannelsByIds(record.joinedChannels);

    return Response.json({
      user: {
        id: record.id,
        username: record.username,
        joinedChannels: channels,
      },
    });
  }

  private async handleCreateChannel(request: Request): Promise<Response> {
    const body = (await request.json()) as { userId?: string; name?: string };
    const userId = body.userId;
    const rawName = body.name?.trim();

    if (!userId || !rawName) {
      return Response.json({ error: "userId and channel name required" }, { status: 400 });
    }

    const slug = slugifyChannelName(rawName);
    if (!slug || slug.length < 2) {
      return Response.json({ error: "Channel name must contain at least 2 valid characters" }, { status: 400 });
    }

    const roomId = `ch_${slug}_${crypto.randomUUID().slice(0, 6)}`;
    const inviteCode = generateInviteCode();
    const now = Date.now();

    this.state.storage.sql.exec(
      "INSERT INTO channels (id, name, created_by, invite_code, created_at) VALUES (?, ?, ?, ?, ?)",
      roomId,
      slug,
      userId,
      inviteCode,
      now
    );

    // Add to user's joined channels
    this.addChannelToUser(userId, roomId);

    // Register creator as owner in RoomDO
    if (this.env?.ROOMS) {
      try {
        const roomStub = this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId));
        await roomStub.fetch(`http://internal/rooms/${roomId}/add-member`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role: "owner" }),
        });
      } catch {}
    }

    const channelInfo: ChannelInfo = {
      id: roomId,
      name: slug,
      createdBy: userId,
      inviteCode,
      createdAt: now,
    };

    return Response.json({ channel: channelInfo });
  }

  private async handleJoinInvite(request: Request): Promise<Response> {
    const body = (await request.json()) as { userId?: string; inviteCode?: string };
    const userId = body.userId;
    const rawCode = body.inviteCode?.trim().toLowerCase();

    if (!userId || !rawCode || !isValidInviteCode(rawCode)) {
      return Response.json({ error: "Valid invite code and userId are required" }, { status: 400 });
    }

    const rows = this.state.storage.sql
      .exec("SELECT * FROM channels WHERE invite_code = ?", rawCode)
      .toArray() as unknown as ChannelRow[];

    if (rows.length === 0 || !rows[0]) {
      return Response.json({ error: "Invalid or expired invite code" }, { status: 404 });
    }

    const channel = mapChannelRowToInfo(rows[0]);
    this.addChannelToUser(userId, channel.id);

    // Register user as member in RoomDO
    if (this.env?.ROOMS) {
      try {
        const roomStub = this.env.ROOMS.get(this.env.ROOMS.idFromName(channel.id));
        await roomStub.fetch(`http://internal/rooms/${channel.id}/add-member`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role: "member" }),
        });
      } catch {}
    }

    return Response.json({ channel });
  }

  private async handleResolveInvite(url: URL): Promise<Response> {
    const code = url.searchParams.get("code")?.trim().toLowerCase();
    if (!code) {
      return Response.json({ error: "Code parameter missing" }, { status: 400 });
    }

    const rows = this.state.storage.sql
      .exec("SELECT * FROM channels WHERE invite_code = ?", code)
      .toArray() as unknown as ChannelRow[];

    if (rows.length === 0 || !rows[0]) {
      return Response.json({ error: "Invite code not found" }, { status: 404 });
    }

    return Response.json({ channel: mapChannelRowToInfo(rows[0]) });
  }

  private addChannelToUser(userId: string, roomId: string): void {
    const rows = this.state.storage.sql
      .exec("SELECT joined_channels_json FROM users WHERE id = ?", userId)
      .toArray() as unknown as { joined_channels_json: string }[];

    if (rows.length > 0 && rows[0]) {
      const channels = new Set<string>(JSON.parse(rows[0].joined_channels_json) as string[]);
      channels.add(roomId);
      this.state.storage.sql.exec(
        "UPDATE users SET joined_channels_json = ? WHERE id = ?",
        JSON.stringify(Array.from(channels)),
        userId
      );
    }
  }

  private async handleRecordActivity(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as {
        roomId?: string;
        messageId?: string;
        parentId?: string | null;
        senderName?: string;
        snippet?: string;
        timestamp?: number;
      };
      if (body.roomId) {
        this.state.storage.sql.exec(
          "INSERT OR REPLACE INTO channel_activity (room_id, last_message_at, last_sender, snippet, message_id, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
          body.roomId,
          body.timestamp || Date.now(),
          body.senderName || "Unknown",
          body.snippet || "",
          body.messageId || null,
          body.parentId || null
        );
      }
      return Response.json({ success: true });
    } catch {
      return Response.json({ success: false });
    }
  }

  private async handleActivityFeed(): Promise<Response> {
    try {
      const rows = this.state.storage.sql
        .exec("SELECT room_id, last_message_at, last_sender, snippet, message_id, parent_id FROM channel_activity")
        .toArray() as unknown as { room_id: string; last_message_at: number; last_sender: string; snippet: string; message_id: string | null; parent_id: string | null }[];

      const activities: Record<string, { lastMessageAt: number; lastSender: string; snippet: string; messageId?: string; parentId?: string }> = {};
      for (const r of rows) {
        activities[r.room_id] = {
          lastMessageAt: r.last_message_at,
          lastSender: r.last_sender,
          snippet: r.snippet,
          messageId: r.message_id || undefined,
          parentId: r.parent_id || undefined,
        };
      }
      return Response.json({ activities });
    } catch {
      return Response.json({ activities: {} });
    }
  }

  private getChannelsByIds(ids: readonly string[]): readonly ChannelInfo[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.state.storage.sql
      .exec(`SELECT * FROM channels WHERE id IN (${placeholders})`, ...ids)
      .toArray() as unknown as ChannelRow[];

    return rows.map(mapChannelRowToInfo);
  }
}
