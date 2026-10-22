/**
 * Cloudflare Worker Gateway: Pure Functional Router & Proxy to Durable Objects.
 */

import { RoomDO } from "./objects/RoomDO";
import { UserDO } from "./objects/UserDO";

export { RoomDO, UserDO };

export interface Env {
  readonly USERS: DurableObjectNamespace;
  readonly ROOMS: DurableObjectNamespace;
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

    // If browser navigates directly to backend (port 8787), redirect to Vite UI (port 5173)
    if (request.method === "GET" && (request.headers.get("Accept")?.includes("text/html") || url.pathname === "/")) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Durable Chat API</title>
  <meta http-equiv="refresh" content="0; url=http://localhost:5173/">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0d19; color: #f1f0f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1b162c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; text-align: center; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    h2 { margin-top: 0; color: #8b5cf6; }
    p { color: #9f9ab3; font-size: 14px; line-height: 1.5; }
    a { display: inline-block; margin-top: 16px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚡ Durable Chat</h2>
    <p>The backend API is running on port 8787.</p>
    <p>Redirecting to the web interface at port 5173...</p>
    <a href="http://localhost:5173/">Open App (localhost:5173)</a>
  </div>
</body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    try {
      // 1. Auth & Channel Registry Routes (Forwarded to singleton UserDO)
      if (
        url.pathname.startsWith("/api/auth/") ||
        url.pathname.startsWith("/api/channels/create") ||
        url.pathname.startsWith("/api/channels/join-invite") ||
        url.pathname.startsWith("/api/channels/resolve-invite") ||
        url.pathname === "/api/me"
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

      // Browser visits to backend root -> redirect or link to UI (port 5173)
      if (request.headers.get("Accept")?.includes("text/html") || url.pathname === "/") {
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Durable Chat API</title>
  <meta http-equiv="refresh" content="0; url=http://localhost:5173/">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0d19; color: #f1f0f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1b162c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; text-align: center; max-width: 420px; }
    h2 { margin-top: 0; color: #8b5cf6; }
    a { display: inline-block; margin-top: 16px; background: #7c3aed; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚡ Durable Chat Backend</h2>
    <p>The backend API is running on port 8787.</p>
    <p>Redirecting to the Web UI at port 5173...</p>
    <a href="http://localhost:5173/">Open Web App (localhost:5173)</a>
  </div>
</body>
</html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html", ...corsHeaders },
        });
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
