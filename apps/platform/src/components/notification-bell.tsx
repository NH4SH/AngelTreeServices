"use client";

import Link from "next/link";
import { Bell, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AdminNotification } from "@/lib/data/notifications";

export function NotificationBell({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[] | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchNotifications("count");
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

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
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="notification-bell-trigger"
        onClick={toggle}
        type="button"
      >
        <Bell aria-hidden="true" size={mobile ? 19 : 18} />
        {unreadCount ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <section aria-label="Recent notifications" className="notification-popover">
          <header>
            <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
            <Link href="/admin/notifications" onClick={() => setOpen(false)}>View all</Link>
          </header>
          <div className="notification-popover-list">
            {error ? <p className="notification-popover-state">{error}</p> : null}
            {!error && notifications === null ? <p className="notification-popover-state"><LoaderCircle className="spin" size={18} />Loading…</p> : null}
            {!error && notifications?.length === 0 ? <p className="notification-popover-state"><Check size={18} />No customer activity yet.</p> : null}
            {notifications?.map((notification) => (
              <Link
                className={notification.read_at ? "" : "is-unread"}
                href={notification.destination_path ?? "/admin/notifications"}
                key={notification.id}
                onClick={() => markRead(notification)}
              >
                <span className={`notification-category-dot ${notification.category}`} />
                <span><strong>{notification.title}</strong><small>{notification.body}</small><time>{relativeTime(notification.created_at)}</time></span>
              </Link>
            ))}
          </div>
        </section>
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
  return new Date(value).toLocaleDateString();
}
