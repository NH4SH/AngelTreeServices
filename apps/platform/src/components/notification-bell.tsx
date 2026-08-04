"use client";

import Link from "next/link";
import { Bell, Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBusinessDateTime } from "@/lib/business-time";
import type { AdminNotification } from "@/lib/data/notifications";
import {
  getNotificationPopoverLayout,
  type NotificationPopoverLayout,
} from "@/lib/notifications/popover-position";

export function NotificationBell({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[] | null>(null);
  const [error, setError] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [popoverLayout, setPopoverLayout] = useState<NotificationPopoverLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPortalHost(document.body);
    void fetchNotifications("count");
  }, []);

  const updatePopoverLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPopoverLayout(getNotificationPopoverLayout({
      mobile,
      trigger: trigger.getBoundingClientRect(),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }));
  }, [mobile]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const reposition = () => updatePopoverLayout();

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeWithEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    requestAnimationFrame(() => popoverRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePopoverLayout]);

  async function fetchNotifications(mode: "count" | "recent") {
    try {
      const response = await fetch(`/api/admin/notifications?mode=${mode}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Notifications are unavailable.");
      setUnreadCount(payload.unreadCount ?? 0);
      if (mode === "recent") setNotifications(payload.notifications ?? []);
      setError("");
    } catch (fetchError) {
      if (mode === "recent") setError(fetchError instanceof Error ? fetchError.message : "Notifications are unavailable.");
    }
  }

  async function toggle() {
    const next = !open;
    if (next) updatePopoverLayout();
    setOpen(next);
    if (next) {
      setNotifications(null);
      await fetchNotifications("recent");
    }
  }

  async function markRead(notification: AdminNotification) {
    if (!notification.read_at) {
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((rows) => rows?.map((row) => row.id === notification.id
        ? { ...row, read_at: new Date().toISOString() }
        : row) ?? null);
      void fetch("/api/admin/notifications", {
        body: JSON.stringify({ id: notification.id, read: true }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
    }
    setOpen(false);
  }

  return (
    <div className={`notification-bell ${mobile ? "is-mobile" : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="notification-bell-trigger"
        onClick={toggle}
        ref={triggerRef}
        type="button"
      >
        <Bell aria-hidden="true" size={mobile ? 19 : 18} />
        {unreadCount ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open && portalHost && popoverLayout ? createPortal(
        <section
          aria-label="Recent notifications"
          className={`notification-popover ${mobile ? "is-mobile" : ""}`}
          ref={popoverRef}
          role="dialog"
          style={{
            left: popoverLayout.left,
            maxHeight: popoverLayout.maxHeight,
            top: popoverLayout.top,
            width: popoverLayout.width,
          }}
          tabIndex={-1}
        >
          <header>
            <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
            <Link href="/admin/notifications" onClick={() => setOpen(false)}>View all</Link>
          </header>
          <div aria-busy={!error && notifications === null} aria-live="polite" className="notification-popover-list">
            {error ? (
              <div className="notification-popover-state notification-popover-error" role="alert">
                <p>{error}</p>
                <button onClick={() => { setNotifications(null); void fetchNotifications("recent"); }} type="button">Try again</button>
              </div>
            ) : null}
            {!error && notifications === null ? <p className="notification-popover-state"><LoaderCircle aria-hidden="true" className="spin" size={18} />Loading notifications</p> : null}
            {!error && notifications?.length === 0 ? <p className="notification-popover-state"><Check aria-hidden="true" size={18} />No customer activity yet.</p> : null}
            {notifications?.map((notification) => (
              <Link
                className={notification.read_at ? "" : "is-unread"}
                href={notification.destination_path ?? "/admin/notifications"}
                key={notification.id}
                onClick={() => markRead(notification)}
              >
                <span aria-hidden="true" className={`notification-category-dot ${notification.category}`} />
                <span><strong>{notification.title}</strong><small>{notification.body}</small><time>{relativeTime(notification.created_at)}</time></span>
              </Link>
            ))}
          </div>
        </section>,
        portalHost,
      ) : null}
    </div>
  );
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatBusinessDateTime(value, { dateStyle: "medium" });
}
