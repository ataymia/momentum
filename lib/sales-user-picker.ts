import type { WorkspaceUser } from "./types";

/** Whitelist existing eligible directory identities. No free-form rep IDs. */
export function selectableSalesUsers(
  users: readonly WorkspaceUser[],
  query: string,
): WorkspaceUser[] {
  const needle = query.trim().toLocaleLowerCase();
  return users.filter(user =>
    user.employmentStatus !== "Separated" &&
    (user.role === "Sales Representative" || user.role === "Sales Manager") &&
    Boolean(user.id) &&
    (!needle || [user.name, user.email, user.title, user.id].some(field => field.toLocaleLowerCase().includes(needle)))
  ).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}

export function selectedSalesUserId(users: readonly WorkspaceUser[], requestedId: string): string {
  return users.some(user => user.id === requestedId && user.employmentStatus !== "Separated" &&
    (user.role === "Sales Representative" || user.role === "Sales Manager")) ? requestedId : "";
}
