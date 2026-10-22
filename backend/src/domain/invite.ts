/**
 * Pure functions for generating and validating channel invite codes and slugs.
 */

// Generate a random 6-character alphanumeric invite code (e.g. "k9x2m4")
export const generateInviteCode = (): string => {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // unambiguous characters (no 0/O, 1/l/I)
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((byte) => chars[byte % chars.length])
    .join("");
};

// Validate format of an invite code
export const isValidInviteCode = (code: string): boolean => {
  return /^[a-z0-9_-]{4,16}$/i.test(code.trim());
};

// Convert channel name into a clean URL-friendly slug (e.g., "Project Alpha!" -> "project-alpha")
export const slugifyChannelName = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
};
