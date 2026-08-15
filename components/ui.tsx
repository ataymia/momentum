"use client";

import { ArrowUpRight, ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand--compact" : "brand"} aria-label="Momentum Operations">
      <span className="brand__mark" aria-hidden="true">
        <span>M</span>
      </span>
      {!compact && (
        <span className="brand__type">
          <strong>Momentum</strong>
          <small>Operations</small>
        </span>
      )}
    </div>
  );
}

export function Avatar({
  initials,
  color,
  size = "md",
}: {
  initials: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ "--avatar-accent": color ?? "#e6b82f" } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || action) && (
        <div className="panel__header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  dot = true,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "gold";
  dot?: boolean;
}) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "blue",
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone?: "blue" | "gold" | "red" | "green";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "article";
  return (
    <Tag className={`metric-card metric-card--${tone}`} onClick={onClick}>
      <div className="metric-card__top">
        <span>{label}</span>
        {onClick && <ArrowUpRight size={16} aria-hidden="true" />}
      </div>
      <strong>{value}</strong>
      <div className="metric-card__bottom">
        <span>{detail}</span>
        {trend && <b>{trend}</b>}
      </div>
    </Tag>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}) {
  return (
    <button className={`button button--${variant} button--${size}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function TextButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      <span>{children}</span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat(
    "en-US",
    options ?? { month: "short", day: "numeric", year: "numeric" },
  ).format(new Date(normalized));
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function hoursBetween(clockIn: string, clockOut?: string, breakMinutes = 0) {
  if (!clockOut) return 0;
  const [startHours, startMinutes] = clockIn.split(":").map(Number);
  const [endHours, endMinutes] = clockOut.split(":").map(Number);
  return Math.max(0, (endHours * 60 + endMinutes - startHours * 60 - startMinutes - breakMinutes) / 60);
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">✦</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
