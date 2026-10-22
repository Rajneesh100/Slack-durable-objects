/**
 * Pure Functional State Machine for Room Durable Object.
 * (State, Event) => [NextState, Effects[]]
 * Zero side-effects, zero mutations, 100% deterministic.
 */

import type {
  ChatMessage,
  Participant,
  RoomDomainEvent,
  RoomEffect,
  RoomId,
  RoomState,
  UserId,
} from "./types";

export const initialRoomState = (
  roomId: RoomId,
  name: string,
  inviteCode: string
): RoomState => ({
  roomId,
  name,
  inviteCode,
  participants: new Map<UserId, Participant>(),
  typingUsers: new Map<UserId, number>(),
});

export const reduceRoom = (
  state: RoomState,
  event: RoomDomainEvent
): readonly [RoomState, readonly RoomEffect[]] => {
  switch (event.type) {
    case "USER_CONNECTED": {
      const nextParticipants = new Map(state.participants);
      nextParticipants.set(event.user.userId, event.user);

      const nextState: RoomState = {
        ...state,
        participants: nextParticipants,
      };

      const effects: readonly RoomEffect[] = [
        {
          type: "BROADCAST_OTHERS",
          excludeUserId: event.user.userId,
          message: {
            type: "USER_JOINED",
            participant: event.user,
          },
        },
      ];

      return [nextState, effects];
    }

    case "USER_DISCONNECTED": {
      if (!state.participants.has(event.userId)) {
        return [state, []];
      }

      const nextParticipants = new Map(state.participants);
      nextParticipants.delete(event.userId);

      const nextTyping = new Map(state.typingUsers);
      const wasTyping = nextTyping.delete(event.userId);

      const nextState: RoomState = {
        ...state,
        participants: nextParticipants,
        typingUsers: nextTyping,
      };

      const effects: RoomEffect[] = [
        {
          type: "BROADCAST_ALL",
          message: {
            type: "USER_LEFT",
            userId: event.userId,
          },
        },
      ];

      if (wasTyping) {
        effects.push({
          type: "BROADCAST_ALL",
          message: {
            type: "TYPING_INDICATOR",
            typingUsers: Array.from(nextTyping.keys())
              .map((id) => nextParticipants.get(id)?.username)
              .filter((name): name is string => Boolean(name)),
          },
        });
      }

      return [nextState, effects];
    }

    case "POST_MESSAGE": {
      const trimmed = event.content.trim();
      const sender = state.participants.get(event.senderId);

      // Validation guard: must have content or attachment
      if (!sender || (trimmed.length === 0 && !event.attachment)) {
        return [state, []];
      }

      const chatMessage: ChatMessage = {
        id: event.messageId,
        roomId: state.roomId,
        senderId: sender.userId,
        senderName: sender.username,
        content: trimmed,
        attachment: event.attachment,
        reactions: {},
        parentId: event.parentId,
        createdAt: event.timestamp,
      };

      // Clear typing indicator for this user when message is sent
      let nextTyping = state.typingUsers;
      const effects: RoomEffect[] = [];

      if (state.typingUsers.has(event.senderId)) {
        const mutableTyping = new Map(state.typingUsers);
        mutableTyping.delete(event.senderId);
        nextTyping = mutableTyping;

        effects.push({
          type: "BROADCAST_ALL",
          message: {
            type: "TYPING_INDICATOR",
            typingUsers: Array.from(nextTyping.keys())
              .map((id) => state.participants.get(id)?.username)
              .filter((name): name is string => Boolean(name)),
          },
        });
      }

      effects.push(
        { type: "PERSIST_MESSAGE", message: chatMessage },
        { type: "BROADCAST_ALL", message: { type: "NEW_MESSAGE", message: chatMessage } }
      );

      const nextState: RoomState = {
        ...state,
        typingUsers: nextTyping,
      };

      return [nextState, effects];
    }

    case "TOGGLE_REACTION": {
      const sender = state.participants.get(event.userId);
      if (!sender || !event.emoji || !event.messageId) {
        return [state, []];
      }

      const effects: readonly RoomEffect[] = [
        {
          type: "PERSIST_REACTION",
          messageId: event.messageId,
          userId: event.userId,
          emoji: event.emoji,
        },
      ];

      return [state, effects];
    }

    case "SET_TYPING": {
      const participant = state.participants.get(event.userId);
      if (!participant) return [state, []];

      const nextTyping = new Map(state.typingUsers);
      if (event.isTyping) {
        nextTyping.set(event.userId, event.timestamp + 4000);
      } else {
        nextTyping.delete(event.userId);
      }

      const nextState: RoomState = {
        ...state,
        typingUsers: nextTyping,
      };

      const typingUsernames = Array.from(nextTyping.keys())
        .map((id) => state.participants.get(id)?.username)
        .filter((name): name is string => Boolean(name));

      const effects: readonly RoomEffect[] = [
        {
          type: "BROADCAST_OTHERS",
          excludeUserId: event.userId,
          message: {
            type: "TYPING_INDICATOR",
            typingUsers: typingUsernames,
          },
        },
      ];

      return [nextState, effects];
    }

    case "PRUNE_TYPING": {
      let changed = false;
      const nextTyping = new Map(state.typingUsers);

      for (const [userId, expiresAt] of nextTyping.entries()) {
        if (expiresAt <= event.currentTimestamp) {
          nextTyping.delete(userId);
          changed = true;
        }
      }

      if (!changed) return [state, []];

      const nextState: RoomState = {
        ...state,
        typingUsers: nextTyping,
      };

      const typingUsernames = Array.from(nextTyping.keys())
        .map((id) => state.participants.get(id)?.username)
        .filter((name): name is string => Boolean(name));

      const effects: readonly RoomEffect[] = [
        {
          type: "BROADCAST_ALL",
          message: {
            type: "TYPING_INDICATOR",
            typingUsers: typingUsernames,
          },
        },
      ];

      return [nextState, effects];
    }
  }
};
