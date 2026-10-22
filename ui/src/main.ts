/**
 * Durable Chat Frontend Application
 * Authentic Slack Experience:
 * - Real-time chronological messaging via Durable Objects
 * - Clickable links & auto-joining in-app invite links
 * - Rich file & image sharing (Enter sends file + text reliably)
 * - Slack emoji reactions & emoji drawer
 * - 1-Click Guest Login (username: guest, password: guest123)
 * - User tagging (@username) with Slack mention badges
 * - Unread channel counters & Slack Alert notification banners
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
  readonly parentId?: string;
  readonly parentSenderId?: string;
  readonly parentSenderName?: string;
  readonly replyCount?: number;
  readonly lastReplyAt?: number;
  readonly createdAt: number;
}

interface AlertToast {
  readonly title: string;
  readonly snippet: string;
  readonly channelId: string;
  readonly messageId?: string;
  readonly parentId?: string;
  readonly icon?: string;
}

interface MentionItem {
  readonly id: string;
  readonly messageId?: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly senderName: string;
  readonly content: string;
  readonly createdAt: number;
  readonly parentId?: string;
  readonly type?: "mention" | "thread_reply" | "reaction";
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
  readonly showThreadEmojiPicker: boolean;
  readonly emojiCategory: "all" | "smileys" | "gestures" | "hearts" | "objects" | "food";
  readonly emojiSearchQuery: string;
  readonly pendingAttachment: FileAttachment | null;
  readonly threadPendingAttachment: FileAttachment | null;
  readonly unreadChannels: Readonly<Record<string, number>>;
  readonly channelMentions: Readonly<Record<string, boolean>>;
  readonly mentions: readonly MentionItem[];
  readonly unreadMentionsCount: number;
  readonly isViewingMentions: boolean;
  readonly alertToast: AlertToast | null;
  readonly mentionQuery: string | null;
  readonly isChannelForbidden: boolean;
  readonly activeThreadParentId: string | null;
  readonly threadMessages: readonly ChatMessage[];
  readonly isThreadLoading: boolean;
  readonly drafts: Readonly<Record<string, string>>;
}

interface EmojiDefinition {
  readonly emoji: string;
  readonly name: string;
  readonly category: "smileys" | "gestures" | "hearts" | "objects" | "food";
}

const EMOJI_CATALOG: readonly EmojiDefinition[] = [
  // Smileys & Emotions
  { emoji: "😀", name: "grinning face smile happy", category: "smileys" },
  { emoji: "😃", name: "smiley happy joy", category: "smileys" },
  { emoji: "😄", name: "smile laughing happy", category: "smileys" },
  { emoji: "😁", name: "beaming grin teeth", category: "smileys" },
  { emoji: "😆", name: "laughing squint laugh", category: "smileys" },
  { emoji: "😅", name: "sweat smile relief nervous", category: "smileys" },
  { emoji: "🤣", name: "rofl rolling laughing", category: "smileys" },
  { emoji: "😂", name: "joy tears of joy laugh lol", category: "smileys" },
  { emoji: "🙂", name: "slight smile positive", category: "smileys" },
  { emoji: "🙃", name: "upside down silly sarcasm", category: "smileys" },
  { emoji: "😉", name: "wink playful flirt", category: "smileys" },
  { emoji: "😊", name: "blush sweet happy", category: "smileys" },
  { emoji: "😇", name: "halo angel innocent", category: "smileys" },
  { emoji: "🥰", name: "hearts in love adored", category: "smileys" },
  { emoji: "😍", name: "heart eyes love crush", category: "smileys" },
  { emoji: "🤩", name: "star struck excited wow", category: "smileys" },
  { emoji: "😘", name: "kiss blow kiss love", category: "smileys" },
  { emoji: "😋", name: "yum delicious tongue", category: "smileys" },
  { emoji: "😛", name: "tongue silly playful", category: "smileys" },
  { emoji: "😜", name: "wink tongue crazy party", category: "smileys" },
  { emoji: "🤪", name: "zany wacky wild goofy", category: "smileys" },
  { emoji: "🤑", name: "money mouth rich cash", category: "smileys" },
  { emoji: "🤗", name: "hug hugging warm welcome", category: "smileys" },
  { emoji: "🤭", name: "hand over mouth giggle oops", category: "smileys" },
  { emoji: "🤫", name: "shh quiet secret silent", category: "smileys" },
  { emoji: "🤔", name: "thinking ponder hmm curious", category: "smileys" },
  { emoji: "🤐", name: "zipper mouth sealed quiet", category: "smileys" },
  { emoji: "🤨", name: "raised eyebrow skeptic suspect", category: "smileys" },
  { emoji: "😐", name: "neutral poker face blank", category: "smileys" },
  { emoji: "😑", name: "expressionless speechless meh", category: "smileys" },
  { emoji: "😶", name: "no mouth blank quiet", category: "smileys" },
  { emoji: "😏", name: "smirk smug clever", category: "smileys" },
  { emoji: "😒", name: "unamused annoyed unbothered", category: "smileys" },
  { emoji: "🙄", name: "roll eyes whatever sarcasm", category: "smileys" },
  { emoji: "😬", name: "grimace awkward yikes", category: "smileys" },
  { emoji: "🤥", name: "lying pinocchio dishonest", category: "smileys" },
  { emoji: "😌", name: "relieved peace calm zen", category: "smileys" },
  { emoji: "😴", name: "sleeping zzz tired goodnight", category: "smileys" },
  { emoji: "😷", name: "mask sick flu hospital", category: "smileys" },
  { emoji: "🤒", name: "thermometer fever ill sick", category: "smileys" },
  { emoji: "🤢", name: "nauseated gross disgust", category: "smileys" },
  { emoji: "🥵", name: "hot heat sweating summer", category: "smileys" },
  { emoji: "🥶", name: "cold freezing ice winter", category: "smileys" },
  { emoji: "🥴", name: "woozy drunk tipsy dizzy", category: "smileys" },
  { emoji: "🤯", name: "mind blown shocked exploding", category: "smileys" },
  { emoji: "🤠", name: "cowboy hat yeehaw sheriff", category: "smileys" },
  { emoji: "🥳", name: "partying celebrate birthday", category: "smileys" },
  { emoji: "😎", name: "sunglasses cool chill awesome", category: "smileys" },
  { emoji: "🤓", name: "nerd geek glasses smart", category: "smileys" },
  { emoji: "🧐", name: "monocle examine detective", category: "smileys" },
  { emoji: "😕", name: "confused puzzled what", category: "smileys" },
  { emoji: "😟", name: "worried concerned nervous", category: "smileys" },
  { emoji: "😮", name: "surprised wow whoa gasp", category: "smileys" },
  { emoji: "😲", name: "astonished shocked stunned", category: "smileys" },
  { emoji: "😳", name: "flushed embarrassed shocked", category: "smileys" },
  { emoji: "🥺", name: "pleading begging puppy eyes", category: "smileys" },
  { emoji: "😨", name: "fearful scared frightened", category: "smileys" },
  { emoji: "😰", name: "anxious sweat nervous cold", category: "smileys" },
  { emoji: "😥", name: "sad but relieved whew", category: "smileys" },
  { emoji: "😢", name: "crying tear sad upset", category: "smileys" },
  { emoji: "😭", name: "sob crying loud bawling", category: "smileys" },
  { emoji: "😱", name: "scream horrified fear panic", category: "smileys" },
  { emoji: "😖", name: "confounded frustrated struggling", category: "smileys" },
  { emoji: "😣", name: "persevering effort endure", category: "smileys" },
  { emoji: "😞", name: "disappointed upset down", category: "smileys" },
  { emoji: "😤", name: "triumph smoke angry proud", category: "smileys" },
  { emoji: "😡", name: "rage pouting mad furious", category: "smileys" },
  { emoji: "😠", name: "angry mad furious", category: "smileys" },
  { emoji: "🤬", name: "cursing swear swearing mad", category: "smileys" },
  { emoji: "😈", name: "devil naughty evil mischievous", category: "smileys" },
  { emoji: "💀", name: "skull dead ded lol dying", category: "smileys" },
  { emoji: "💩", name: "poop pile crap funny", category: "smileys" },
  { emoji: "🤡", name: "clown foolish silly", category: "smileys" },
  { emoji: "👻", name: "ghost spooky boo halloween", category: "smileys" },
  { emoji: "👽", name: "alien ufo extraterrestrial", category: "smileys" },
  { emoji: "🤖", name: "robot bot automated AI", category: "smileys" },

  // Hands & Gestures
  { emoji: "👍", name: "thumbs up approve like yes good ok", category: "gestures" },
  { emoji: "👎", name: "thumbs down disapprove dislike no bad", category: "gestures" },
  { emoji: "👏", name: "clap applause cheer congrats", category: "gestures" },
  { emoji: "🙌", name: "raised hands celebrate hooray", category: "gestures" },
  { emoji: "👐", name: "open hands welcoming jazz", category: "gestures" },
  { emoji: "🤲", name: "palms together praying offer", category: "gestures" },
  { emoji: "🤝", name: "handshake deal agreement partner", category: "gestures" },
  { emoji: "🙏", name: "folded hands please pray thank you namaste", category: "gestures" },
  { emoji: "✍️", name: "writing hand pen notes memo", category: "gestures" },
  { emoji: "💪", name: "flex biceps strong muscle gym power", category: "gestures" },
  { emoji: "👀", name: "eyes looking look glance curious watch", category: "gestures" },
  { emoji: "✌️", name: "peace victory two v sign", category: "gestures" },
  { emoji: "🤞", name: "fingers crossed luck hope", category: "gestures" },
  { emoji: "🤟", name: "love you gesture sign", category: "gestures" },
  { emoji: "🤘", name: "rock on horns heavy metal", category: "gestures" },
  { emoji: "🤙", name: "call me shaka phone hang loose", category: "gestures" },
  { emoji: "🖐️", name: "hand splayed five high five", category: "gestures" },
  { emoji: "✋", name: "raised hand stop high five wait", category: "gestures" },
  { emoji: "👌", name: "ok hand perfect fine nice", category: "gestures" },
  { emoji: "🤌", name: "pinched fingers italian chef kiss what", category: "gestures" },
  { emoji: "🤏", name: "pinching hand tiny small little", category: "gestures" },
  { emoji: "👈", name: "point left direction", category: "gestures" },
  { emoji: "👉", name: "point right direction", category: "gestures" },
  { emoji: "👆", name: "point up above this", category: "gestures" },
  { emoji: "👇", name: "point down below this", category: "gestures" },
  { emoji: "☝️", name: "index finger pointing up idea attention", category: "gestures" },
  { emoji: "👋", name: "wave hello goodbye hi bye", category: "gestures" },
  { emoji: "🫡", name: "saluting face respect yes sir copy", category: "gestures" },

  // Hearts & Reactions
  { emoji: "❤️", name: "red heart love favorite like", category: "hearts" },
  { emoji: "🧡", name: "orange heart warm love", category: "hearts" },
  { emoji: "💛", name: "yellow heart friendly love", category: "hearts" },
  { emoji: "💚", name: "green heart nature envy love", category: "hearts" },
  { emoji: "💙", name: "blue heart loyalty calm love", category: "hearts" },
  { emoji: "💜", name: "purple heart royalty love", category: "hearts" },
  { emoji: "🖤", name: "black heart dark gothic emo", category: "hearts" },
  { emoji: "🤍", name: "white heart pure clean peace", category: "hearts" },
  { emoji: "🤎", name: "brown heart chocolate earth", category: "hearts" },
  { emoji: "💔", name: "broken heart sad breakup hurt", category: "hearts" },
  { emoji: "❤️‍🔥", name: "heart on fire passion burning", category: "hearts" },
  { emoji: "💖", name: "sparkling heart sparkle shine", category: "hearts" },
  { emoji: "💗", name: "growing heart excitement pulse", category: "hearts" },
  { emoji: "💓", name: "beating heart heartbeat", category: "hearts" },
  { emoji: "💞", name: "revolving hearts romance", category: "hearts" },
  { emoji: "💕", name: "two hearts love sweet", category: "hearts" },
  { emoji: "🔥", name: "fire lit hot amazing lit hype", category: "hearts" },
  { emoji: "⭐", name: "star fav rating favorite", category: "hearts" },
  { emoji: "🌟", name: "glowing star shine bright", category: "hearts" },
  { emoji: "✨", name: "sparkles shiny clean magic new", category: "hearts" },
  { emoji: "⚡", name: "zap lightning bolt fast quick energy", category: "hearts" },
  { emoji: "💥", name: "collision boom explosion blast", category: "hearts" },
  { emoji: "💯", name: "hundred points perfect score 100 legit", category: "hearts" },
  { emoji: "💢", name: "anger sign anime mad comic", category: "hearts" },
  { emoji: "💫", name: "dizzy star spark swirl", category: "hearts" },
  { emoji: "💬", name: "speech balloon chat message comment", category: "hearts" },
  { emoji: "✅", name: "check mark done success correct finished", category: "hearts" },
  { emoji: "❌", name: "cross mark wrong error fail cancelled", category: "hearts" },
  { emoji: "⚠️", name: "warning alert caution hazard", category: "hearts" },
  { emoji: "📌", name: "pushpin pin pinned important save", category: "hearts" },

  // Activities & Objects
  { emoji: "🚀", name: "rocket ship launch speed fast deploy ship it", category: "objects" },
  { emoji: "🎉", name: "party popper celebration tada congrats yay", category: "objects" },
  { emoji: "🎊", name: "confetti ball party celebrate", category: "objects" },
  { emoji: "🏆", name: "trophy win winner champion award gold", category: "objects" },
  { emoji: "🥇", name: "1st place medal gold first winner", category: "objects" },
  { emoji: "🎯", name: "bullseye target goal hit direct accurate", category: "objects" },
  { emoji: "💻", name: "laptop computer tech code work developer", category: "objects" },
  { emoji: "📱", name: "mobile phone smartphone tech screen", category: "objects" },
  { emoji: "💡", name: "light bulb idea smart tip suggestion", category: "objects" },
  { emoji: "🔑", name: "key unlock password secret access", category: "objects" },
  { emoji: "🔒", name: "lock secure encrypted private safe", category: "objects" },
  { emoji: "💎", name: "gem stone diamond premium value shiny", category: "objects" },
  { emoji: "🔔", name: "bell notification alert reminder ring", category: "objects" },
  { emoji: "📦", name: "package box parcel delivery ship", category: "objects" },
  { emoji: "🛠️", name: "hammer and wrench tools fix repair build", category: "objects" },
  { emoji: "⚙️", name: "gear cog settings config options", category: "objects" },
  { emoji: "📊", name: "bar chart stats metrics graph analytics", category: "objects" },
  { emoji: "📈", name: "chart increasing growth up stonks profit", category: "objects" },
  { emoji: "📝", name: "memo note document write edit draft", category: "objects" },
  { emoji: "📄", name: "page document file sheet text", category: "objects" },
  { emoji: "📁", name: "file folder directory documents", category: "objects" },
  { emoji: "🔗", name: "link url hyperlink connect anchor", category: "objects" },
  { emoji: "✂️", name: "scissors cut trim snippet", category: "objects" },
  { emoji: "☕", name: "hot beverage coffee tea morning break", category: "food" },
  { emoji: "🍕", name: "pizza slice cheese food party lunch", category: "food" },
  { emoji: "🍔", name: "hamburger burger fast food dinner", category: "food" },
  { emoji: "🍟", name: "french fries potato chips snack", category: "food" },
  { emoji: "🌭", name: "hot dog sausage snack", category: "food" },
  { emoji: "🍿", name: "popcorn movie theater snack film", category: "food" },
  { emoji: "🍩", name: "doughnut donut sweet pastry glaze", category: "food" },
  { emoji: "🍪", name: "cookie biscuit sweet chocolate snack", category: "food" },
  { emoji: "🎂", name: "birthday cake celebration sweet dessert", category: "food" },
  { emoji: "🍻", name: "clinking beer mugs cheers drinks party bar", category: "food" },
  { emoji: "🥂", name: "clinking glasses champagne toast cheers celebration", category: "food" },
  { emoji: "🍷", name: "wine glass red alcohol drink", category: "food" },
  { emoji: "🍣", name: "sushi japanese seafood rice dinner", category: "food" },
  { emoji: "🌮", name: "taco mexican food lunch dinner", category: "food" },
  { emoji: "🍎", name: "red apple fruit healthy fresh teacher", category: "food" },
  { emoji: "🥑", name: "avocado healthy fresh guac keto", category: "food" },
];

const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🚀", "👀"];

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

const loadPersistedMentions = (
  userId: string | null
): { mentions: MentionItem[]; unreadCount: number } => {
  if (!userId) return { mentions: [], unreadCount: 0 };
  try {
    const rawMentions = localStorage.getItem(`slack_mentions_${userId}`);
    const mentions: MentionItem[] = rawMentions ? JSON.parse(rawMentions) : [];
    const rawUnread = localStorage.getItem(`slack_unread_mentions_${userId}`);
    const unreadCount = rawUnread ? Math.max(0, parseInt(rawUnread, 10) || 0) : 0;
    return { mentions, unreadCount };
  } catch {
    return { mentions: [], unreadCount: 0 };
  }
};

const savePersistedMentions = (
  userId: string | null,
  mentions: readonly MentionItem[],
  unreadCount: number
): void => {
  if (!userId) return;
  try {
    localStorage.setItem(`slack_mentions_${userId}`, JSON.stringify(mentions.slice(0, 100)));
    localStorage.setItem(`slack_unread_mentions_${userId}`, unreadCount.toString());
  } catch {}
};

const loadPersistedLastRead = (userId: string | null): Record<string, number> => {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`slack_last_read_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const savePersistedLastRead = (
  userId: string | null,
  timestamps: Record<string, number>
): void => {
  if (!userId) return;
  try {
    localStorage.setItem(`slack_last_read_${userId}`, JSON.stringify(timestamps));
  } catch {}
};

const isMentioningUser = (content: string, username: string): boolean => {
  if (!content || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[^a-zA-Z0-9_])@${escaped}(?![a-zA-Z0-9_-])`, "i");
  return regex.test(content);
};

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hr ago";
  if (hours < 24) return `${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Initial State
const initialAuth = loadPersistedAuth();
const initialMentions = loadPersistedMentions(initialAuth.user?.id || null);

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
  showThreadEmojiPicker: false,
  emojiCategory: "all",
  emojiSearchQuery: "",
  pendingAttachment: null,
  threadPendingAttachment: null,
  unreadChannels: {},
  channelMentions: {},
  mentions: initialMentions.mentions,
  unreadMentionsCount: initialMentions.unreadCount,
  isViewingMentions: false,
  alertToast: null,
  mentionQuery: null,
  isChannelForbidden: false,
  activeThreadParentId: null,
  threadMessages: [],
  isThreadLoading: false,
  drafts: {},
};

interface OutboxMessage {
  readonly clientMsgId: string;
  readonly content: string;
  readonly attachment?: FileAttachment;
  readonly parentId?: string;
  readonly channelId: string;
  readonly sentAt: number;
}

let activeSocket: WebSocket | null = null;
let typingDebounceTimer: number | null = null;
let toastTimeout: number | null = null;
let heartbeatInterval: number | null = null;
let reconnectTimeout: number | null = null;
let reconnectAttempts = 0;
let lastTypingSent = 0;
let lastPongReceivedAt = Date.now();
let activityPollInterval: number | null = null;
let lastReadTimestamps: Record<string, number> = loadPersistedLastRead(initialAuth.user?.id || null);
let isInternalHashChange = false;
let pendingOutbox: OutboxMessage[] = [];

const startHeartbeat = (): void => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = window.setInterval(() => {
    const now = Date.now();
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      if (now - lastPongReceivedAt > 20000) {
        console.warn("WebSocket heartbeat timed out (>20s no pong), reconnecting...");
        checkAndHealWebSocket();
        return;
      }
      try {
        activeSocket.send(JSON.stringify({ type: "PING" }));
      } catch (err) {
        console.warn("Heartbeat send error, triggering reconnect:", err);
        checkAndHealWebSocket();
      }
    } else {
      checkAndHealWebSocket();
    }
  }, 10000); // 10s keeps Cloudflare DO alive and detects drops fast
};

const stopHeartbeat = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

const scheduleReconnect = (channelId: string, token: string): void => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (!state.user || !state.token || state.isChannelForbidden) return;

  const delay = Math.min(800 * Math.pow(1.4, reconnectAttempts), 6000);
  reconnectAttempts++;

  reconnectTimeout = window.setTimeout(() => {
    connectWebSocket(channelId, token);
  }, delay);
};

const checkAndHealWebSocket = (): void => {
  if (!state.user || !state.token || state.isChannelForbidden) return;
  const now = Date.now();
  const isStale = now - lastPongReceivedAt > 15000;
  const isDead = !activeSocket || activeSocket.readyState === WebSocket.CLOSED || activeSocket.readyState === WebSocket.CLOSING;

  if (isDead || isStale) {
    connectWebSocket(state.activeChannelId, state.token);
  } else if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    try {
      activeSocket.send(JSON.stringify({ type: "PING" }));
    } catch {
      connectWebSocket(state.activeChannelId, state.token);
    }
  }
};



// Update state and trigger re-render while NEVER losing user's typed drafts or scroll positions
const updateState = (updater: (prev: AppState) => AppState): void => {
  const mainInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const threadInput = document.getElementById("thread-chat-input") as HTMLTextAreaElement | null;

  const currentDrafts = { ...state.drafts };
  if (mainInput && state.activeChannelId) {
    currentDrafts[state.activeChannelId] = mainInput.value;
  }
  if (threadInput && state.activeThreadParentId) {
    currentDrafts[`thread:${state.activeThreadParentId}`] = threadInput.value;
  }

  // Check if containers were at or near the bottom before rendering
  const messagesStream = document.getElementById("messages-stream");
  const threadStream = document.getElementById("thread-messages-stream");
  const isChatAtBottom = messagesStream
    ? messagesStream.scrollHeight - messagesStream.scrollTop - messagesStream.clientHeight < 60
    : true;
  const isThreadAtBottom = threadStream
    ? threadStream.scrollHeight - threadStream.scrollTop - threadStream.clientHeight < 60
    : true;
  const chatScrollTop = messagesStream ? messagesStream.scrollTop : null;
  const threadScrollTop = threadStream ? threadStream.scrollTop : null;

  // Preserve focus and selection
  const activeEl = document.activeElement;
  const focusedId = activeEl?.id;
  let cursorStart = 0;
  let cursorEnd = 0;
  if (activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement) {
    cursorStart = activeEl.selectionStart || 0;
    cursorEnd = activeEl.selectionEnd || 0;
  }

  state = updater({ ...state, drafts: currentDrafts });
  renderApp();

  // Restore scroll positions: if user was at bottom, stay pinned to bottom without bouncing!
  const newChat = document.getElementById("messages-stream");
  if (newChat) {
    if (isChatAtBottom) {
      newChat.scrollTop = newChat.scrollHeight;
    } else if (chatScrollTop !== null) {
      newChat.scrollTop = chatScrollTop;
    }
  }

  const newThread = document.getElementById("thread-messages-stream");
  if (newThread) {
    if (isThreadAtBottom) {
      newThread.scrollTop = newThread.scrollHeight;
    } else if (threadScrollTop !== null) {
      newThread.scrollTop = threadScrollTop;
    }
  }

  // Restore focus and cursor seamlessly
  if (focusedId) {
    const el = document.getElementById(focusedId);
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus();
      try {
        el.setSelectionRange(cursorStart, cursorEnd);
      } catch {}
    }
  }
};

const showSlackAlertToast = (
  title: string,
  snippet: string,
  channelId: string,
  messageId?: string,
  parentId?: string,
  icon = "🔔"
): void => {
  updateState((s) => ({
    ...s,
    alertToast: { title, snippet, channelId, messageId, parentId, icon },
  }));
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    updateState((s) => ({ ...s, alertToast: null }));
  }, 6000);
};

// Jump directly to exact message (or open thread) like Slack
const navigateToMessage = async (roomId: string, messageId: string, parentId?: string): Promise<void> => {
  updateState((s) => ({
    ...s,
    isViewingMentions: false,
    alertToast: null,
  }));

  let cleanMsgId = (messageId || "").trim();
  if (cleanMsgId.startsWith("reply_")) {
    cleanMsgId = cleanMsgId.replace(/^reply_/, "");
  } else if (cleanMsgId.startsWith("react_")) {
    const parts = cleanMsgId.split("_");
    if (parts.length >= 2) {
      cleanMsgId = parts[1];
    }
  }

  // If old synthetic activity id with no actual message id, simply switch to channel
  if (cleanMsgId.startsWith("act_")) {
    if (state.activeChannelId !== roomId) {
      switchChannel(roomId);
    }
    return;
  }

  let resolvedParentId = parentId;
  let preloadedRoot: ChatMessage | null = null;
  let preloadedReplies: readonly ChatMessage[] | null = null;

  // If parentId was not passed, resolve whether this message belongs to a thread
  if (!resolvedParentId && cleanMsgId) {
    const localThreadMsg = state.threadMessages.find((m) => m.id === cleanMsgId);
    if (localThreadMsg?.parentId) {
      resolvedParentId = localThreadMsg.parentId;
    } else {
      const localChannelMsg = state.messages.find((m) => m.id === cleanMsgId);
      if (localChannelMsg?.parentId) {
        resolvedParentId = localChannelMsg.parentId;
      }
    }

    if (!resolvedParentId) {
      try {
        const res = await fetch(
          `/api/channels/${encodeURIComponent(roomId)}/messages?token=${encodeURIComponent(state.token || "")}&messageId=${encodeURIComponent(cleanMsgId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.parentId) {
            resolvedParentId = data.parentId;
          }
          if (data.rootMessage) {
            preloadedRoot = data.rootMessage;
          }
          if (data.messages && data.messages.length > 0) {
            preloadedReplies = data.messages;
          }
        }
      } catch (err) {
        console.debug("Failed to query message details from server:", err);
      }
    }
  }

  if (resolvedParentId) {
    // Open exact thread and highlight target message like Slack!
    await openThread(resolvedParentId, roomId, cleanMsgId, preloadedRoot, preloadedReplies || undefined);
  } else {
    // Top-level message in channel
    if (state.activeChannelId !== roomId) {
      switchChannel(roomId);
      await new Promise((r) => setTimeout(r, 220));
    }
    setTimeout(() => {
      const el = (document.getElementById(`msg-${cleanMsgId}`) ||
        document.querySelector(`[data-message-id="${cleanMsgId}"]`)) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("highlight-flash");
        void el.offsetWidth;
        el.classList.add("highlight-flash");
      }
    }, 180);
  }
};

// ==========================================================================
// WebSocket Connection Management
// ==========================================================================

const connectWebSocket = (channelId: string, token: string): void => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (activeSocket) {
    activeSocket.onclose = null;
    activeSocket.onerror = null;
    activeSocket.close();
    activeSocket = null;
  }

  // Security Check: Is user authorized for this private channel?
  const isPublic = channelId === "general" || channelId === "random";
  const isMember = isPublic || state.channels.some((c) => c.id === channelId);

  if (!isMember && state.channels.length > 0) {
    stopHeartbeat();
    updateState((s) => ({
      ...s,
      isChannelForbidden: true,
      isConnecting: false,
      messages: [],
      participants: [],
      typingUsers: [],
    }));
    return;
  }

  updateState((s) => ({
    ...s,
    isChannelForbidden: false,
    isConnecting: true,
  }));

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/channels/${channelId}/ws?token=${encodeURIComponent(token)}`;

  const ws = new WebSocket(wsUrl);
  activeSocket = ws;

  ws.onopen = () => {
    reconnectAttempts = 0;
    lastPongReceivedAt = Date.now();
    startHeartbeat();
    updateState((s) => ({ ...s, isConnecting: false, isChannelForbidden: false }));

    // Flush any pending messages that user submitted while reconnecting
    if (pendingOutbox.length > 0) {
      const messagesToSend = [...pendingOutbox];
      pendingOutbox = [];
      for (const m of messagesToSend) {
        if (m.channelId === state.activeChannelId) {
          try {
            ws.send(
              JSON.stringify({
                type: "SEND_MESSAGE",
                content: m.content,
                attachment: m.attachment,
                parentId: m.parentId,
                tempId: m.clientMsgId,
              })
            );
          } catch (err) {
            console.error("Error flushing message:", err);
            pendingOutbox.push(m);
          }
        } else {
          pendingOutbox.push(m);
        }
      }
    }
  };

  ws.onmessage = (event) => {
    lastPongReceivedAt = Date.now();
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "PONG": {
          lastPongReceivedAt = Date.now();
          if (state.isConnecting) {
            updateState((s) => ({ ...s, isConnecting: false }));
          }
          break;
        }

        case "ROOM_SNAPSHOT": {
          lastReadTimestamps[channelId] = Date.now();
          if (state.user) {
            savePersistedLastRead(state.user.id, lastReadTimestamps);
          }
          const snapshotMsgs: ChatMessage[] = data.messages || [];

          // Scan snapshot messages for any mentions of current user
          const snapshotMentions: MentionItem[] = [];
          if (state.user) {
            const ch = state.channels.find((c) => c.id === channelId);
            const chName = ch ? ch.name : channelId;
            for (const m of snapshotMsgs) {
              if (
                m.content &&
                m.senderId !== state.user.id &&
                isMentioningUser(m.content, state.user.username)
              ) {
                snapshotMentions.push({
                  id: m.id,
                  messageId: m.id,
                  roomId: m.roomId || channelId,
                  roomName: chName,
                  senderName: m.senderName,
                  content: m.content,
                  createdAt: m.createdAt,
                  parentId: m.parentId,
                  type: "mention",
                });
              }
            }
          }

          updateState((s) => {
            const existingIds = new Set(s.mentions.map((m) => m.id));
            const newMentions = snapshotMentions.filter((m) => !existingIds.has(m.id));
            const mergedMentions = [...newMentions, ...s.mentions].sort(
              (a, b) => b.createdAt - a.createdAt
            );

            if (newMentions.length > 0 && s.user) {
              savePersistedMentions(s.user.id, mergedMentions, s.unreadMentionsCount);
            }

            // Preserve any pending optimistic messages that haven't landed in SQLite yet
            const snapshotIds = new Set(snapshotMsgs.map((m) => m.id));
            const pendingOptimistic = s.messages.filter(
              (m) => pendingOutbox.some((p) => p.clientMsgId === m.id) && !snapshotIds.has(m.id)
            );
            const mergedMsgs = [...snapshotMsgs, ...pendingOptimistic];

            return {
              ...s,
              messages: mergedMsgs,
              participants: data.participants || [],
              mentions: mergedMentions,
            };
          });
          scrollChatToBottom();
          break;
        }

        case "NEW_MESSAGE": {
          const msg: ChatMessage = data.message;
          const isCurrentRoom = msg.roomId === state.activeChannelId;
          const currentUser = state.user;
          const isFromMe = Boolean(currentUser && msg.senderId === currentUser.id);

          // We ONLY notify and count if the message comes from SOMEONE ELSE!
          let isMentionForMe = false;
          let newMentionItem: MentionItem | null = null;

          if (currentUser && !isFromMe) {
            const ch = state.channels.find((c) => c.id === msg.roomId);
            const roomName = ch?.name || msg.roomId;

            // 1. Tagged / Mentioned with @username
            if (msg.content && isMentioningUser(msg.content, currentUser.username)) {
              isMentionForMe = true;
              newMentionItem = {
                id: msg.id,
                messageId: msg.id,
                roomId: msg.roomId,
                roomName,
                senderName: msg.senderName,
                content: msg.content,
                createdAt: msg.createdAt,
                parentId: msg.parentId,
                type: "mention",
              };
              showSlackAlertToast(
                `@${msg.senderName} mentioned you in #${roomName}`,
                msg.content,
                msg.roomId,
                msg.id,
                msg.parentId,
                "🔔"
              );
              document.title = `(🔔 1) Slack — #${roomName}`;
            }

            // 2. Someone replied to your thread / message
            const isMyThread = Boolean(
              msg.parentId &&
                (msg.parentSenderId === currentUser.id ||
                  state.messages.some((m) => m.id === msg.parentId && m.senderId === currentUser.id) ||
                  state.threadMessages.some((m) => m.id === msg.parentId && m.senderId === currentUser.id))
            );

            if (isMyThread && !isMentionForMe) {
              newMentionItem = {
                id: `reply_${msg.id}`,
                messageId: msg.id,
                roomId: msg.roomId,
                roomName,
                senderName: msg.senderName,
                content: `💬 Replied to your thread: "${msg.content}"`,
                createdAt: msg.createdAt,
                parentId: msg.parentId,
                type: "thread_reply",
              };
              showSlackAlertToast(
                `@${msg.senderName} replied to your thread in #${roomName}`,
                msg.content,
                msg.roomId,
                msg.id,
                msg.parentId,
                "💬"
              );
              document.title = `(💬 1) Slack — #${roomName}`;
            }
          }

          updateState((s) => {
            let nextMentions = s.mentions;
            let nextUnreadMentions = s.unreadMentionsCount;
            let nextChannelMentions = s.channelMentions;

            if (newMentionItem) {
              const exists = s.mentions.some(
                (m) => (m.messageId && m.messageId === newMentionItem!.messageId) || m.id === newMentionItem!.id
              );
              if (!exists) {
                nextMentions = [newMentionItem, ...s.mentions];
              }
              const isLookingAtThread = s.activeThreadParentId === msg.parentId;
              nextUnreadMentions =
                s.isViewingMentions || isLookingAtThread ? 0 : s.unreadMentionsCount + 1;

              nextChannelMentions = {
                ...s.channelMentions,
                [msg.roomId]: true,
              };
              if (s.user) {
                savePersistedMentions(s.user.id, nextMentions, nextUnreadMentions);
              }
            }

            if (isCurrentRoom) {
              lastReadTimestamps[msg.roomId] = Date.now();
              if (s.user) {
                savePersistedLastRead(s.user.id, lastReadTimestamps);
              }

              if (msg.parentId) {
                // Thread reply: update active thread and increment parent's replyCount
                const isMatchingActiveThread = s.activeThreadParentId === msg.parentId;
                const existsInThread = s.threadMessages.some((m) => m.id === msg.id);
                const nextThreadMessages = existsInThread
                  ? s.threadMessages.map((m) => (m.id === msg.id ? msg : m))
                  : isMatchingActiveThread
                  ? [...s.threadMessages, msg]
                  : s.threadMessages;

                const nextMessages = s.messages.map((m) => {
                  if (m.id === msg.parentId) {
                    return {
                      ...m,
                      replyCount: (m.replyCount || 0) + 1,
                      lastReplyAt: msg.createdAt,
                    };
                  }
                  return m;
                });

                return {
                  ...s,
                  mentions: nextMentions,
                  unreadMentionsCount: nextUnreadMentions,
                  channelMentions: nextChannelMentions,
                  messages: nextMessages,
                  threadMessages: nextThreadMessages,
                };
              } else {
                // Top-level channel message: deduplicate optimistic message by id
                const exists = s.messages.some((m) => m.id === msg.id);
                const nextMessages = exists
                  ? s.messages.map((m) => (m.id === msg.id ? msg : m))
                  : [...s.messages, msg];

                return {
                  ...s,
                  mentions: nextMentions,
                  unreadMentionsCount: nextUnreadMentions,
                  channelMentions: nextChannelMentions,
                  messages: nextMessages,
                };
              }
            } else {
              // Only increment unread count for other channel if NOT sent by me!
              const unreadDelta = !isFromMe ? 1 : 0;
              return {
                ...s,
                mentions: nextMentions,
                unreadMentionsCount: nextUnreadMentions,
                channelMentions: nextChannelMentions,
                unreadChannels: {
                  ...s.unreadChannels,
                  [msg.roomId]: (s.unreadChannels[msg.roomId] || 0) + unreadDelta,
                },
              };
            }
          });

          if (isCurrentRoom) {
            if (msg.parentId && state.activeThreadParentId === msg.parentId) {
              scrollThreadToBottom();
            } else if (!msg.parentId) {
              scrollChatToBottom();
            }
          }
          break;
        }

        case "REACTION_UPDATED": {
          const isActorMe = Boolean(state.user && data.actorId === state.user.id);

          const targetMsg =
            state.messages.find((m) => m.id === data.messageId) ||
            state.threadMessages.find((m) => m.id === data.messageId);

          const isTargetMine = Boolean(
            (data.targetSenderId && state.user && data.targetSenderId === state.user.id) ||
            (targetMsg && state.user && targetMsg.senderId === state.user.id)
          );

          let newReactionItem: MentionItem | null = null;

          if (state.user && !isActorMe && isTargetMine && data.action === "ADD") {
            const ch = state.channels.find((c) => c.id === data.roomId);
            const roomName = ch?.name || state.activeChannelId;
            const actorName =
              state.participants.find((p) => p.userId === data.actorId)?.username || "Someone";
            const snippet = data.targetSnippet || targetMsg?.content?.slice(0, 80) || "your message";

            newReactionItem = {
              id: `react_${data.messageId}_${data.actorId}_${data.emoji}`,
              messageId: data.messageId,
              roomId: data.roomId || state.activeChannelId,
              roomName,
              senderName: actorName,
              content: `Reacted ${data.emoji} to: "${snippet}"`,
              createdAt: Date.now(),
              parentId: targetMsg?.parentId,
              type: "reaction",
            };

            showSlackAlertToast(
              `@${actorName} reacted with ${data.emoji} to your message in #${roomName}`,
              `"${snippet}"`,
              data.roomId || state.activeChannelId,
              data.messageId,
              targetMsg?.parentId,
              data.emoji
            );
          }

          updateState((s) => {
            const updateList = (list: readonly ChatMessage[]) =>
              list.map((m) => {
                if (m.id !== data.messageId) return m;
                const currentReactions = { ...(m.reactions || {}) };
                if (data.userIds && data.userIds.length > 0) {
                  currentReactions[data.emoji] = data.userIds;
                } else {
                  delete currentReactions[data.emoji];
                }
                return { ...m, reactions: currentReactions };
              });

            let nextMentions = s.mentions;
            let nextUnreadMentions = s.unreadMentionsCount;

            if (newReactionItem) {
              const exists = s.mentions.some((m) => m.id === newReactionItem!.id);
              if (!exists) {
                nextMentions = [newReactionItem, ...s.mentions];
              }
              nextUnreadMentions = s.isViewingMentions ? 0 : s.unreadMentionsCount + 1;
              if (s.user) {
                savePersistedMentions(s.user.id, nextMentions, nextUnreadMentions);
              }
            }

            return {
              ...s,
              messages: updateList(s.messages),
              threadMessages: updateList(s.threadMessages),
              mentions: nextMentions,
              unreadMentionsCount: nextUnreadMentions,
            };
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

        case "ERROR": {
          if (data.error === "FORBIDDEN" || data.message?.includes("Access Denied")) {
            updateState((s) => ({ ...s, isChannelForbidden: true, isConnecting: false }));
          }
          break;
        }
      }
    } catch (e) {
      console.error("WS Parse error", e);
    }
  };

  ws.onclose = (event) => {
    stopHeartbeat();
    if (event.code === 4403 || event.code === 1008 || (!isPublic && !state.channels.some((c) => c.id === channelId))) {
      updateState((s) => ({ ...s, isConnecting: false, isChannelForbidden: true }));
    } else {
      updateState((s) => ({ ...s, isConnecting: true }));
      scheduleReconnect(channelId, token);
    }
  };

  ws.onerror = (e) => {
    console.warn("WebSocket error:", e);
    stopHeartbeat();
    if (!isPublic && !state.channels.some((c) => c.id === channelId)) {
      updateState((s) => ({ ...s, isConnecting: false, isChannelForbidden: true }));
    } else {
      updateState((s) => ({ ...s, isConnecting: true }));
      scheduleReconnect(channelId, token);
    }
  };
};

const sendChatMessage = (content: string, parentId?: string): void => {
  const trimmed = content.trim();
  const attachment = parentId ? state.threadPendingAttachment : state.pendingAttachment;
  if (trimmed.length === 0 && !attachment) return;

  const clientMsgId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const outboxItem: OutboxMessage = {
    clientMsgId,
    content: trimmed,
    attachment: attachment || undefined,
    parentId,
    channelId: state.activeChannelId,
    sentAt: Date.now(),
  };

  const currentUser = state.user;
  const optimisticMsg: ChatMessage = {
    id: clientMsgId,
    roomId: state.activeChannelId,
    senderId: currentUser?.id || "me",
    senderName: currentUser?.username || "You",
    content: trimmed,
    attachment: attachment || undefined,
    parentId,
    createdAt: Date.now(),
  };

  // Immediate optimistic update so user sees message instantly without waiting
  if (parentId) {
    updateState((s) => ({
      ...s,
      threadMessages: [...s.threadMessages, optimisticMsg],
      messages: s.messages.map((m) =>
        m.id === parentId
          ? { ...m, replyCount: (m.replyCount || 0) + 1, lastReplyAt: Date.now() }
          : m
      ),
    }));
    scrollThreadToBottom();
  } else {
    updateState((s) => ({
      ...s,
      messages: [...s.messages, optimisticMsg],
    }));
    scrollChatToBottom();
  }

  // Active channel read status kept up to date
  lastReadTimestamps[state.activeChannelId] = Date.now();
  if (currentUser) {
    savePersistedLastRead(currentUser.id, lastReadTimestamps);
  }

  const isStale = Date.now() - lastPongReceivedAt > 15000;
  const isOpen = Boolean(activeSocket && activeSocket.readyState === WebSocket.OPEN);

  if (isOpen && !isStale) {
    try {
      activeSocket!.send(
        JSON.stringify({
          type: "SEND_MESSAGE",
          content: trimmed,
          attachment: attachment || undefined,
          parentId,
          tempId: clientMsgId,
        })
      );
    } catch (err) {
      console.warn("Socket send failed, queueing message in outbox:", err);
      pendingOutbox.push(outboxItem);
      checkAndHealWebSocket();
    }
  } else {
    pendingOutbox.push(outboxItem);
    connectWebSocket(state.activeChannelId, state.token || "");
  }

  if (parentId) {
    const nextDrafts = { ...state.drafts };
    delete nextDrafts[`thread:${parentId}`];
    state = { ...state, drafts: nextDrafts };
    if (state.threadPendingAttachment || state.showThreadEmojiPicker) {
      updateState((s) => ({
        ...s,
        threadPendingAttachment: null,
        showThreadEmojiPicker: false,
      }));
    }
  } else {
    const nextDrafts = { ...state.drafts };
    delete nextDrafts[state.activeChannelId];
    state = { ...state, drafts: nextDrafts };
    sendTypingSignal(false);
    if (state.pendingAttachment || state.showEmojiPicker || state.mentionQuery !== null) {
      updateState((s) => ({
        ...s,
        pendingAttachment: null,
        showEmojiPicker: false,
        mentionQuery: null,
      }));
    }
  }
};

const submitCurrentMessage = (): void => {
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const content = chatInput ? chatInput.value : (state.drafts[state.activeChannelId] || "");

  if (content.trim().length === 0 && !state.pendingAttachment) return;

  sendChatMessage(content);
  if (chatInput) {
    chatInput.value = "";
    chatInput.style.height = "auto";
    chatInput.focus();
  }
};

const submitThreadMessage = (): void => {
  if (!state.activeThreadParentId) return;
  const threadInput = document.getElementById("thread-chat-input") as HTMLTextAreaElement | null;
  const content = threadInput ? threadInput.value : (state.drafts[`thread:${state.activeThreadParentId}`] || "");

  if (content.trim().length === 0 && !state.threadPendingAttachment) return;

  sendChatMessage(content, state.activeThreadParentId);
  if (threadInput) {
    threadInput.value = "";
    threadInput.style.height = "auto";
    threadInput.focus();
  }
};

const openThread = async (
  parentId: string,
  channelId?: string,
  highlightMessageId?: string,
  preloadedRoot?: ChatMessage | null,
  preloadedReplies?: readonly ChatMessage[]
): Promise<void> => {
  const targetChannel = channelId || state.activeChannelId;

  if (state.activeChannelId !== targetChannel) {
    switchChannel(targetChannel);
    await new Promise((r) => setTimeout(r, 120));
  }

  const hasPreloaded = Array.isArray(preloadedReplies) && preloadedReplies.length > 0;

  updateState((s) => {
    const rootMsg = preloadedRoot;
    const nextMessages =
      rootMsg && !s.messages.some((m) => m.id === rootMsg.id)
        ? [rootMsg, ...s.messages]
        : s.messages;

    return {
      ...s,
      isViewingMentions: false,
      activeChannelId: targetChannel,
      activeThreadParentId: parentId,
      threadMessages: hasPreloaded ? preloadedReplies! : [],
      messages: nextMessages,
      isThreadLoading: !hasPreloaded,
      showEmojiPicker: false,
      showThreadEmojiPicker: false,
    };
  });

  const scrollAndHighlight = (targetId: string) => {
    setTimeout(() => {
      const pane = document.getElementById("thread-pane");
      const el = (pane?.querySelector(`[data-message-id="${targetId}"]`) ||
        pane?.querySelector(`#msg-${targetId}`)) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("highlight-flash");
        void el.offsetWidth;
        el.classList.add("highlight-flash");
      } else {
        scrollThreadToBottom();
      }
    }, 180);
  };

  const targetId = highlightMessageId || parentId;

  if (hasPreloaded) {
    scrollAndHighlight(targetId);
    return;
  }

  try {
    const res = await fetch(
      `/api/channels/${encodeURIComponent(targetChannel)}/messages?token=${encodeURIComponent(state.token || "")}&parentId=${encodeURIComponent(parentId)}`
    );
    if (res.ok) {
      const data = await res.json();
      updateState((s) => {
        const rootMsg = data.rootMessage || preloadedRoot;
        const nextMessages =
          rootMsg && !s.messages.some((m) => m.id === rootMsg.id)
            ? [rootMsg, ...s.messages]
            : s.messages;
        return {
          ...s,
          messages: nextMessages,
          threadMessages: data.messages || [],
          isThreadLoading: false,
        };
      });
      scrollAndHighlight(targetId);
    } else {
      updateState((s) => ({ ...s, isThreadLoading: false }));
    }
  } catch (err) {
    console.error("Failed to load thread messages:", err);
    updateState((s) => ({ ...s, isThreadLoading: false }));
  }
};

const closeThread = (): void => {
  updateState((s) => ({
    ...s,
    activeThreadParentId: null,
    threadMessages: [],
    showThreadEmojiPicker: false,
    threadPendingAttachment: null,
  }));
};

const scrollThreadToBottom = (): void => {
  const threadStream = document.getElementById("thread-messages-stream");
  if (threadStream) {
    threadStream.scrollTop = threadStream.scrollHeight;
  }
};

const insertEmojiIntoInput = (emoji: string, target: "main" | "thread"): void => {
  const inputId = target === "main" ? "chat-input" : "thread-chat-input";
  const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
  const draftKey = target === "main" ? state.activeChannelId : `thread:${state.activeThreadParentId}`;

  const currentVal = input ? input.value : state.drafts[draftKey] || "";
  const start = input ? input.selectionStart : currentVal.length;
  const end = input ? input.selectionEnd : currentVal.length;

  const nextVal = currentVal.substring(0, start) + emoji + currentVal.substring(end);
  const nextPos = start + emoji.length;

  // Update in drafts
  state = {
    ...state,
    drafts: {
      ...state.drafts,
      [draftKey]: nextVal,
    },
  };

  if (input) {
    input.value = nextVal;
    input.selectionStart = input.selectionEnd = nextPos;
    input.focus();
  }
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
  const container = document.getElementById("messages-stream");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
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

const formatMessageText = (rawContent: string, currentUsername?: string): string => {
  let safe = escapeHtml(rawContent);

  // Auto-link URLs
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  safe = safe.replace(urlRegex, (url) => {
    const inviteMatch = url.match(/#invite=([a-zA-Z0-9_-]+)/);
    if (inviteMatch) {
      const code = inviteMatch[1];
      return `<a href="${url}" class="invite-badge-link" data-invite-code="${code}" title="Join Channel">🔑 Join Channel #${code}</a>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
  });

  // User mentions (@username)
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  safe = safe.replace(mentionRegex, (_match, username) => {
    const isMe = currentUsername && username.toLowerCase() === currentUsername.toLowerCase();
    return `<span class="mention-tag ${isMe ? "mention-me" : ""}">@${username}</span>`;
  });

  // Basic Slack markdown
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>');
  safe = safe.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
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
        const isPublic = state.activeChannelId === "general" || state.activeChannelId === "random";
        const isMember = isPublic || (data.user.joinedChannels as ChannelInfo[]).some((c) => c.id === state.activeChannelId);

        updateState((s) => ({
          ...s,
          channels: data.user.joinedChannels,
          isChannelForbidden: !isMember && data.user.joinedChannels.length > 0,
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
    const userMentions = loadPersistedMentions(data.user.id);

    updateState((s) => ({
      ...s,
      token: data.token,
      user: { id: data.user.id, username: data.user.username },
      channels: data.user.joinedChannels || s.channels,
      mentions: userMentions.mentions,
      unreadMentionsCount: userMentions.unreadCount,
      authError: null,
    }));

    checkHashRoute();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    updateState((s) => ({ ...s, authError: message }));
  }
};

const handleGuestLogin = async (): Promise<void> => {
  updateState((s) => ({ ...s, authError: null }));

  try {
    // 1. Try login with public guest account
    let res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "guest", password: "guest123" }),
    });

    // 2. If guest user does not exist yet in database, automatically create it!
    if (!res.ok) {
      res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "guest", password: "guest123" }),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      updateState((s) => ({ ...s, authError: data.error || "Guest login failed" }));
      return;
    }

    savePersistedAuth(data.token, { id: data.user.id, username: data.user.username });
    const guestMentions = loadPersistedMentions(data.user.id);

    updateState((s) => ({
      ...s,
      token: data.token,
      user: { id: data.user.id, username: data.user.username },
      channels: data.user.joinedChannels || s.channels,
      mentions: guestMentions.mentions,
      unreadMentionsCount: guestMentions.unreadCount,
      authError: null,
    }));

    checkHashRoute();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Guest login failed";
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

    const data = await res.json();
    if (res.ok) {
      const channel: ChannelInfo = data.channel;
      const exists = state.channels.some((c) => c.id === channel.id);

      updateState((s) => ({
        ...s,
        channels: exists ? s.channels : [...s.channels, channel],
        activeChannelId: channel.id,
        isChannelForbidden: false,
      }));

      window.location.hash = `channel=${channel.id}`;
      connectWebSocket(channel.id, state.token);
    } else {
      alert(data.error || "Invalid or expired invite code.");
    }
  } catch (err) {
    console.error("Direct invite join error:", err);
    alert("Could not join channel. Please check your network.");
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
  if (state.activeChannelId === channelId && !state.isChannelForbidden && !state.isViewingMentions) return;

  // Clear unread badge and mention badge for this channel
  const nextUnread = { ...state.unreadChannels };
  delete nextUnread[channelId];
  const nextChannelMentions = { ...state.channelMentions };
  delete nextChannelMentions[channelId];
  lastReadTimestamps[channelId] = Date.now();
  if (state.user) {
    savePersistedLastRead(state.user.id, lastReadTimestamps);
  }

  document.title = "Slack — Durable Objects";
  isInternalHashChange = true;
  window.location.hash = `channel=${channelId}`;

  const isPublic = channelId === "general" || channelId === "random";
  const isMember = isPublic || state.channels.some((c) => c.id === channelId);

  updateState((s) => ({
    ...s,
    activeChannelId: channelId,
    messages: [], // Clear old channel's messages immediately!
    activeThreadParentId: null, // CLOSE the thread pane so other channels' threads don't linger!
    threadMessages: [],
    isThreadLoading: false,
    threadPendingAttachment: null,
    pendingAttachment: null,
    showEmojiPicker: false,
    showThreadEmojiPicker: false,
    isViewingMentions: false,
    isChannelForbidden: !isMember && state.channels.length > 0,
    mentionQuery: null,
    unreadChannels: nextUnread,
    channelMentions: nextChannelMentions,
  }));

  if (state.token) connectWebSocket(channelId, state.token);
};

const checkHashRoute = (): void => {
  if (isInternalHashChange) {
    isInternalHashChange = false;
    return;
  }
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);

  const inviteCode = params.get("invite");
  if (inviteCode && state.user && state.token) {
    joinInviteCodeDirectly(inviteCode);
    return;
  }

  const channelId = params.get("channel");
  if (channelId) {
    if (channelId === state.activeChannelId && !state.isChannelForbidden && !state.isViewingMentions) return;

    const isPublic = channelId === "general" || channelId === "random";
    const isMember = isPublic || state.channels.some((c) => c.id === channelId);

    const nextUnread = { ...state.unreadChannels };
    delete nextUnread[channelId];
    const nextChannelMentions = { ...state.channelMentions };
    delete nextChannelMentions[channelId];
    lastReadTimestamps[channelId] = Date.now();
    if (state.user) {
      savePersistedLastRead(state.user.id, lastReadTimestamps);
    }

    updateState((s) => ({
      ...s,
      activeChannelId: channelId,
      messages: [],
      activeThreadParentId: null, // CLOSE thread pane on route change!
      threadMessages: [],
      isThreadLoading: false,
      isViewingMentions: false,
      isChannelForbidden: !isMember && state.channels.length > 0,
      unreadChannels: nextUnread,
      channelMentions: nextChannelMentions,
    }));
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

    // Refocus the textarea after file selection
    const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
    if (chatInput) chatInput.focus();
  };
  reader.readAsDataURL(file);
};

const handleThreadFileUpload = (file: File): void => {
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
    updateState((s) => ({ ...s, threadPendingAttachment: attachment }));

    const threadInput = document.getElementById("thread-chat-input") as HTMLTextAreaElement | null;
    if (threadInput) threadInput.focus();
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

        <div class="auth-divider"><span>OR</span></div>

        <button type="button" id="guest-login-btn" class="auth-guest-btn">
          <span>⚡ Explore as Guest (1-Click)</span>
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

const renderEmojiPopover = (target: "main" | "thread"): string => {
  const categories: readonly { readonly id: AppState["emojiCategory"]; readonly label: string }[] = [
    { id: "all", label: "All" },
    { id: "smileys", label: "Smileys" },
    { id: "gestures", label: "Hands" },
    { id: "hearts", label: "Hearts" },
    { id: "objects", label: "Things" },
    { id: "food", label: "Food" },
  ];

  const search = state.emojiSearchQuery.toLowerCase().trim();
  const filtered = EMOJI_CATALOG.filter((e) => {
    const matchCat = state.emojiCategory === "all" || e.category === state.emojiCategory;
    const matchSearch = !search || e.name.toLowerCase().includes(search) || e.emoji === search;
    return matchCat && matchSearch;
  });

  const searchInputId = target === "main" ? "emoji-search-input" : "thread-emoji-search-input";
  const popoverId = target === "main" ? "emoji-popover" : "thread-emoji-popover";

  return `
    <div class="emoji-popover" id="${popoverId}">
      <div class="emoji-popover-header">
        <input
          type="text"
          id="${searchInputId}"
          class="emoji-search-box"
          placeholder="Search 140+ emojis..."
          value="${escapeHtml(state.emojiSearchQuery)}"
          autocomplete="off"
        />
      </div>

      <div class="emoji-category-bar">
        ${categories
          .map(
            (c) => `
          <button
            type="button"
            class="emoji-cat-btn ${state.emojiCategory === c.id ? "active" : ""}"
            data-category="${c.id}"
          >
            ${c.label}
          </button>
        `
          )
          .join("")}
      </div>

      <div class="emoji-grid">
        ${
          filtered.length === 0
            ? `<div class="emoji-empty-msg">No matching emojis</div>`
            : filtered
                .map(
                  (e) => `
                <button
                  type="button"
                  class="emoji-item-btn"
                  data-target="${target}"
                  data-insert-emoji="${e.emoji}"
                  title="${escapeHtml(e.name)}"
                >
                  ${e.emoji}
                </button>
              `
                )
                .join("")
        }
      </div>
    </div>
  `;
};

const renderMessage = (msg: ChatMessage, isThreadView = false): string => {
  const avatarBg = getAvatarGradient(msg.senderName);
  const initials = getInitials(msg.senderName);
  const reactions = msg.reactions || {};

  const isMentioned = Boolean(
    state.user &&
      msg.content &&
      msg.content.toLowerCase().includes(`@${state.user.username.toLowerCase()}`)
  );

  return `
    <div class="message-item ${isMentioned ? "is-mentioned" : ""}" id="msg-${msg.id}" data-message-id="${msg.id}">
      <!-- Slack Floating Action Bar on Hover -->
      <div class="message-action-bar">
        ${QUICK_REACTIONS.map(
          (emoji) => `
          <button type="button" class="reaction-quick-btn" data-msg-id="${msg.id}" data-emoji="${emoji}" title="React ${emoji}">
            ${emoji}
          </button>
        `
        ).join("")}
        ${
          !isThreadView
            ? `
          <button type="button" class="reply-thread-action-btn" data-thread-msg-id="${msg.id}" title="Reply in thread">
            <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/></svg>
          </button>
        `
            : ""
        }
      </div>

      <div class="message-avatar" style="background: ${avatarBg};">
        ${initials}
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">${escapeHtml(msg.senderName)}</span>
          <span class="message-timestamp">${formatTime(msg.createdAt)}</span>
        </div>
        ${msg.content ? `<div class="message-content">${formatMessageText(msg.content, state.user?.username)}</div>` : ""}
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

        <!-- Slack Thread Reply Pill (Only on top-level message) -->
        ${
          !isThreadView && msg.replyCount && msg.replyCount > 0
            ? `
            <button type="button" class="thread-pill-btn" data-thread-msg-id="${msg.id}">
              <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/></svg>
              <span class="thread-pill-count">${msg.replyCount} ${msg.replyCount === 1 ? "reply" : "replies"}</span>
              ${msg.lastReplyAt ? `<span class="thread-pill-time">Last reply ${formatRelativeTime(msg.lastReplyAt)}</span>` : ""}
            </button>
          `
            : ""
        }
      </div>
    </div>
  `;
};

const renderThreadPanel = (): string => {
  if (!state.activeThreadParentId) return "";
  const rootMsg = state.messages.find((m) => m.id === state.activeThreadParentId);
  const currentChannel = state.channels.find((c) => c.id === state.activeChannelId);

  return `
    <aside class="thread-pane" id="thread-pane">
      <div class="thread-header">
        <div class="thread-header-title">
          <h3>Thread</h3>
          <span class="thread-sub-badge">#${escapeHtml(currentChannel?.name || state.activeChannelId)}</span>
        </div>
        <button type="button" id="thread-close-btn" class="thread-close-btn" title="Close thread">&times;</button>
      </div>

      <div class="thread-replies-stream" id="thread-messages-stream">
        ${
          rootMsg
            ? `
          <div class="thread-root-card">
            ${renderMessage(rootMsg, true)}
          </div>
          <div class="thread-divider">
            <span>${state.threadMessages.length} ${state.threadMessages.length === 1 ? "reply" : "replies"}</span>
          </div>
        `
            : state.isThreadLoading
            ? `
          <div class="thread-root-card" style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
            <div style="margin-bottom: 6px;">⏳</div>
            Loading thread conversation...
          </div>
        `
            : ""
        }

        ${
          state.isThreadLoading
            ? `<div class="thread-loading">Loading thread messages...</div>`
            : state.threadMessages.map((m) => renderMessage(m, true)).join("")
        }
      </div>

      <!-- Thread Composer -->
      <div class="thread-composer-wrap">
        <form id="thread-chat-form" class="composer-box">
          ${
            state.threadPendingAttachment
              ? `
            <div class="composer-attachment-preview">
              ${
                state.threadPendingAttachment.type.startsWith("image/")
                  ? `<img src="${state.threadPendingAttachment.dataUrl}" class="composer-attachment-thumb" />`
                  : `<span>📄</span>`
              }
              <span class="composer-attachment-name">${escapeHtml(state.threadPendingAttachment.name)} (${formatFileSize(state.threadPendingAttachment.size)})</span>
              <button type="button" id="thread-remove-attachment-btn" class="composer-attachment-remove" title="Remove">&times;</button>
            </div>
          `
              : ""
          }

          <textarea
            id="thread-chat-input"
            class="composer-textarea"
            placeholder="Reply in thread... (Shift+Enter for new line)"
            rows="1"
          >${escapeHtml(state.drafts[`thread:${state.activeThreadParentId}`] || "")}</textarea>

          <div class="composer-toolbar">
            <div class="toolbar-group">
              <input type="file" id="thread-file-input" style="display:none;" />
              <button type="button" id="thread-attach-file-btn" class="toolbar-btn" title="Attach file or image">
                <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
              </button>
              <button type="button" id="thread-toggle-emoji-btn" class="toolbar-btn" title="Add emoji">
                😊
              </button>
            </div>
            <div class="toolbar-group">
              <button type="submit" id="thread-send-btn" class="send-btn" title="Reply (Enter)">
                <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </div>
        </form>

        ${state.showThreadEmojiPicker ? renderEmojiPopover("thread") : ""}
      </div>
    </aside>
  `;
};

const renderMentionsPane = (): string => `
  <section class="mentions-pane" id="mentions-pane">
    ${
      state.alertToast
        ? `
        <div class="slack-alert-toast" id="slack-alert-banner" data-channel-id="${state.alertToast.channelId}" data-message-id="${state.alertToast.messageId || ""}" data-parent-id="${state.alertToast.parentId || ""}">
          <div class="slack-alert-icon">${state.alertToast.icon || "🔔"}</div>
          <div class="slack-alert-content">
            <span class="slack-alert-title">${escapeHtml(state.alertToast.title)}</span>
            <span class="slack-alert-snippet">${escapeHtml(state.alertToast.snippet)}</span>
          </div>
          <button type="button" class="slack-alert-close" id="close-alert-toast" title="Dismiss">&times;</button>
        </div>
      `
        : ""
    }
    <header class="mentions-header">
      <h2><span>🔔</span> Mentions & Reactions</h2>
      <button type="button" id="close-mentions-btn" class="thread-close-btn" title="Close and return to chat">&times;</button>
    </header>
    <div class="mentions-list">
      ${
        state.mentions.length === 0
          ? `
          <div style="margin: auto; text-align: center; color: var(--text-muted); padding: 60px 20px;">
            <div style="font-size: 36px; margin-bottom: 12px;">🔔</div>
            <h3 style="color: #fff; margin-bottom: 6px;">No mentions yet</h3>
            <p>When someone mentions you with @${escapeHtml(state.user?.username || "username")}, you'll find it here.</p>
          </div>
        `
          : state.mentions
              .map(
                (m) => `
          <div class="mention-card" data-channel-id="${m.roomId}" data-message-id="${m.messageId || m.id}" data-parent-id="${m.parentId || ""}">
            <div class="mention-card-meta">
              <span class="mention-card-channel">#${escapeHtml(m.roomName)}</span>
              <span class="mention-card-badge ${m.type || "mention"}">${m.type === "thread_reply" ? "Thread reply" : m.type === "reaction" ? "Reaction" : "Mention"}</span>
              <span class="mention-card-time">${formatRelativeTime(m.createdAt)}</span>
            </div>
            <div class="mention-card-header">
              <div class="avatar" style="width:24px;height:24px;font-size:11px;background:${getAvatarGradient(m.senderName)};">
                ${getInitials(m.senderName)}
              </div>
              <span class="mention-card-sender">${escapeHtml(m.senderName)}</span>
            </div>
            <div class="mention-card-body">
              ${formatMessageText(m.content, state.user?.username)}
            </div>
          </div>
        `
              )
              .join("")
      }
    </div>
  </section>
`;

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

  // Mention autocomplete candidates
  const mentionCandidates = state.mentionQuery !== null
    ? state.participants.filter(
        (p) =>
          p.username.toLowerCase().startsWith(state.mentionQuery!.toLowerCase()) &&
          p.username !== state.user?.username
      )
    : [];

  return `
    <div class="slack-container">
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="workspace-title">
            <div class="workspace-logo-badge">#</div>
            <div class="workspace-info">
              <h2>Slack DO</h2>
              ${
                state.isConnecting
                  ? `<span><span class="pulse-dot reconnecting"></span> Reconnecting...</span>`
                  : `<span><span class="pulse-dot"></span> Online</span>`
              }
            </div>
          </div>
        </div>

        <div class="sidebar-content">
          <!-- Sidebar Activity Section: Bell icon like Slack -->
          <div class="sidebar-activity-section">
            <button
              type="button"
              id="open-mentions-btn"
              class="activity-nav-item ${state.isViewingMentions ? "active" : ""}"
              title="Mentions & Reactions"
            >
              <span class="activity-icon">🔔</span>
              <span class="activity-label">Mentions & Reactions</span>
              ${
                state.unreadMentionsCount > 0
                  ? `<span class="activity-badge">${state.unreadMentionsCount}</span>`
                  : ""
              }
            </button>
          </div>

          <div>
            <div class="channel-section-header">
              <span>Channels</span>
              <button type="button" id="open-create-channel" class="section-action-btn" title="Create Channel">
                <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </button>
            </div>

            <nav class="channel-list" aria-label="Channels">
              ${state.channels
                .map((ch) => {
                  const unread = state.unreadChannels[ch.id] || 0;
                  const hasMention = !!state.channelMentions[ch.id];
                  const isActive = !state.isViewingMentions && ch.id === state.activeChannelId;
                  return `
                    <a
                      href="#channel=${ch.id}"
                      class="channel-item ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""} ${hasMention ? "has-mention" : ""}"
                      data-channel-id="${ch.id}"
                    >
                      <span class="channel-hash">#</span>
                      <span class="channel-name">${escapeHtml(ch.name)}</span>
                      ${
                        hasMention
                          ? `<span class="channel-mention-badge">@</span>`
                          : unread > 0
                          ? `<span class="channel-unread-badge">${unread}</span>`
                          : ""
                      }
                    </a>
                  `;
                })
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

      <!-- Main Content Area: Either Mentions View or Channel Chat -->
      ${
        state.isViewingMentions
          ? renderMentionsPane()
          : `
      <section class="chat-pane" id="chat-pane-container">
        <!-- Floating Alert Banner -->
        ${
          state.alertToast
            ? `
            <div class="slack-alert-toast" id="slack-alert-banner" data-channel-id="${state.alertToast.channelId}" data-message-id="${state.alertToast.messageId || ""}" data-parent-id="${state.alertToast.parentId || ""}">
              <div class="slack-alert-icon">${state.alertToast.icon || "🔔"}</div>
              <div class="slack-alert-content">
                <span class="slack-alert-title">${escapeHtml(state.alertToast.title)}</span>
                <span class="slack-alert-snippet">${escapeHtml(state.alertToast.snippet)}</span>
              </div>
              <button type="button" class="slack-alert-close" id="close-alert-toast" title="Dismiss">&times;</button>
            </div>
          `
            : ""
        }

        <!-- Channel Top Bar -->
        ${
          state.isChannelForbidden
            ? `
            <header class="chat-header">
              <div class="channel-meta">
                <div class="channel-header-title">
                  <h2>🔒 #${escapeHtml(currentChannel.name || state.activeChannelId)}</h2>
                </div>
                <span class="online-badge" style="background: rgba(224, 30, 90, 0.15); color: #f43f5e; border-color: rgba(224, 30, 90, 0.3);">
                  🔒 Private Channel
                </span>
              </div>
            </header>

            <!-- Private Channel Lock Barrier -->
            <div class="private-channel-lock-screen">
              <div class="lock-icon">🔒</div>
              <h2>This Channel is Private</h2>
              <p>
                You are not an authorized member of <strong>#${escapeHtml(currentChannel.name || state.activeChannelId)}</strong>.
                All conversations are protected with enterprise AES-256-GCM encryption.
                Please enter a valid invite code or use an invite link to join.
              </p>
              <form id="lock-join-form" class="lock-join-form">
                <input
                  type="text"
                  id="lock-invite-code"
                  placeholder="Enter Channel Invite Code"
                  required
                  autocomplete="off"
                />
                <button type="submit" class="primary-btn" style="padding: 10px 18px; white-space: nowrap;">
                  Unlock & Join
                </button>
              </form>
              <button type="button" id="lock-back-general" class="secondary-btn" style="margin-top: 10px; padding: 8px 16px;">
                Return to #general
              </button>
            </div>
          `
            : `
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
                  : state.messages.map((m) => renderMessage(m, false)).join("")
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

            <!-- Composer Box -->
            <div class="chat-composer-container">
              <!-- Mention Autocomplete Menu -->
              ${
                mentionCandidates.length > 0
                  ? `
                  <div class="mention-autocomplete-menu" id="mention-menu">
                    ${mentionCandidates
                      .map(
                        (p) => `
                      <button type="button" class="mention-option-btn" data-mention-username="${escapeHtml(p.username)}">
                        <span>@</span>
                        <span>${escapeHtml(p.username)}</span>
                      </button>
                    `
                      )
                      .join("")}
                  </div>
                `
                  : ""
              }

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
                      <button type="button" id="remove-attachment-btn" class="composer-attachment-remove" title="Remove">&times;</button>
                    </div>
                  `
                    : ""
                }

                <textarea
                  id="chat-input"
                  class="composer-textarea"
                  placeholder="Message #${escapeHtml(currentChannel.name)} (Type @ to mention)"
                  rows="1"
                >${escapeHtml(state.drafts[state.activeChannelId] || "")}</textarea>

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
                    <button type="submit" id="send-msg-btn" class="send-btn" title="Send message (Enter)">
                      <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                  </div>
                </div>
              </form>

              <!-- Emoji Popover -->
              ${state.showEmojiPicker ? renderEmojiPopover("main") : ""}
            </div>
          `
        }
      </section>
        `
      }

      <!-- Slack Thread Side Panel (if open) -->
      ${!state.isViewingMentions && state.activeThreadParentId ? renderThreadPanel() : ""}
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
  const guestBtn = document.getElementById("guest-login-btn");

  if (tabLogin) tabLogin.onclick = () => updateState((s) => ({ ...s, authMode: "login", authError: null }));
  if (tabRegister) tabRegister.onclick = () => updateState((s) => ({ ...s, authMode: "register", authError: null }));
  if (authForm) authForm.onsubmit = handleAuthSubmit;
  if (guestBtn) guestBtn.onclick = handleGuestLogin;

  // App Events
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      stopHeartbeat();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      pendingOutbox = [];
      lastReadTimestamps = {};
      clearPersistedAuth();
      if (activeSocket) {
        activeSocket.onclose = null;
        activeSocket.onerror = null;
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

  // Sidebar Mentions & Reactions Navigation
  const openMentionsBtn = document.getElementById("open-mentions-btn");
  if (openMentionsBtn) {
    openMentionsBtn.onclick = () => {
      updateState((s) => {
        if (s.user) {
          savePersistedMentions(s.user.id, s.mentions, 0);
        }
        return {
          ...s,
          isViewingMentions: !s.isViewingMentions,
          unreadMentionsCount: 0, // Highlight turns off when seen like Slack!
          activeThreadParentId: null,
          threadMessages: [],
          showEmojiPicker: false,
          showThreadEmojiPicker: false,
        };
      });
    };
  }

  // Close Mentions View Button
  const closeMentionsBtn = document.getElementById("close-mentions-btn");
  if (closeMentionsBtn) {
    closeMentionsBtn.onclick = () => {
      updateState((s) => ({
        ...s,
        isViewingMentions: false,
      }));
    };
  }

  // Mention Cards in Mentions Pane: Jump directly to message or open thread!
  const mentionCards = document.querySelectorAll<HTMLElement>(".mention-card");
  mentionCards.forEach((card) => {
    card.onclick = () => {
      const chId = card.getAttribute("data-channel-id");
      const msgId = card.getAttribute("data-message-id");
      const parentId = card.getAttribute("data-parent-id") || undefined;
      if (chId && msgId) {
        navigateToMessage(chId, msgId, parentId);
      } else if (chId) {
        switchChannel(chId);
      }
    };
  });

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

  // Alert Banner Click to jump directly to message/thread or dismiss
  const alertBanner = document.getElementById("slack-alert-banner");
  if (alertBanner) {
    alertBanner.onclick = (e) => {
      if ((e.target as HTMLElement).closest(".slack-alert-close")) {
        updateState((s) => ({ ...s, alertToast: null }));
        return;
      }
      const chId = alertBanner.getAttribute("data-channel-id");
      const msgId = alertBanner.getAttribute("data-message-id") || undefined;
      const parentId = alertBanner.getAttribute("data-parent-id") || undefined;
      if (chId && msgId) {
        navigateToMessage(chId, msgId, parentId);
      } else if (chId) {
        switchChannel(chId);
      }
      updateState((s) => ({ ...s, alertToast: null }));
    };
  }

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

  // Lock Barrier Form & Back Button
  const lockJoinForm = document.getElementById("lock-join-form");
  if (lockJoinForm) {
    lockJoinForm.onsubmit = (e) => {
      e.preventDefault();
      const codeInput = document.getElementById("lock-invite-code") as HTMLInputElement | null;
      const code = codeInput?.value?.trim();
      if (code) joinInviteCodeDirectly(code);
    };
  }

  const lockBackGeneral = document.getElementById("lock-back-general");
  if (lockBackGeneral) {
    lockBackGeneral.onclick = () => {
      switchChannel("general");
    };
  }

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

  // Reply in Thread Button on Top-Level Messages
  const replyThreadBtns = document.querySelectorAll<HTMLElement>(".reply-thread-action-btn");
  replyThreadBtns.forEach((btn) => {
    btn.onclick = () => {
      const msgId = btn.getAttribute("data-thread-msg-id");
      if (msgId) openThread(msgId);
    };
  });

  // Thread Reply Count Pill on Top-Level Messages
  const threadPillBtns = document.querySelectorAll<HTMLElement>(".thread-pill-btn");
  threadPillBtns.forEach((btn) => {
    btn.onclick = () => {
      const msgId = btn.getAttribute("data-thread-msg-id");
      if (msgId) openThread(msgId);
    };
  });

  // Thread Side Panel Controls
  const threadCloseBtn = document.getElementById("thread-close-btn");
  if (threadCloseBtn) threadCloseBtn.onclick = closeThread;

  const threadChatForm = document.getElementById("thread-chat-form");
  const threadChatInput = document.getElementById("thread-chat-input") as HTMLTextAreaElement | null;

  if (threadChatForm && threadChatInput) {
    threadChatForm.onsubmit = (e) => {
      e.preventDefault();
      submitThreadMessage();
    };

    threadChatInput.onfocus = () => {
      if (Date.now() - lastPongReceivedAt > 12000 || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
        checkAndHealWebSocket();
      }
    };

    threadChatInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitThreadMessage();
      }
    };

    threadChatInput.oninput = () => {
      threadChatInput.style.height = "auto";
      threadChatInput.style.height = Math.min(threadChatInput.scrollHeight, 140) + "px";
      if (state.activeThreadParentId) {
        state = {
          ...state,
          drafts: {
            ...state.drafts,
            [`thread:${state.activeThreadParentId}`]: threadChatInput.value,
          },
        };
      }
    };
  }

  // Thread Emoji Toggle
  const threadToggleEmojiBtn = document.getElementById("thread-toggle-emoji-btn");
  if (threadToggleEmojiBtn) {
    threadToggleEmojiBtn.onclick = (e) => {
      e.stopPropagation();
      updateState((s) => ({
        ...s,
        showThreadEmojiPicker: !s.showThreadEmojiPicker,
        showEmojiPicker: false,
      }));
    };
  }

  // Thread File Upload Attachment
  const threadAttachFileBtn = document.getElementById("thread-attach-file-btn");
  const threadFileInput = document.getElementById("thread-file-input") as HTMLInputElement | null;
  if (threadAttachFileBtn && threadFileInput) {
    threadAttachFileBtn.onclick = () => threadFileInput.click();
    threadFileInput.onchange = () => {
      const file = threadFileInput.files?.[0];
      if (file) handleThreadFileUpload(file);
      threadFileInput.value = "";
    };
  }

  // Thread Remove Pending Attachment
  const threadRemoveAttBtn = document.getElementById("thread-remove-attachment-btn");
  if (threadRemoveAttBtn) {
    threadRemoveAttBtn.onclick = () => updateState((s) => ({ ...s, threadPendingAttachment: null }));
  }

  // Emoji Popover Toggle (Main Composer)
  const toggleEmojiBtn = document.getElementById("toggle-emoji-btn");
  if (toggleEmojiBtn) {
    toggleEmojiBtn.onclick = (e) => {
      e.stopPropagation();
      updateState((s) => ({
        ...s,
        showEmojiPicker: !s.showEmojiPicker,
        showThreadEmojiPicker: false,
      }));
    };
  }

  // Emoji Category Navigation Tabs
  const emojiCatBtns = document.querySelectorAll<HTMLElement>(".emoji-cat-btn");
  emojiCatBtns.forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cat = btn.getAttribute("data-category") as AppState["emojiCategory"];
      if (cat) updateState((s) => ({ ...s, emojiCategory: cat }));
    };
  });

  // Emoji Search Input Fields
  const emojiSearchInput = document.getElementById("emoji-search-input") as HTMLInputElement | null;
  if (emojiSearchInput) {
    emojiSearchInput.onclick = (e) => e.stopPropagation();
    emojiSearchInput.oninput = () => {
      updateState((s) => ({ ...s, emojiSearchQuery: emojiSearchInput.value }));
    };
  }

  const threadEmojiSearchInput = document.getElementById("thread-emoji-search-input") as HTMLInputElement | null;
  if (threadEmojiSearchInput) {
    threadEmojiSearchInput.onclick = (e) => e.stopPropagation();
    threadEmojiSearchInput.oninput = () => {
      updateState((s) => ({ ...s, emojiSearchQuery: threadEmojiSearchInput.value }));
    };
  }

  // Insert Emoji into Main or Thread Input
  const emojiItems = document.querySelectorAll<HTMLElement>(".emoji-item-btn");
  emojiItems.forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const emoji = btn.getAttribute("data-insert-emoji");
      const target = (btn.getAttribute("data-target") as "main" | "thread") || "main";
      if (emoji) {
        insertEmojiIntoInput(emoji, target);
      }
    };
  });

  // Mention Options Click
  const mentionOptionBtns = document.querySelectorAll<HTMLElement>(".mention-option-btn");
  mentionOptionBtns.forEach((btn) => {
    btn.onclick = () => {
      const username = btn.getAttribute("data-mention-username");
      const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
      if (username && chatInput) {
        const val = chatInput.value;
        const atIndex = val.lastIndexOf("@");
        if (atIndex !== -1) {
          chatInput.value = val.substring(0, atIndex) + `@${username} `;
        } else {
          chatInput.value += `@${username} `;
        }
        updateState((s) => ({ ...s, mentionQuery: null }));
        chatInput.focus();
      }
    };
  });

  // Close emoji popovers safely when clicking outside without losing any typed text
  document.onclick = (e) => {
    const targetNode = e.target as Node;
    const mainPopover = document.getElementById("emoji-popover");
    const mainToggle = document.getElementById("toggle-emoji-btn");
    const threadPopover = document.getElementById("thread-emoji-popover");
    const threadToggle = document.getElementById("thread-toggle-emoji-btn");

    const clickedMain = (mainPopover && mainPopover.contains(targetNode)) || (mainToggle && mainToggle.contains(targetNode));
    const clickedThread = (threadPopover && threadPopover.contains(targetNode)) || (threadToggle && threadToggle.contains(targetNode));

    if (state.showEmojiPicker && !clickedMain) {
      updateState((s) => ({ ...s, showEmojiPicker: false }));
    }
    if (state.showThreadEmojiPicker && !clickedThread) {
      updateState((s) => ({ ...s, showThreadEmojiPicker: false }));
    }
  };

  // File Upload Attachment (Main Composer)
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
    chatPane.ondragover = (e) => e.preventDefault();
    chatPane.ondrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) handleFileUpload(file);
    };
  }

  // Chat Composer Input & Keyboard Shortcuts
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;

  if (chatForm && chatInput) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      submitCurrentMessage();
    };

    chatInput.onfocus = () => {
      if (Date.now() - lastPongReceivedAt > 12000 || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
        checkAndHealWebSocket();
      }
    };

    chatInput.onkeydown = (e) => {
      // ENTER sends the message + attachment! (Shift + Enter for new lines)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitCurrentMessage();
      }
    };

    chatInput.oninput = () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";

      if (state.activeChannelId) {
        state = {
          ...state,
          drafts: {
            ...state.drafts,
            [state.activeChannelId]: chatInput.value,
          },
        };
      }

      // Detect @ mention typing
      const val = chatInput.value;
      const atMatch = val.match(/@([a-zA-Z0-9_-]*)$/);
      if (atMatch) {
        updateState((s) => ({ ...s, mentionQuery: atMatch[1] || "" }));
      } else if (state.mentionQuery !== null) {
        updateState((s) => ({ ...s, mentionQuery: null }));
      }

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

const pollChannelActivity = async (): Promise<void> => {
  if (!state.user || !state.token) return;
  try {
    const res = await fetch("/api/activity/feed");
    if (!res.ok) return;
    const data = await res.json();
    const activities = data.activities as
      | Record<
          string,
          {
            lastMessageAt: number;
            lastSender: string;
            snippet: string;
            messageId?: string;
            parentId?: string;
          }
        >
      | undefined;
    if (!activities) return;

    let hasChange = false;
    const nextUnread = { ...state.unreadChannels };
    const nextMentions = { ...state.channelMentions };
    const nextMentionsList = [...state.mentions];

    for (const [roomId, act] of Object.entries(activities)) {
      if (roomId === state.activeChannelId) {
        if ((lastReadTimestamps[roomId] || 0) < act.lastMessageAt) {
          lastReadTimestamps[roomId] = Math.max(act.lastMessageAt, Date.now());
          if (state.user) {
            savePersistedLastRead(state.user.id, lastReadTimestamps);
          }
        }
        continue;
      }

      // If channel was never tracked for this user, seed it with act.lastMessageAt
      // so past messages from before the user joined/refreshed never trigger fake unreads!
      if (lastReadTimestamps[roomId] === undefined) {
        lastReadTimestamps[roomId] = act.lastMessageAt;
        if (state.user) {
          savePersistedLastRead(state.user.id, lastReadTimestamps);
        }
      }

      const lastRead = lastReadTimestamps[roomId] || 0;
      if (act.lastMessageAt > lastRead) {
        if (!nextUnread[roomId] && act.lastSender !== state.user.username) {
          nextUnread[roomId] = 1;
          hasChange = true;
        }

        const isMention =
          act.snippet &&
          isMentioningUser(act.snippet, state.user.username) &&
          act.lastSender !== state.user.username;
        const isThreadReply = Boolean(act.parentId) && act.lastSender !== state.user.username;

        if (isMention || isThreadReply) {
          if (!nextMentions[roomId]) {
            nextMentions[roomId] = true;
            hasChange = true;

            const ch = state.channels.find((c) => c.id === roomId);
            const chName = ch ? ch.name : roomId;
            const msgId = act.messageId || `act_${roomId}_${act.lastMessageAt}`;
            const exists = nextMentionsList.some(
              (m) =>
                (m.messageId && m.messageId === act.messageId) ||
                (m.roomId === roomId && m.createdAt === act.lastMessageAt)
            );
            if (!exists) {
              nextMentionsList.unshift({
                id: msgId,
                messageId: act.messageId,
                parentId: act.parentId,
                roomId,
                roomName: chName,
                senderName: act.lastSender,
                content: isThreadReply ? `💬 Replied in thread: "${act.snippet}"` : act.snippet,
                createdAt: act.lastMessageAt,
                type: isThreadReply ? "thread_reply" : "mention",
              });
              showSlackAlertToast(
                isThreadReply
                  ? `@${act.lastSender} replied in thread in #${chName}`
                  : `@${act.lastSender} mentioned you in #${chName}`,
                act.snippet,
                roomId,
                act.messageId,
                act.parentId,
                isThreadReply ? "💬" : "🔔"
              );
            }
          }
        }
      }
    }

    if (hasChange) {
      updateState((s) => {
        const addedCount = Math.max(0, nextMentionsList.length - s.mentions.length);
        const nextUnreadCount = s.isViewingMentions ? 0 : s.unreadMentionsCount + addedCount;
        if (s.user) {
          savePersistedMentions(s.user.id, nextMentionsList, nextUnreadCount);
        }
        return {
          ...s,
          unreadChannels: nextUnread,
          channelMentions: nextMentions,
          mentions: nextMentionsList,
          unreadMentionsCount: nextUnreadCount,
        };
      });
    }
  } catch (err) {
    console.debug("Activity feed poll skipped:", err);
  }
};

// ==========================================================================
// Initialization
// ==========================================================================

const init = async (): Promise<void> => {
  window.addEventListener("hashchange", checkHashRoute);

  // Resume WebSocket connection immediately if browser tab was idle, backgrounded, or wake-from-sleep
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndHealWebSocket();
      pollChannelActivity();
    }
  });

  window.addEventListener("focus", () => {
    checkAndHealWebSocket();
    pollChannelActivity();
  });

  window.addEventListener("online", () => {
    checkAndHealWebSocket();
    pollChannelActivity();
  });

  renderApp();

  if (activityPollInterval) clearInterval(activityPollInterval);
  activityPollInterval = window.setInterval(pollChannelActivity, 4000);

  if (state.user && state.token) {
    lastReadTimestamps = loadPersistedLastRead(state.user.id);
    await fetchUserProfile(state.user.id);
    checkHashRoute();
    pollChannelActivity();
  }
};

init();
