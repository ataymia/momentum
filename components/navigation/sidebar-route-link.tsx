"use client";

import type { MouseEvent, ReactNode } from "react";
import { routeHref } from "../../lib/navigation-route-contract";
import { navigateToRoute } from "../../lib/navigation-store";

type Props = {
  path: string;
  children: ReactNode;
  active: boolean;
  className?: string;
  onNavigate?: () => void;
};

/**
 * Real anchors preserve Copy Link, Open in New Tab, keyboard navigation and
 * normal browser history. Only unmodified primary clicks use SPA navigation.
 */
export function SidebarRouteLink({ path, children, active, className, onNavigate }: Props) {
  const href = routeHref(path, process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateToRoute(path);
    onNavigate?.();
  };
  return <a href={href} className={className} aria-current={active ? "page" : undefined} onClick={follow}>
    {children}
  </a>;
}
