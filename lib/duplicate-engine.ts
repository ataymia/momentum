import type { Account } from "./types";

export type AccountDuplicateInput = Pick<Account, "name" | "location" | "phone" | "email"> & { streetAddress?: string; locationName?: string };
export type DuplicateMatch = { account: Account; reason: string; confidence: "Exact" | "Strong" };
const normalizeText = (value?: string) => (value ?? "").toLowerCase().replace(/\bwest\b/g, "w").replace(/\beast\b/g, "e").replace(/\bnorth\b/g, "n").replace(/\bsouth\b/g, "s").replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|parkway|pkwy|suite|ste|unit)\b/g, " ").replace(/[^a-z0-9]/g, "").trim();
const normalizePhone = (value?: string) => (value ?? "").replace(/\D/g, "").slice(-10);
const normalizeEmail = (value?: string) => (value ?? "").trim().toLowerCase();

export function findAccountDuplicate(accounts: Account[], input: AccountDuplicateInput): DuplicateMatch | null {
  const street = normalizeText(input.streetAddress); const name = normalizeText(input.name); const locationName = normalizeText(input.locationName); const phone = normalizePhone(input.phone); const email = normalizeEmail(input.email);
  for (const account of accounts) {
    const accountStreet = normalizeText(account.streetAddress); const accountName = normalizeText(account.name); const accountLocationName = normalizeText(account.locationName); const accountPhone = normalizePhone(account.phone); const accountEmail = normalizeEmail(account.email);
    if (street && accountStreet && street === accountStreet) return { account, reason: "That street address already belongs to an existing location.", confidence: "Exact" };
    if (name && accountName === name && locationName && accountLocationName === locationName) return { account, reason: "That business and location label already exist.", confidence: "Exact" };
    if (name && accountName === name && phone.length >= 7 && phone === accountPhone) return { account, reason: "That business name and phone number already exist on another record.", confidence: "Strong" };
    if (name && accountName === name && email && email === accountEmail) return { account, reason: "That business name and email already exist on another record.", confidence: "Strong" };
  }
  return null;
}
