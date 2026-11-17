"use client";

import { useMemo, useState } from "react";
import type { WorkspaceUser } from "../../lib/types";
import { selectableSalesUsers, selectedSalesUserId } from "../../lib/sales-user-picker";

type Props = {
  users: readonly WorkspaceUser[];
  value: string;
  onChange: (userId: string) => void;
  label: string;
  allowUnassigned?: boolean;
};

/**
 * Real directory selection, never a typed UID. Text search narrows the
 * dropdown, but the commit value must match a currently eligible user.
 * Server-side authorization of assignment remains an independent requirement.
 */
export function SalesUserPicker({users,value,onChange,label,allowUnassigned=true}:Props) {
  const [query,setQuery] = useState("");
  const selectedId = selectedSalesUserId(users,value);
  const eligible = useMemo(()=>selectableSalesUsers(users,query),[users,query]);
  const selected = users.find(user=>user.id===selectedId);
  const options = selected && !eligible.some(user=>user.id===selectedId) ? [selected,...eligible] : eligible;
  return <div className="sales-user-picker">
    <input type="search" aria-label={`Search ${label}`} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by name, email or job title" autoComplete="off"/>
    <select aria-label={label} value={selectedId} onChange={event=>onChange(selectedSalesUserId(users,event.target.value))} required={!allowUnassigned}>
      <option value="">{allowUnassigned?"Unassigned / select a user":"Select a sales user"}</option>
      {options.map(user=><option key={user.id} value={user.id}>{user.name} · {user.title}</option>)}
    </select>
    {query&&!eligible.length&&<small>No eligible sales users match the search.</small>}
  </div>;
}
