/**
 * Durable Chat Frontend Application
 * Authentic Slack Experience:
 * - Real-time chronological messaging via Durable Objects
 * - Clickable links & auto-joining in-app invite links
 * - Rich file & image sharing
 * - Slack emoji reactions and picker popover
 * - Functional immutable state container
 */

interface FileAttachment {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly dataUrl: string;
}

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
  readonly attachment?: FileAttachment;
  readonly reactions?: Readonly<Record<string, readonly string[]>>; // emoji -> userIds
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
  readonly showEmojiPicker: boolean;
  readonly pendingAttachment: FileAttachment | null;
}

// Common Slack Emojis
const SLACK_EMOJIS = [
  "👍", "👎", "❤️", "🔥", "🚀", "😂", "🎉", "👀",
  "💯", "👏", "🙌", "😍", "🥳", "😎", "🤔", "💡",
  "✨", "⚡", "🤝", "🙏", "✅", "❌", "💬", "📌",
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😇",
  "🙃", "😉", "😌", "🥰", "😘", "😋", "😜", "🤩",
  "☕", "🍕", "🍔", "🍻", "💻", "📱", "🎯", "💎"
];

// Quick reaction bar emojis
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🚀", "👀"];

// Deterministic vibrant avatar gradients based on username
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #e01e5a 0%, #f43f5e 100%)",
  "linear-gradient(135deg, #4a154b 0%, #611f69 100%)",
  "linear-gradient(135deg, #2eb67d 0%, #10b981 100%)",
  "linear-gradient(135deg, #ecb22e 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #36c5f0 0%, #0ea5e9 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
];

const getAvatarGradient = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index]!;
};

const getInitials = (name: string): string => name.slice(0, 2).toUpperCase();

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// Initial State
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
  showEmojiPicker: false,
  pendingAttachment: null,
};

let activeSocket: WebSocket | null = null;
let typingDebounceTimer: number | null = null;
let lastTypingSent = 0;

// Update state and trigger re-render
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

        case "REACTION_UPDATED": {
          updateState((s) => {
            const nextMessages = s.messages.map((m) => {
              if (m.id !== data.messageId) return m;
              const currentReactions = { ...(m.reactions || {}) };
              if (data.userIds && data.userIds.length > 0) {
                currentReactions[data.emoji] = data.userIds;
              } else {
                delete currentReactions[data.emoji];
              }
              return { ...m, reactions: currentReactions };
            });
            return { ...s, messages: nextMessages };
          });
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
  if (trimmed.length === 0 && !state.pendingAttachment) return;

  activeSocket.send(
    JSON.stringify({
      type: "SEND_MESSAGE",
      content: trimmed,
      attachment: state.pendingAttachment || undefined,
    })
  );

  updateState((s) => ({ ...s, pendingAttachment: null, showEmojiPicker: false }));
  sendTypingSignal(false);
};

const toggleMessageReaction = (messageId: string, emoji: string): void => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;

  activeSocket.send(
    JSON.stringify({
      type: "TOGGLE_REACTION",
      messageId,
      emoji,
    })
  );
};

const sendTypingSignal = (isTyping: boolean): void => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (isTyping && now - lastTypingSent < 2000) return;

  lastTypingSent = now;
  activeSocket.send(JSON.stringify({ type: "TYPING", isTyping }));
};

const scrollChatToBottom = (): void => {
  requestAnimationFrame(() => {
    const container = document.getElementById("messages-stream");
    if (container) container.scrollTop = container.scrollHeight;
  });
};

// ==========================================================================
// Formatting & Link Parsing (Pure)
// ==========================================================================

