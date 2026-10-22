/**
 * Durable Chat Frontend Application
 * Built with Functional Programming principles:
 * - Immutable state container
 * - Pure render functions & deterministic avatar generators
 * - Resilient WebSocket synchronization
 */

interface ChannelInfo {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly inviteCode: string;
  readonly createdAt: number;
}

interface Participant {
  readonly userId: string;
  readonly username: string;
  readonly joinedAt: number;
  readonly lastActiveAt: number;
}

interface ChatMessage {
  readonly id: string;
  readonly roomId: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly content: string;
  readonly createdAt: number;
}

interface AppState {
  readonly user: { readonly id: string; readonly username: string } | null;
  readonly token: string | null;
  readonly activeChannelId: string;
  readonly channels: readonly ChannelInfo[];
  readonly messages: readonly ChatMessage[];
  readonly participants: readonly Participant[];
  readonly typingUsers: readonly string[];
  readonly activeModal: "none" | "create_channel" | "join_invite";
  readonly authMode: "login" | "register";
  readonly authError: string | null;
  readonly modalError: string | null;
  readonly isConnecting: boolean;
  readonly copiedInvite: boolean;
}

// Deterministic vibrant avatar gradients based on username
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)",
  "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)",
  "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
  "linear-gradient(135deg, #ec4899 0%, #f472b6 100%)",
  "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
];

const getAvatarGradient = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index]!;
};

const getInitials = (name: string): string => {
  return name.slice(0, 2).toUpperCase();
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Pure storage helpers
const loadPersistedAuth = (): { token: string | null; user: { id: string; username: string } | null } => {
  try {
    const token = localStorage.getItem("dc_token");
    const userJson = localStorage.getItem("dc_user");
    return {
      token: token || null,
      user: userJson ? JSON.parse(userJson) : null,
    };
  } catch {
    return { token: null, user: null };
  }
};

const savePersistedAuth = (token: string, user: { id: string; username: string }): void => {
  localStorage.setItem("dc_token", token);
  localStorage.setItem("dc_user", JSON.stringify(user));
};

const clearPersistedAuth = (): void => {
  localStorage.removeItem("dc_token");
  localStorage.removeItem("dc_user");
};

// Initial application state
const initialAuth = loadPersistedAuth();

let state: AppState = {
  user: initialAuth.user,
  token: initialAuth.token,
  activeChannelId: "general",
  channels: [
    { id: "general", name: "general", createdBy: "system", inviteCode: "general", createdAt: 0 },
    { id: "random", name: "random", createdBy: "system", inviteCode: "random", createdAt: 0 },
  ],
  messages: [],
  participants: [],
  typingUsers: [],
  activeModal: "none",
  authMode: "login",
  authError: null,
  modalError: null,
  isConnecting: false,
  copiedInvite: false,
};

// WebSocket connection reference
let activeSocket: WebSocket | null = null;
let typingDebounceTimer: number | null = null;
let lastTypingSent = 0;

// Update State & Re-render
const updateState = (updater: (prev: AppState) => AppState): void => {
  state = updater(state);
  renderApp();
};

// ==========================================================================
// WebSocket Connection Management
// ==========================================================================

const connectWebSocket = (channelId: string, token: string): void => {
  if (activeSocket) {
    activeSocket.onclose = null;
    activeSocket.close();
    activeSocket = null;
  }

  updateState((s) => ({ ...s, isConnecting: true, messages: [], participants: [], typingUsers: [] }));

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/channels/${channelId}/ws?token=${encodeURIComponent(token)}`;

  const ws = new WebSocket(wsUrl);
  activeSocket = ws;

  ws.onopen = () => {
    updateState((s) => ({ ...s, isConnecting: false }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "ROOM_SNAPSHOT": {
          updateState((s) => ({
            ...s,
            messages: data.messages || [],
            participants: data.participants || [],
          }));
          scrollChatToBottom();
          break;
        }

        case "NEW_MESSAGE": {
          updateState((s) => ({
            ...s,
            messages: [...s.messages, data.message],
          }));
          scrollChatToBottom();
          break;
        }

        case "USER_JOINED": {
          updateState((s) => {
            const exists = s.participants.some((p) => p.userId === data.participant.userId);
            return exists ? s : { ...s, participants: [...s.participants, data.participant] };
          });
          break;
        }

        case "USER_LEFT": {
          updateState((s) => ({
            ...s,
            participants: s.participants.filter((p) => p.userId !== data.userId),
          }));
          break;
        }

        case "TYPING_INDICATOR": {
          updateState((s) => ({
            ...s,
            typingUsers: data.typingUsers || [],
          }));
          break;
        }
      }
    } catch (e) {
      console.error("WS Parse error", e);
    }
  };

  ws.onclose = () => {
    updateState((s) => ({ ...s, isConnecting: false }));
  };

  ws.onerror = (e) => {
    console.error("WebSocket error:", e);
    updateState((s) => ({ ...s, isConnecting: false }));
  };
};

const sendChatMessage = (content: string): void => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
  const trimmed = content.trim();
  if (trimmed.length === 0) return;

  activeSocket.send(
    JSON.stringify({
      type: "SEND_MESSAGE",
      content: trimmed,
    })
  );

  // Send typing finished
  sendTypingSignal(false);
};

const sendTypingSignal = (isTyping: boolean): void => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;

  const now = Date.now();
  if (isTyping && now - lastTypingSent < 2000) return; // Throttled

  lastTypingSent = now;
  activeSocket.send(
    JSON.stringify({
      type: "TYPING",
      isTyping,
    })
  );
};

const scrollChatToBottom = (): void => {
  requestAnimationFrame(() => {
    const container = document.getElementById("messages-stream");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

// ==========================================================================
// API Handlers (Functional async transitions)
// ==========================================================================

const fetchUserProfile = async (userId: string): Promise<void> => {
  try {
    const res = await fetch(`/api/me?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.user?.joinedChannels) {
        updateState((s) => ({
          ...s,
          channels: data.user.joinedChannels,
        }));
      }
    }
  } catch (err) {
    console.warn("Could not refresh user channels", err);
  }
};

