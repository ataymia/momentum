import type { Account } from "./types";

export type AccountAddress = {
  streetAddress?: string;
  location?: string;
  postalCode?: string;
};

const clean = (value?: string) => value?.trim() || undefined;

export function businessAddressForAccount(account: Pick<Account,"streetAddress"|"location"|"postalCode">): AccountAddress {
  return {
    streetAddress: clean(account.streetAddress),
    location: clean(account.location),
    postalCode: clean(account.postalCode),
  };
}

export function deliveryAddressForAccount(account: Pick<Account,"streetAddress"|"location"|"postalCode"|"deliveryAddressSameAsBusiness"|"deliveryStreetAddress"|"deliveryLocation"|"deliveryPostalCode">): AccountAddress {
  const business = businessAddressForAccount(account);
  if (account.deliveryAddressSameAsBusiness !== false) return business;
  return {
    streetAddress: clean(account.deliveryStreetAddress) ?? business.streetAddress,
    location: clean(account.deliveryLocation) ?? business.location,
    postalCode: clean(account.deliveryPostalCode) ?? business.postalCode,
  };
}

export function formatAccountAddress(address: AccountAddress) {
  const parts = [clean(address.streetAddress), clean(address.location), clean(address.postalCode)].filter(Boolean);
  return parts.join(", ");
}

export function businessAddressLabel(account: Pick<Account,"streetAddress"|"location"|"postalCode">) {
  return formatAccountAddress(businessAddressForAccount(account));
}

export function deliveryAddressLabel(account: Pick<Account,"streetAddress"|"location"|"postalCode"|"deliveryAddressSameAsBusiness"|"deliveryStreetAddress"|"deliveryLocation"|"deliveryPostalCode">) {
  return formatAccountAddress(deliveryAddressForAccount(account));
}
