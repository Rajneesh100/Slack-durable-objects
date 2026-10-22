/**
 * Cloudflare Worker Gateway: Pure Functional Router & Proxy to Durable Objects.
 * Directly serves static frontend assets when deployed with Cloudflare Workers Assets.
 */

import { RoomDO } from "./objects/RoomDO";
import { UserDO } from "./objects/UserDO";

export { RoomDO, UserDO };

export interface Env {
  readonly USERS: DurableObjectNamespace;
  readonly ROOMS: DurableObjectNamespace;
  readonly ASSETS?: Fetcher;
}

// CORS headers helper (pure)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Forward all non-API routes directly to static assets (SPA UI)
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
    }

    try {
      // 1. Auth & Channel Registry Routes (Forwarded to singleton UserDO)
      if (
        url.pathname.startsWith("/api/auth/") ||
        url.pathname.startsWith("/api/channels/create") ||
        url.pathname.startsWith("/api/channels/join-invite") ||
        url.pathname.startsWith("/api/channels/resolve-invite") ||
        url.pathname === "/api/me" ||
        url.pathname.startsWith("/api/activity")
      ) {
        // Singleton UserDO instance
        const userDoId = env.USERS.idFromName("global_user_registry");
        const userStub = env.USERS.get(userDoId);

        // Normalize internal path
        let internalPath = url.pathname.replace(/^\/api\/auth/, "");
        if (internalPath.startsWith("/api/")) {
          internalPath = internalPath.replace(/^\/api/, "");
        }
        if (!internalPath.startsWith("/")) {
          internalPath = "/" + internalPath;
        }

        const subUrl = new URL(request.url);
        subUrl.pathname = internalPath;

        const subRequest = new Request(subUrl.toString(), request);
        const response = await userStub.fetch(subRequest);

        // Inject CORS headers into response
        const newHeaders = new Headers(response.headers);
        for (const [k, v] of Object.entries(corsHeaders)) {
          newHeaders.set(k, v);
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // 2. Room Real-Time & Message Routes
      // Pattern: /api/channels/:roomId/ws or /api/channels/:roomId/messages
      const roomMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/(ws|messages)$/);
      if (roomMatch) {
        const roomId = roomMatch[1]!;
        const action = roomMatch[2]!;

        const roomDoId = env.ROOMS.idFromName(roomId);
        const roomStub = env.ROOMS.get(roomDoId);

        const subUrl = new URL(request.url);
        subUrl.pathname = `/rooms/${roomId}/${action}`;

        const subRequest = new Request(subUrl.toString(), request);
        const response = await roomStub.fetch(subRequest);

        // Don't modify 101 WebSocket responses
        if (response.status === 101) {
          return response;
        }

        const newHeaders = new Headers(response.headers);
        for (const [k, v] of Object.entries(corsHeaders)) {
          newHeaders.set(k, v);
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // Health check endpoint
      if (url.pathname === "/api/health") {
        return Response.json({ status: "healthy", timestamp: Date.now() }, { headers: corsHeaders });
      }

      // Fallback for non-API routes if reached
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response(JSON.stringify({ error: "Route not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gateway error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
