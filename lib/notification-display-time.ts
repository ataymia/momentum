/**
 * Stable, local presentation metadata for an in-app notification.
 * Event time is authoritative only when the source supplied a valid timestamp.
 * For undated actions, remember when the user first saw the item. Never
 * mislabel a polling or render time as a business event timestamp.
 */
export type NotificationTimestampSource = "recorded" | "first-seen";

export function usableNotificationTime(time: unknown): time is string {
  return typeof time === "string" && !!time.trim() && Number.isFinite(Date.parse(time));
}

export function notificationDisplayTime(
  sourceTime: string | undefined,
  firstSeenTime: string | undefined,
  observedAt: string,
): {time: string; source: NotificationTimestampSource} {
  if(usableNotificationTime(sourceTime))return {time:sourceTime,source:"recorded"};
  return {time:usableNotificationTime(firstSeenTime)?firstSeenTime:observedAt,source:"first-seen"};
}

export function mergeFirstSeenTimes(
  current: Record<string,string>,
  ids: readonly string[],
  observedAt: string,
): Record<string,string> {
  const unique=[...new Set(ids)];
  if(!unique.length||!usableNotificationTime(observedAt))return current;
  const missing=unique.filter(id=>id&&!usableNotificationTime(current[id]));
  if(!missing.length)return current;
  const next={...current};
  for(const id of missing)next[id]=observedAt;
  // Cap local metadata without mutating the authoritative business records.
  const keys=Object.keys(next);
  if(keys.length<=2000)return next;
  const retain=keys.sort((a,b)=>(next[b]||"").localeCompare(next[a]||"")).slice(0,2000);
  return Object.fromEntries(retain.map(id=>[id,next[id]]));
}

export function parseFirstSeenTimes(input:unknown):Record<string,string>{
  if(!input||typeof input!=="object"||Array.isArray(input))return {};
  const pairs=Object.entries(input as Record<string,unknown>)
    .filter(([id,stamp])=>id.length>0&&id.length<=300&&usableNotificationTime(stamp))
    .sort((a,b)=>String(b[1]).localeCompare(String(a[1]))).slice(0,2000);
  return Object.fromEntries(pairs) as Record<string,string>;
}
