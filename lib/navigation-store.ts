"use client";

import {useSyncExternalStore} from "react";
import type {PageKey} from "./types";

/**
 * Navigation is view state, not a business record.
 * Keeping it outside WorkspaceContext prevents each page tap from forcing
 * HR, sales, finance, audit and notification providers to reconcile entire
 * datasets merely because the visible screen changed.
 *
 * Memory-only: never writes a Firestore domain or local recovery journal.
 */
let currentPage:PageKey="home";
const listeners=new Set<()=>void>();
const snapshot=()=>currentPage;
const serverSnapshot=():PageKey=>"home";

export function setNavigationPage(next:PageKey):void{
  if(currentPage===next)return;
  currentPage=next;
  for(const listener of listeners)listener();
}

export function getNavigationPage():PageKey{return currentPage;}

export function subscribeNavigationPage(listener:()=>void):()=>void{
  listeners.add(listener);
  return()=>{listeners.delete(listener);};
}

export function useNavigationPage():PageKey{
  return useSyncExternalStore(subscribeNavigationPage,snapshot,serverSnapshot);
}
