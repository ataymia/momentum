"use client";

import { useSyncExternalStore } from "react";
import type { PageKey } from "./types";
import { normalizeRoutePath, pageForPath, routeForPage } from "./navigation-route-registry";
import { isSafeInternalRoute } from "./navigation-route-contract";

/**
 * Branch-only URL-aware navigation. The URL is the view's source of truth.
 * No Firestore write or workspace journal is triggered by a page transition.
 * Existing navigation calls continue to work, but now push browser history.
 */
let currentPage: PageKey = "home";
let currentRoute = "/";
let initialized = false;
let bootstrapped = false;
let clients = 0;
const listeners = new Set<() => void>();
const pageSnapshot = () => currentPage;
const routeSnapshot = () => currentRoute;
const readySnapshot = () => bootstrapped;
const serverReadySnapshot = () => false;
const serverPageSnapshot = (): PageKey => "home";
const serverRouteSnapshot = () => "/";

function publish(): void {
  for (const subscriber of listeners) subscriber();
}
function adopt(path: string, fallback?: PageKey): void {
  const normalized = normalizeRoutePath(path);
  const nextPage = pageForPath(normalized) ?? fallback ?? "home";
  if (currentRoute === normalized && currentPage === nextPage) return;
  currentRoute = normalized;
  currentPage = nextPage;
  publish();
}
function browserPath(): string {
  if (typeof window === "undefined") return "/";
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  const path = window.location.pathname;
  return base && (path === base || path.startsWith(base + "/")) ? path.slice(base.length) || "/" : path;
}
function onPopState(): void {
  adopt(browserPath());
}

/** Install after hydration; returns a cleanup for client rendering/tests. */
export function startRouteNavigation(): () => void {
  if (typeof window === "undefined") return () => {};
  clients += 1;
  if (!initialized) {
    initialized = true;
    window.addEventListener("popstate", onPopState);
  }
  adopt(browserPath());
  if (!bootstrapped) {
    bootstrapped = true;
    publish();
  }
  return () => {
    clients = Math.max(0, clients - 1);
    if (clients === 0 && initialized) {
      window.removeEventListener("popstate", onPopState);
      initialized = false;
    }
  };
}

export function navigateToRoute(nextPath: string, options?: {replace?: boolean}): void {
  if (!isSafeInternalRoute(nextPath)) return;
  const next = normalizeRoutePath(nextPath);
  if (typeof window !== "undefined") {
    const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
    const target = base + (next === "/" ? "/" : next);
    if (browserPath() !== next) {
      if (options?.replace) window.history.replaceState(null, "", target);
      else window.history.pushState(null, "", target);
    }
  }
  adopt(next);
}

export function setNavigationPage(next: PageKey): void {
  navigateToRoute(routeForPage(next));
}
/** Current address before the signed-in shell has initialized its route store. */
export function getRequestedNavigationPath(): string { return browserPath(); }
/** Preserve initial copied URLs while authentication and employee directory
 * hydrate independently. Only an existing signed-in identity change/logout
 * resets the route; PageView still rejects unauthorized record links.
 */
export function shouldResetNavigationOnIdentityChange(previousId:string|null|undefined,nextId:string|null):boolean {
  if(previousId===undefined || previousId===nextId)return false;
  return !(previousId===null && nextId!==null);
}

export function getNavigationPage(): PageKey { return currentPage; }
export function getNavigationRoute(): string { return currentRoute; }
export function subscribeNavigationPage(subscriber: () => void): () => void {
  listeners.add(subscriber);
  return () => { listeners.delete(subscriber); };
}
export function useNavigationPage(): PageKey {
  return useSyncExternalStore(subscribeNavigationPage, pageSnapshot, serverPageSnapshot);
}
export function useNavigationRoute(): string {
  return useSyncExternalStore(subscribeNavigationPage, routeSnapshot, serverRouteSnapshot);
}

/** Prevent the root Home screen from flashing while resolving a copied deep link. */
export function useNavigationReady(): boolean {
  return useSyncExternalStore(subscribeNavigationPage, readySnapshot, serverReadySnapshot);
}
