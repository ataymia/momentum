type DirectoryProfile=Record<string,unknown>|null|undefined;

/** A customer-facing invoice must not disclose an internal Firebase UID.
 * Order.ownerId remains the immutable attribution key for audit and commission review.
 */
export function invoicePlacedByName(profile:DirectoryProfile):string{
  const name=typeof profile?.name==="string"?profile.name.trim():"";
  return name||"Name unavailable";
}
