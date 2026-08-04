import { formatBusinessDateTime } from "@/lib/business-time";
import Link from "next/link";
import { Bell, Filter } from "lucide-react";
import { ListPagination } from "@/components/list-pagination";
import {
  MarkAllNotificationsRead,
  NotificationReadAction,
} from "@/components/notification-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getNotificationInbox } from "@/lib/data/notifications";
import {
  notificationCategories,
  notificationCategoryLabels,
  type NotificationCategory,
} from "@/lib/notifications/definitions";
import { SetupRequired } from "@/components/SetupRequired";

type Props = { searchParams: Promise<{ category?: string; page?: string; status?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/notifications");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening notifications" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const page = positivePage(params.page);
  const inbox = allowed
    ? await getNotificationInbox({ category: params.category, page, pageSize: 30, status: params.status, userId: context.user.id })
    : { count: 0, data: [], error: null };
  return (
    <PlatformFrame active="notifications" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content notification-inbox-page">
        <section className="page-heading notification-heading">
          <div><p className="surface-label"><Bell size={18} />Customer activity</p><h1>Notifications</h1><p>Customer actions that may need attention from the office.</p></div>
          {allowed ? <MarkAllNotificationsRead /> : null}
        </section>
        {!allowed ? <section className="empty-state"><h2>Owner or admin access required</h2><p>This inbox is restricted to administrators.</p></section> : null}
        {inbox.error ? <section className="data-warning"><strong>Database notice</strong><p>{inbox.error}</p></section> : null}
        {allowed ? (
          <>
            <form className="activity-filter-bar">
              <span><Filter size={16} />Filter</span>
              <label>Status<select defaultValue={params.status ?? "all"} name="status"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
              <label>Category<select defaultValue={params.category ?? ""} name="category"><option value="">All categories</option>{notificationCategories.map((category) => <option key={category} value={category}>{notificationCategoryLabels[category]}</option>)}</select></label>
              <button className="secondary-action" type="submit">Apply</button>
            </form>
            {inbox.data.length ? (
              <section className="notification-inbox-list">
                {inbox.data.map((notification) => (
                  <article className={notification.read_at ? "" : "is-unread"} key={notification.id}>
                    <span className={`notification-category-icon ${notification.category}`}><Bell size={18} /></span>
                    <div>
                      <div className="notification-row-heading"><strong>{notification.title}</strong><time>{formatDateTime(notification.created_at)}</time></div>
                      {notification.body ? <p>{notification.body}</p> : null}
                      <div className="notification-row-actions">
                        {notification.destination_path ? <Link href={notification.destination_path}>Open record</Link> : null}
                        <span>{notificationCategoryLabels[notification.category as NotificationCategory]}</span>
                      </div>
                    </div>
                    <NotificationReadAction id={notification.id} read={Boolean(notification.read_at)} />
                  </article>
                ))}
              </section>
            ) : <section className="empty-state"><Bell size={28} /><h2>No matching notifications</h2><p>New customer activity will appear here.</p></section>}
            <ListPagination basePath="/admin/notifications" count={inbox.count} page={page} pageSize={30} params={{ category: params.category, status: params.status }} />
          </>
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function positivePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDateTime(value: string) {
  return formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
}
