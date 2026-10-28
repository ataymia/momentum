/** Display-only invoice attribution. Never display raw Firebase IDs to customers. */
export function invoicePlacerLabel(name:string|null|undefined):string{
  return name?.trim()||"Name unavailable";
}
