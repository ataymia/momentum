import type { Account, WorkspaceUser } from "./types";
import type { CrmContact, Opportunity } from "./crm-engine";

/** Defense-in-depth for existing CRM scopes; server and Firestore permissions remain authoritative. */
const salesRole = (user: WorkspaceUser | null | undefined) =>
  Boolean(user && ["Administrator", "Sales Manager", "Sales Representative"].includes(user.role));

export function visibleDeals(
  opportunities: readonly Opportunity[],
  accounts: readonly Account[],
  user: WorkspaceUser | null | undefined,
): Opportunity[] {
  if (!salesRole(user)) return [];
  const ids = new Set(accounts.map(account => account.id));
  return opportunities.filter(deal => ids.has(deal.locationId));
}

export function visibleContacts(
  contacts: readonly CrmContact[],
  accounts: readonly Account[],
  user: WorkspaceUser | null | undefined,
): CrmContact[] {
  if (!salesRole(user)) return [];
  const locationIds = new Set(accounts.map(account => account.id));
  const parentIds = new Set(accounts.map(account => account.customerId).filter(Boolean));
  return contacts.filter(contact => contact.locationId
    ? locationIds.has(contact.locationId)
    : parentIds.has(contact.customerId));
}

export const dealCsvColumns = ["Opportunity", "Account", "Stage", "Status", "Assigned rep", "Estimated cases", "Expected close", "Next action", "Next action date"] as const;
export function dealCsvRows(
  deals: readonly Opportunity[], accounts: readonly Account[], users: readonly Pick<WorkspaceUser, "id" | "name">[],
): Record<string, unknown>[] {
  const locations = new Map(accounts.map(account => [account.id, account]));
  const names = new Map(users.map(user => [user.id, user.name]));
  return deals.filter(deal => locations.has(deal.locationId)).map(deal => ({
    Opportunity: deal.name, Account: locations.get(deal.locationId)?.name ?? "",
    Stage: deal.stage, Status: deal.status, "Assigned rep": names.get(deal.ownerId) ?? "",
    "Estimated cases": deal.estimatedCases ?? "", "Expected close": deal.expectedCloseDate ?? "",
    "Next action": deal.nextAction, "Next action date": deal.nextActionDate,
  }));
}

export const contactCsvColumns = ["Contact", "Business", "Role", "Decision role", "Email", "Phone", "Active"] as const;
export function contactCsvRows(
  contacts: readonly CrmContact[], accounts: readonly Account[],
): Record<string, unknown>[] {
  const locations = new Map(accounts.map(account => [account.id, account]));
  const parents = new Map(accounts.filter(account => account.customerId).map(account => [account.customerId, account]));
  return contacts.map(contact => {
    const location = contact.locationId ? locations.get(contact.locationId) : parents.get(contact.customerId);
    if (!location) return null;
    return { Contact: contact.name, Business: location.name, Role: contact.role,
      "Decision role": contact.decisionRole, Email: contact.email ?? "", Phone: contact.phone ?? "",
      Active: contact.active ? "Yes" : "No" };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
}
