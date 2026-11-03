"use client";

import { useSyncExternalStore } from "react";
import type { PageKey } from "./types";
import { normalizeRoutePath, pageForPath, routeForPage } from "./navigation-route-registry";

/**
 * Branch-only URL-aware navigation. The URL is the view's source of truth.
 * No Firestore write or workspace journal is triggered by a page transition.
 * Existing navigation calls continue to work, but now push browser history.
 */
let currentPage: PageKey = "home";
let currentRoute = "/";
let initialized = false;
const listeners = new Set<() => void>();
const pageSnapshot = () => currentPage;
const routeSnapshot = () => currentRoute;
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
  if (!initialized) {
    initialized = true;
    window.addEventListener("popstate", onPopState);
  }
  adopt(browserPath());
  return () => {};
}

export function navigateToRoute(nextPath: string, options?: {replace?: boolean}): void {
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return;
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
