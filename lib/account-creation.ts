import type { Account } from "./types";

export type NewAccountContactInput = Pick<Account, "name" | "location" | "channel" | "contactName" | "contactRole" | "phone" | "mobilePhone" | "email">;

export type AccountCreationValidation = { ok: true } | { ok: false; message: string };

const present = (value: string | undefined) => Boolean(value?.trim());

export function validateNewAccountContact(input: NewAccountContactInput): AccountCreationValidation {
  if (!present(input.name) || !present(input.location) || !present(input.channel)) {
    return { ok: false, message: "Business name, city / market, and channel are required." };
  }
  if (!present(input.contactName) || !present(input.contactRole)) {
    return { ok: false, message: "Add the primary contact name and role." };
  }
  if (!present(input.phone) && !present(input.mobilePhone) && !present(input.email)) {
    return { ok: false, message: "Add a business phone, mobile phone, or email address for the primary contact." };
  }
  return { ok: true };
}