const handleAuthSubmit = async (e: Event): Promise<void> => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const username = (form.elements.namedItem("username") as HTMLInputElement).value.trim();
  const password = (form.elements.namedItem("password") as HTMLInputElement).value;

  updateState((s) => ({ ...s, authError: null }));

  const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      updateState((s) => ({ ...s, authError: data.error || "Authentication failed" }));
      return;
    }

    savePersistedAuth(data.token, { id: data.user.id, username: data.user.username });

    updateState((s) => ({
      ...s,
      token: data.token,
      user: { id: data.user.id, username: data.user.username },
      channels: data.user.joinedChannels || s.channels,
      authError: null,
    }));

    // Check for pending invite in hash
    checkHashRoute();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    updateState((s) => ({ ...s, authError: message }));
  }
};

const handleCreateChannelSubmit = async (e: Event): Promise<void> => {
  e.preventDefault();
  if (!state.user || !state.token) return;

  const form = e.target as HTMLFormElement;
  const nameInput = form.elements.namedItem("channelName") as HTMLInputElement;
  const name = nameInput.value.trim();

  updateState((s) => ({ ...s, modalError: null }));

  try {
    const res = await fetch("/api/channels/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ userId: state.user.id, name }),
    });

    const data = await res.json();
    if (!res.ok) {
      updateState((s) => ({ ...s, modalError: data.error || "Failed to create channel" }));
      return;
    }

    const newChannel: ChannelInfo = data.channel;
    updateState((s) => ({
      ...s,
      channels: [...s.channels, newChannel],
      activeChannelId: newChannel.id,
      activeModal: "none",
      modalError: null,
    }));

    window.location.hash = `channel=${newChannel.id}`;
    if (state.token) {
      connectWebSocket(newChannel.id, state.token);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create channel";
    updateState((s) => ({ ...s, modalError: message }));
  }
};

const handleJoinInviteSubmit = async (e: Event): Promise<void> => {
  e.preventDefault();
  if (!state.user || !state.token) return;

  const form = e.target as HTMLFormElement;
  const codeInput = form.elements.namedItem("inviteCode") as HTMLInputElement;
  const inviteCode = codeInput.value.trim();

  updateState((s) => ({ ...s, modalError: null }));

  try {
    const res = await fetch("/api/channels/join-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ userId: state.user.id, inviteCode }),
    });

    const data = await res.json();
    if (!res.ok) {
      updateState((s) => ({ ...s, modalError: data.error || "Invalid invite code" }));
      return;
    }

    const channel: ChannelInfo = data.channel;
    const exists = state.channels.some((c) => c.id === channel.id);

    updateState((s) => ({
      ...s,
      channels: exists ? s.channels : [...s.channels, channel],
      activeChannelId: channel.id,
      activeModal: "none",
      modalError: null,
    }));

    window.location.hash = `channel=${channel.id}`;
    if (state.token) {
      connectWebSocket(channel.id, state.token);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to join channel";
    updateState((s) => ({ ...s, modalError: message }));
  }
};