const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatMessageText = (rawContent: string): string => {
  let safe = escapeHtml(rawContent);

  // Auto-link URLs
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  safe = safe.replace(urlRegex, (url) => {
    // Check if it's an invite link to this app
    const inviteMatch = url.match(/#invite=([a-zA-Z0-9_-]+)/);
    if (inviteMatch) {
      const code = inviteMatch[1];
      return `<a href="${url}" class="invite-badge-link" data-invite-code="${code}" title="Join Channel">🔑 Join Channel #${code}</a>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
  });

  // Basic Slack markdown
  // Inline code: `code`
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>');
  // Bold: *bold*
  safe = safe.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  // Italic: _italic_
  safe = safe.replace(/_([^_]+)_/g, "<em>$1</em>");

  return safe;
};

// ==========================================================================
// API Handlers
// ==========================================================================

const fetchUserProfile = async (userId: string): Promise<void> => {
  try {
    const res = await fetch(`/api/me?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.user?.joinedChannels) {
        updateState((s) => ({ ...s, channels: data.user.joinedChannels }));
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
    if (state.token) connectWebSocket(newChannel.id, state.token);
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
    if (state.token) connectWebSocket(channel.id, state.token);
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
  updateState((s) => ({ ...s, activeChannelId: channelId, showEmojiPicker: false }));

  if (state.token) connectWebSocket(channelId, state.token);
};

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
    if (state.token) connectWebSocket(channelId, state.token);
    return;
  }

  if (state.token) {
    connectWebSocket(state.activeChannelId, state.token);
  }
};

// ==========================================================================
// File Attachment Helpers
// ==========================================================================

const handleFileUpload = (file: File): void => {
  if (file.size > 8 * 1024 * 1024) {
    alert("File is too large. Maximum size is 8MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const attachment: FileAttachment = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
    };
    updateState((s) => ({ ...s, pendingAttachment: attachment }));
  };
  reader.readAsDataURL(file);
};

// ==========================================================================
// View Renderers
// ==========================================================================

const renderAuthScreen = (): string => `
  <main class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">#</div>
        <div class="auth-logo-text">
          <h1>Slack on Cloudflare</h1>
          <p>Real-time channels powered by Durable Objects</p>
        </div>
      </div>

      <div class="auth-tabs">
        <button type="button" id="tab-login" class="auth-tab-btn ${state.authMode === "login" ? "active" : ""}">Sign In</button>
        <button type="button" id="tab-register" class="auth-tab-btn ${state.authMode === "register" ? "active" : ""}">Create Account</button>
      </div>

      ${
        state.authError
          ? `<div class="auth-error-banner" role="alert"><span>${state.authError}</span></div>`
          : ""
      }

      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="form-label" for="username-input">User Name</label>
          <input
            id="username-input"
            name="username"
            type="text"
            class="form-input"
            placeholder="e.g. rajneesh"
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
          <span>${state.authMode === "login" ? "Sign In" : "Register"}</span>
        </button>
      </form>
    </div>
  </main>
`;

const renderAttachment = (att: FileAttachment): string => {
  const isImage = att.type.startsWith("image/");
  if (isImage) {
    return `
      <div class="chat-attachment">
        <a href="${att.dataUrl}" target="_blank" rel="noopener noreferrer">
          <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="chat-image-attachment" loading="lazy" />
        </a>
      </div>
    `;
  }

  return `
    <div class="chat-attachment">
      <div class="chat-file-card">
        <div class="chat-file-icon">📄</div>
        <div class="chat-file-details">
          <span class="chat-file-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
          <span class="chat-file-size">${formatFileSize(att.size)}</span>
        </div>
        <a href="${att.dataUrl}" download="${escapeHtml(att.name)}" class="chat-file-download-btn">Download</a>
      </div>
    </div>
  `;
};

const renderMessage = (msg: ChatMessage): string => {
  const avatarBg = getAvatarGradient(msg.senderName);
  const initials = getInitials(msg.senderName);
  const reactions = msg.reactions || {};

  return `
    <div class="message-item" id="msg-${msg.id}" data-message-id="${msg.id}">
      <!-- Slack Floating Action Bar on Hover -->
      <div class="message-action-bar">
        ${QUICK_REACTIONS.map(
          (emoji) => `
          <button type="button" class="reaction-quick-btn" data-msg-id="${msg.id}" data-emoji="${emoji}" title="React ${emoji}">
            ${emoji}
          </button>
        `
        ).join("")}
      </div>

      <div class="message-avatar" style="background: ${avatarBg};">
        ${initials}
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">${escapeHtml(msg.senderName)}</span>
          <span class="message-timestamp">${formatTime(msg.createdAt)}</span>
        </div>
        ${msg.content ? `<div class="message-content">${formatMessageText(msg.content)}</div>` : ""}
        ${msg.attachment ? renderAttachment(msg.attachment) : ""}

        <!-- Reaction Pills -->
        ${
          Object.keys(reactions).length > 0
            ? `
            <div class="reactions-list">
              ${Object.entries(reactions)
                .map(([emoji, userIds]) => {
                  const hasReacted = Boolean(state.user && userIds.includes(state.user.id));
                  return `
                    <button
                      type="button"
                      class="reaction-pill ${hasReacted ? "has-reacted" : ""}"
                      data-msg-id="${msg.id}"
                      data-emoji="${emoji}"
                      title="${userIds.length} reaction${userIds.length === 1 ? "" : "s"}"
                    >
                      <span>${emoji}</span>
                      <span class="reaction-count">${userIds.length}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          `
            : ""
        }
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

  const userAvatarBg = state.user ? getAvatarGradient(state.user.username) : "#1d9bd1";
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
              <h2>Slack DO</h2>
              <span><span class="pulse-dot"></span> Online</span>
            </div>
          </div>
        </div>

        <div class="sidebar-content">
          <div>
            <div class="channel-section-header">
              <span>Channels</span>
              <button type="button" id="open-create-channel" class="section-action-btn" title="Create Channel">
                <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
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
              <span>🔗 Join with Invite Code</span>
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
            <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
          </button>
        </footer>
      </aside>

      <!-- Main Chat Area -->
      <section class="chat-pane" id="chat-pane-container">
        <!-- Channel Top Bar -->
        <header class="chat-header">
          <div class="channel-meta">
            <div class="channel-header-title">
              <h2># ${escapeHtml(currentChannel.name)}</h2>
            </div>
            <span class="online-badge">
              <span class="pulse-dot"></span>
              ${state.participants.length} member${state.participants.length === 1 ? "" : "s"}
            </span>
          </div>

          <div class="chat-header-actions">
            <button
              type="button"
              id="share-invite-btn"
              class="share-invite-btn ${state.copiedInvite ? "copied" : ""}"
            >
              <span>${state.copiedInvite ? "✓ Copied!" : "Copy Invite Link"}</span>
            </button>
          </div>
        </header>

        <!-- Messages Stream -->
        <div id="messages-stream" class="messages-container">
          ${
            state.messages.length === 0
              ? `
              <div style="margin: auto; text-align: center; color: var(--text-muted); padding: 40px 20px;">
                <h3 style="color: #fff; margin-bottom: 6px;">Welcome to #${escapeHtml(currentChannel.name)}!</h3>
                <p>This room runs in an isolated Cloudflare Durable Object with SQLite. Share messages, upload files, or react with emojis!</p>
              </div>
            `
              : state.messages.map(renderMessage).join("")
          }
        </div>

        <!-- Typing Indicator -->
        <div class="typing-bar" id="typing-indicator">
          ${
            otherTypingUsers.length > 0
              ? `<span>${escapeHtml(otherTypingUsers.join(", "))} ${otherTypingUsers.length === 1 ? "is" : "are"} typing...</span>`
              : ""
          }
        </div>

        <!-- Composer Box (Slack Rich Bar) -->
        <div class="chat-composer-container">
          <form id="chat-form" class="composer-box">
            <!-- Pending Attachment Preview -->
            ${
              state.pendingAttachment
                ? `
                <div class="composer-attachment-preview">
                  ${
                    state.pendingAttachment.type.startsWith("image/")
                      ? `<img src="${state.pendingAttachment.dataUrl}" class="composer-attachment-thumb" />`
                      : `<span>📄</span>`
                  }
                  <span class="composer-attachment-name">${escapeHtml(state.pendingAttachment.name)} (${formatFileSize(state.pendingAttachment.size)})</span>
                  <button type="button" id="remove-attachment-btn" class="composer-attachment-remove">&times;</button>
                </div>
              `
                : ""
            }

            <textarea
              id="chat-input"
              class="composer-textarea"
              placeholder="Message #${escapeHtml(currentChannel.name)}"
              rows="1"
            ></textarea>

            <div class="composer-toolbar">
              <div class="toolbar-group">
                <!-- File Attach Button -->
                <input type="file" id="file-input" style="display:none;" />
                <button type="button" id="attach-file-btn" class="toolbar-btn" title="Attach file or image">
                  <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                </button>

                <!-- Emoji Picker Button -->
                <button type="button" id="toggle-emoji-btn" class="toolbar-btn" title="Add emoji">
                  😊
                </button>
              </div>

              <div class="toolbar-group">
                <button type="submit" id="send-msg-btn" class="send-btn" title="Send message">
                  <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            </div>
          </form>

          <!-- Emoji Popover -->
          ${
            state.showEmojiPicker
              ? `
              <div class="emoji-popover" id="emoji-popover">
                <div class="emoji-popover-header">Frequently Used Emojis</div>
                <div class="emoji-grid">
                  ${SLACK_EMOJIS.map(
                    (e) => `
                    <button type="button" class="emoji-item-btn" data-insert-emoji="${e}">${e}</button>
                  `
                  ).join("")}
                </div>
              </div>
            `
              : ""
          }
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
            <h3>Create a channel</h3>
            <button type="button" class="modal-close-btn" id="modal-close">&times;</button>
          </div>
          ${
            state.modalError
              ? `<div class="auth-error-banner"><span>${state.modalError}</span></div>`
              : ""
          }
          <form id="create-channel-form" class="auth-form">
            <div class="form-group">
              <label class="form-label" for="channel-name-input">Name</label>
              <input
                id="channel-name-input"
                name="channelName"
                type="text"
                class="form-input"
                placeholder="e.g. project-plan"
                required
                autocomplete="off"
                minlength="2"
                maxlength="32"
                autofocus
              />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
              <button type="submit" class="btn-primary">Create</button>
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
            <h3>Join with Invite Code</h3>
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
                placeholder="e.g. 7v7juz"
                required
                autocomplete="off"
                autofocus
              />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
              <button type="submit" class="btn-primary">Join</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return "";
};

// ==========================================================================
// Event Binding & DOM Coordination
// ==========================================================================

const bindEvents = (): void => {
  // Auth Screen Events
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const authForm = document.getElementById("auth-form");

  if (tabLogin) tabLogin.onclick = () => updateState((s) => ({ ...s, authMode: "login", authError: null }));
  if (tabRegister) tabRegister.onclick = () => updateState((s) => ({ ...s, authMode: "register", authError: null }));
  if (authForm) authForm.onsubmit = handleAuthSubmit;

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

  // In-App Invite Clickable Badges
  const inviteLinks = document.querySelectorAll<HTMLElement>(".invite-badge-link");
  inviteLinks.forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      const code = link.getAttribute("data-invite-code");
      if (code) joinInviteCodeDirectly(code);
    };
  });

  // Modal Openers
  const openCreateBtn = document.getElementById("open-create-channel");
  if (openCreateBtn) openCreateBtn.onclick = () => updateState((s) => ({ ...s, activeModal: "create_channel", modalError: null }));

  const openJoinBtn = document.getElementById("open-join-invite");
  if (openJoinBtn) openJoinBtn.onclick = () => updateState((s) => ({ ...s, activeModal: "join_invite", modalError: null }));

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

  // Reactions: Quick bar and Reaction pills
  const reactionQuickBtns = document.querySelectorAll<HTMLElement>(".reaction-quick-btn");
  reactionQuickBtns.forEach((btn) => {
    btn.onclick = () => {
      const msgId = btn.getAttribute("data-msg-id");
      const emoji = btn.getAttribute("data-emoji");
      if (msgId && emoji) toggleMessageReaction(msgId, emoji);
    };
  });

  const reactionPills = document.querySelectorAll<HTMLElement>(".reaction-pill");
  reactionPills.forEach((pill) => {
    pill.onclick = () => {
      const msgId = pill.getAttribute("data-msg-id");
      const emoji = pill.getAttribute("data-emoji");
      if (msgId && emoji) toggleMessageReaction(msgId, emoji);
    };
  });

  // Emoji Popover Toggle
  const toggleEmojiBtn = document.getElementById("toggle-emoji-btn");
  if (toggleEmojiBtn) {
    toggleEmojiBtn.onclick = (e) => {
      e.stopPropagation();
      updateState((s) => ({ ...s, showEmojiPicker: !s.showEmojiPicker }));
    };
  }

  // Insert Emoji into input
  const emojiItems = document.querySelectorAll<HTMLElement>(".emoji-item-btn");
  emojiItems.forEach((btn) => {
    btn.onclick = () => {
      const emoji = btn.getAttribute("data-insert-emoji");
      const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
      if (emoji && chatInput) {
        const start = chatInput.selectionStart;
        const end = chatInput.selectionEnd;
        const val = chatInput.value;
        chatInput.value = val.substring(0, start) + emoji + val.substring(end);
        chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
        chatInput.focus();
      }
    };
  });

  // Close emoji popover when clicking outside
  document.onclick = (e) => {
    const popover = document.getElementById("emoji-popover");
    const toggleBtn = document.getElementById("toggle-emoji-btn");
    if (state.showEmojiPicker && popover && !popover.contains(e.target as Node) && e.target !== toggleBtn) {
      updateState((s) => ({ ...s, showEmojiPicker: false }));
    }
  };

  // File Upload Attachment
  const attachFileBtn = document.getElementById("attach-file-btn");
  const fileInput = document.getElementById("file-input") as HTMLInputElement | null;

  if (attachFileBtn && fileInput) {
    attachFileBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (file) handleFileUpload(file);
      fileInput.value = "";
    };
  }

  // Remove pending attachment
  const removeAttBtn = document.getElementById("remove-attachment-btn");
  if (removeAttBtn) {
    removeAttBtn.onclick = () => updateState((s) => ({ ...s, pendingAttachment: null }));
  }

  // Drag and drop file onto chat container
  const chatPane = document.getElementById("chat-pane-container");
  if (chatPane) {
    chatPane.ondragover = (e) => {
      e.preventDefault();
    };
    chatPane.ondrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) handleFileUpload(file);
    };
  }

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
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";

      sendTypingSignal(true);
      if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
      typingDebounceTimer = window.setTimeout(() => sendTypingSignal(false), 3000);
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
