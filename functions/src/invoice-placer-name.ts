type DirectoryProfile = Record<string, unknown> | null | undefined;

/**
 * Return a customer-safe label for the original order creator.
 * @param {DirectoryProfile} profile Saved employee profile or nothing.
 * @return {string} Employee name or a neutral unavailable label.
 */
export function invoicePlacedByName(profile: DirectoryProfile): string {
  const name = typeof profile?.name === "string" ?
    profile.name.trim() : "";
  return name || "Name unavailable";
}