const joinInviteCodeDirectly = async (inviteCode: string): Promise<void> => {
  if (!state.user || !state.token) return;

  try {
    const res = await fetch("/api/channels/join-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ userId: state.user.id, inviteCode }),
    });

    if (res.ok) {
      const data = await res.json();
      const channel: ChannelInfo = data.channel;
      const exists = state.channels.some((c) => c.id === channel.id);

      updateState((s) => ({
        ...s,
        channels: exists ? s.channels : [...s.channels, channel],
        activeChannelId: channel.id,
      }));

      window.location.hash = `channel=${channel.id}`;
      connectWebSocket(channel.id, state.token);
    }
  } catch (err) {
    console.error("Direct invite join error:", err);
  }
};

const handleCopyInviteLink = async (): Promise<void> => {
  const currentChannel = state.channels.find((c) => c.id === state.activeChannelId);
  if (!currentChannel) return;

  const inviteUrl = `${window.location.origin}/#invite=${currentChannel.inviteCode}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    updateState((s) => ({ ...s, copiedInvite: true }));
    setTimeout(() => {
      updateState((s) => ({ ...s, copiedInvite: false }));
    }, 2500);
  } catch {
    prompt("Copy this invite link:", inviteUrl);
  }
};

const switchChannel = (channelId: string): void => {
  if (state.activeChannelId === channelId) return;

  window.location.hash = `channel=${channelId}`;
  updateState((s) => ({ ...s, activeChannelId: channelId }));

  if (state.token) {
    connectWebSocket(channelId, state.token);
  }
};

// Hash routing handler
const checkHashRoute = (): void => {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);

  const inviteCode = params.get("invite");
  if (inviteCode && state.user && state.token) {
    joinInviteCodeDirectly(inviteCode);
    return;
  }

  const channelId = params.get("channel");
  if (channelId) {
    updateState((s) => ({ ...s, activeChannelId: channelId }));
    if (state.token) {
      connectWebSocket(channelId, state.token);
    }
    return;
  }

  // Default to general channel
  if (state.token) {
    connectWebSocket(state.activeChannelId, state.token);
  }
};

// ==========================================================================
// Pure View Renderers (Functional UI)
// ==========================================================================

const renderAuthScreen = (): string => `
  <main class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
        </div>
        <div class="auth-logo-text">
          <h1>Durable Chat</h1>
          <p>Real-time Slack channels on Durable Objects</p>
        </div>
      </div>

      <div class="auth-tabs">
        <button type="button" id="tab-login" class="auth-tab-btn ${state.authMode === "login" ? "active" : ""}">Log In</button>
        <button type="button" id="tab-register" class="auth-tab-btn ${state.authMode === "register" ? "active" : ""}">Register</button>
      </div>

      ${
        state.authError
          ? `<div class="auth-error-banner" role="alert">
               <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
               <span>${state.authError}</span>
             </div>`
          : ""
      }

      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="form-label" for="username-input">Username</label>
          <input
            id="username-input"
            name="username"
            type="text"
            class="form-input"
            placeholder="e.g. alex_rivera"
            required
            autocomplete="username"
            minlength="3"
            maxlength="24"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="password-input">Password</label>
          <input
            id="password-input"
            name="password"
            type="password"
            class="form-input"
            placeholder="At least 6 characters"
            required
            autocomplete="current-password"
            minlength="6"
          />
        </div>

        <button type="submit" class="auth-submit-btn">
          <span>${state.authMode === "login" ? "Sign In to Workspace" : "Create Account"}</span>
          <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42L16.86 11H5v2z"/></svg>
        </button>
      </form>
    </div>
  </main>
`;

const renderMessage = (msg: ChatMessage): string => {
  const isMe = state.user?.id === msg.senderId;
  const avatarBg = getAvatarGradient(msg.senderName);
  const initials = getInitials(msg.senderName);

  return `
    <div class="message-item ${isMe ? "is-me" : ""}" id="msg-${msg.id}">
      <div class="avatar" style="background: ${avatarBg};">
        ${initials}
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">${msg.senderName}</span>
          <span class="message-timestamp">${formatTime(msg.createdAt)}</span>
        </div>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      </div>
    </div>
  `;
};

const renderSlackApp = (): string => {
  const currentChannel = state.channels.find((c) => c.id === state.activeChannelId) || {
    id: state.activeChannelId,
    name: state.activeChannelId,
    createdBy: "system",
    inviteCode: state.activeChannelId,
    createdAt: 0,
  };

  const userAvatarBg = state.user ? getAvatarGradient(state.user.username) : "var(--accent-primary)";
  const userInitials = state.user ? getInitials(state.user.username) : "U";

  const otherTypingUsers = state.typingUsers.filter((u) => u !== state.user?.username);

  return `
    <div class="slack-container">
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="workspace-title">
            <div class="workspace-logo-badge">#</div>
            <div class="workspace-info">
              <h2>Durable Rooms</h2>
              <span><span class="pulse-dot"></span> Online</span>
            </div>
          </div>
        </div>

        <div class="sidebar-content">
          <div>
            <div class="channel-section-header">
              <span>Channels</span>
              <button type="button" id="open-create-channel" class="section-action-btn" title="Create Channel">
                <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </button>
            </div>

            <nav class="channel-list" aria-label="Channels">
              ${state.channels
                .map(
                  (ch) => `
                <a
                  href="#channel=${ch.id}"
                  class="channel-item ${ch.id === state.activeChannelId ? "active" : ""}"
                  data-channel-id="${ch.id}"
                >
                  <span class="channel-hash">#</span>
                  <span class="channel-name">${escapeHtml(ch.name)}</span>
                </a>
              `
                )
                .join("")}
            </nav>
          </div>

          <div class="sidebar-actions">
            <button type="button" id="open-join-invite" class="quick-action-btn">
              <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
              <span>Join with Invite Code</span>
            </button>
          </div>
        </div>

        <footer class="sidebar-footer">
          <div class="user-profile-badge">
            <div class="avatar" style="background: ${userAvatarBg};">
              ${userInitials}
            </div>
            <div class="user-details">
              <span class="user-username">${escapeHtml(state.user?.username || "Guest")}</span>
              <span class="user-status-text">Active Now</span>
            </div>
          </div>
          <button type="button" id="logout-btn" class="logout-btn" title="Sign Out">
            <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          </button>
        </footer>
      </aside>

      <!-- Main Chat Area -->
      <section class="chat-pane">
        <!-- Channel Top Bar -->
        <header class="chat-header">
          <div class="channel-meta">
            <div class="channel-header-title">
              <h2># ${escapeHtml(currentChannel.name)}</h2>
              <span class="online-badge">
                <span class="pulse-dot"></span>
                ${state.participants.length} member${state.participants.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div class="chat-header-actions">
            <button
              type="button"
              id="share-invite-btn"
              class="share-invite-btn ${state.copiedInvite ? "copied" : ""}"
            >
              <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              <span>${state.copiedInvite ? "Invite Copied!" : "Copy Invite Link"}</span>
            </button>
          </div>
        </header>

        <!-- Messages Stream (Chronological) -->
        <div id="messages-stream" class="messages-container">
          ${
            state.messages.length === 0
              ? `
              <div class="empty-chat-welcome">
                <div class="empty-chat-icon">
                  <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
                </div>
                <h3>Welcome to #${escapeHtml(currentChannel.name)}!</h3>
                <p>This channel is powered by an isolated Cloudflare Durable Object with embedded SQLite. Start the conversation below!</p>
              </div>
            `
              : state.messages.map(renderMessage).join("")
          }
        </div>

        <!-- Typing Indicator -->
        <div class="typing-bar" id="typing-indicator">
          ${
            otherTypingUsers.length > 0
              ? `
              <div class="typing-dots">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
              <span>${escapeHtml(otherTypingUsers.join(", "))} ${otherTypingUsers.length === 1 ? "is" : "are"} typing...</span>
            `
              : ""
          }
        </div>

        <!-- Composer Box -->
        <div class="chat-composer-container">
          <form id="chat-form" class="composer-box">
            <textarea
              id="chat-input"
              class="composer-textarea"
              placeholder="Message #${escapeHtml(currentChannel.name)}"
              rows="1"
            ></textarea>
            <div class="composer-actions">
              <span class="composer-hint"><kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line</span>
              <button type="submit" id="send-msg-btn" class="send-btn" title="Send message">
                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>

    <!-- Modals -->
    ${renderModals()}
  `;
};

const renderModals = (): string => {
  if (state.activeModal === "none") return "";

  if (state.activeModal === "create_channel") {
    return `
      <div class="modal-overlay" id="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Create a new Channel</h3>
            <button type="button" class="modal-close-btn" id="modal-close">&times;</button>
          </div>
          ${
            state.modalError
              ? `<div class="auth-error-banner"><span>${state.modalError}</span></div>`
              : ""
          }
          <form id="create-channel-form" class="auth-form">
            <div class="form-group">
              <label class="form-label" for="channel-name-input">Channel Name</label>
              <input
                id="channel-name-input"
                name="channelName"
                type="text"
                class="form-input"
                placeholder="e.g. engineering, design-sync"
                required
                autocomplete="off"
                minlength="2"
                maxlength="32"
                autofocus
              />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
              <button type="submit" class="btn-primary">Create Channel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (state.activeModal === "join_invite") {
    return `
      <div class="modal-overlay" id="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Join Channel with Invite Code</h3>
            <button type="button" class="modal-close-btn" id="modal-close">&times;</button>
          </div>
          ${
            state.modalError
              ? `<div class="auth-error-banner"><span>${state.modalError}</span></div>`
              : ""
          }
          <form id="join-invite-form" class="auth-form">
            <div class="form-group">
              <label class="form-label" for="invite-code-input">Invite Code</label>
              <input
                id="invite-code-input"
                name="inviteCode"
                type="text"
                class="form-input"
                placeholder="e.g. k9x2m4"
                required
                autocomplete="off"
                autofocus
              />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
              <button type="submit" class="btn-primary">Join Channel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return "";
};

const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// ==========================================================================
// Event Binding & DOM Coordination
// ==========================================================================

const bindEvents = (): void => {
  // Auth Screen Events
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const authForm = document.getElementById("auth-form");

  if (tabLogin) {
    tabLogin.onclick = () => updateState((s) => ({ ...s, authMode: "login", authError: null }));
  }
  if (tabRegister) {
    tabRegister.onclick = () => updateState((s) => ({ ...s, authMode: "register", authError: null }));
  }
  if (authForm) {
    authForm.onsubmit = handleAuthSubmit;
  }

  // App Events
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearPersistedAuth();
      if (activeSocket) {
        activeSocket.close();
        activeSocket = null;
      }
      updateState((s) => ({
        ...s,
        user: null,
        token: null,
        messages: [],
        participants: [],
      }));
    };
  }

  // Channel Item Navigation
  const channelLinks = document.querySelectorAll<HTMLElement>(".channel-item");
  channelLinks.forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      const chId = link.getAttribute("data-channel-id");
      if (chId) switchChannel(chId);
    };
  });

  // Modal Openers
  const openCreateBtn = document.getElementById("open-create-channel");
  if (openCreateBtn) {
    openCreateBtn.onclick = () => updateState((s) => ({ ...s, activeModal: "create_channel", modalError: null }));
  }

  const openJoinBtn = document.getElementById("open-join-invite");
  if (openJoinBtn) {
    openJoinBtn.onclick = () => updateState((s) => ({ ...s, activeModal: "join_invite", modalError: null }));
  }

  // Modal Closers
  const modalClose = document.getElementById("modal-close");
  const modalCancel = document.getElementById("modal-cancel");
  const modalBackdrop = document.getElementById("modal-backdrop");

  const closeModal = () => updateState((s) => ({ ...s, activeModal: "none", modalError: null }));
  if (modalClose) modalClose.onclick = closeModal;
  if (modalCancel) modalCancel.onclick = closeModal;
  if (modalBackdrop) {
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) closeModal();
    };
  }

  // Modal Forms
  const createChannelForm = document.getElementById("create-channel-form");
  if (createChannelForm) createChannelForm.onsubmit = handleCreateChannelSubmit;

  const joinInviteForm = document.getElementById("join-invite-form");
  if (joinInviteForm) joinInviteForm.onsubmit = handleJoinInviteSubmit;

  // Share Invite Link
  const shareInviteBtn = document.getElementById("share-invite-btn");
  if (shareInviteBtn) shareInviteBtn.onclick = handleCopyInviteLink;

  // Chat Composer Input
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;

  if (chatForm && chatInput) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      sendChatMessage(chatInput.value);
      chatInput.value = "";
      chatInput.style.height = "auto";
    };

    chatInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event("submit"));
      }
    };

    chatInput.oninput = () => {
      // Auto-resize
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";

      // Typing notification
      sendTypingSignal(true);
      if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
      typingDebounceTimer = window.setTimeout(() => {
        sendTypingSignal(false);
      }, 3000);
    };
  }
};

const renderApp = (): void => {
  const appContainer = document.getElementById("app");
  if (!appContainer) return;

  if (!state.user || !state.token) {
    appContainer.innerHTML = renderAuthScreen();
  } else {
    appContainer.innerHTML = renderSlackApp();
  }

  bindEvents();
};

// ==========================================================================
// Initialization
// ==========================================================================

const init = async (): Promise<void> => {
  window.addEventListener("hashchange", checkHashRoute);

  renderApp();

  if (state.user && state.token) {
    await fetchUserProfile(state.user.id);
    checkHashRoute();
  }
};

init();
