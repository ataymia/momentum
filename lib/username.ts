/**
 * Momentum login usernames.
 *
 * Employees may sign in with either a username or their work e-mail. Both identifiers resolve to the same
 * Firebase Authentication uid and password. The username -> e-mail mapping is private and resolved only
 * by Firebase Functions through `usernames/{username}`; browser clients cannot read that collection.
 *
 * Format: first initial + last name, lowercased and reduced to `a-z0-9`. Collisions get a numeric suffix.
 */

export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 32;
/** Must start with a letter so a username can never be confused with a uid or a numeric id. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9]{1,31}$/;

/** Firestore collection holding the private username -> identity mapping. Never client-readable. */
export const USERNAME_INDEX_COLLECTION = "usernames";
/** Forgot-username requests an Administrator resolves. Never client-readable. */
export const USERNAME_REMINDER_COLLECTION = "usernameReminders";

export type NameParts = { firstName: string; lastName: string };

/**
 * Reduce a name fragment to username characters.
 *
 * Accents are folded (`Muñoz` -> `munoz`), and apostrophes, hyphens, periods and spaces are removed
 * rather than substituted, so `O'Connor`, `O Connor` and `OConnor` all produce the same account name.
 */
export function foldNameFragment(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Normalize anything a human typed into the canonical stored/compared form. */
export function normalizeUsername(value: string): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, USERNAME_MAX_LENGTH);
}

/**
 * Split a display/legal name into a first and last fragment.
 *
 * Multi-word surnames collapse into one fragment (`Maria Del Rio` -> `mdelrio`) because the surname is
 * whatever follows the given name, and generational suffixes are dropped so `John Smith Jr` stays `jsmith`.
 */
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function splitLegalName(fullName: string): NameParts {
  const parts = (fullName ?? "").trim().split(/\s+/).map(foldNameFragment).filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join("") };
}

/**
 * The preferred username for a name, before collision handling.
 *
 * A single-word name has no surname to abbreviate against, so the whole name is used rather than a
 * one-character username.
 */
export function usernameCandidate(firstName: string, lastName: string): string {
  const first = foldNameFragment(firstName);
  const last = foldNameFragment(lastName);
  if (!first && !last) return "";
  if (!last) return first.slice(0, USERNAME_MAX_LENGTH);
  if (!first) return last.slice(0, USERNAME_MAX_LENGTH);
  return `${first[0]}${last}`.slice(0, USERNAME_MAX_LENGTH);
}

export const usernameCandidateFromFullName = (fullName: string) => {
  const { firstName, lastName } = splitLegalName(fullName);
  return usernameCandidate(firstName, lastName);
};

export type UsernameTakenCheck = (username: string) => boolean;

const asCheck = (taken: Iterable<string> | UsernameTakenCheck): UsernameTakenCheck => {
  if (typeof taken === "function") return taken;
  const set = new Set([...taken].map(normalizeUsername));
  return (username) => set.has(username);
};

/**
 * First free username for a name: `jsmith`, then `jsmith2`, `jsmith3`, ...
 *
 * The suffix is appended to a truncated stem so a long surname cannot push the result past the maximum
 * length and silently collide with the unsuffixed name.
 */
export function generateUsername(firstName: string, lastName: string, taken: Iterable<string> | UsernameTakenCheck = []): string {
  const base = usernameCandidate(firstName, lastName);
  if (!base) return "";
  const isTaken = asCheck(taken);
  if (!isTaken(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tail = String(suffix);
    const candidate = `${base.slice(0, USERNAME_MAX_LENGTH - tail.length)}${tail}`;
    if (!isTaken(candidate)) return candidate;
  }
  return "";
}

/** Why a proposed username cannot be used, or null when it is acceptable. */
export function usernameProblem(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (!normalized) return "Enter a username.";
  if (normalized.length < USERNAME_MIN_LENGTH) return `Usernames must be at least ${USERNAME_MIN_LENGTH} characters.`;
  if (!USERNAME_PATTERN.test(normalized)) return "Usernames must start with a letter and contain only letters and numbers.";
  if (normalized !== (value ?? "").trim().toLowerCase()) return "Usernames are lowercase letters and numbers only.";
  return null;
}

export const isValidUsername = (value: string) => usernameProblem(value) === null;

/**
 * `maria.gonzalez@gmail.com` -> `m***@gmail.com`.
 *
 * Password recovery shows this instead of the address itself, so knowing a username never reveals the
 * mailbox behind it.
 */
export function maskEmail(email: string): string {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const maskedDomain = dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : "***";
  return `${local[0]}***@${maskedDomain}`;
}
