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
import {
  isSystemHealthNotification,
  normalizeNotificationInboxTab,
} from "@/lib/notifications/scope";
import { SetupRequired } from "@/components/SetupRequired";

type Props = { searchParams: Promise<{ category?: string; page?: string; status?: string; tab?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/notifications");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening notifications" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const page = positivePage(params.page);
  const tab = normalizeNotificationInboxTab(params.tab);
  const inbox = allowed
    ? await getNotificationInbox({
      category: params.category,
      page,
      pageSize: 30,
      scope: tab,
      status: params.status,
      userId: context.user.id,
    })
    : { count: 0, data: [], error: null };

  return (
    <PlatformFrame active="notifications" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content notification-inbox-page">
        <section className="page-heading notification-heading">
          <div>
            <p className="surface-label"><Bell size={18} />{tab === "system" ? "System monitoring" : "Customer activity"}</p>
            <h1>Notifications</h1>
            <p>{tab === "system" ? "Service and integration incidents are kept separate from day-to-day customer activity." : "Customer and office activity that may need attention."}</p>
          </div>
          {allowed ? <MarkAllNotificationsRead scope={tab} /> : null}
        </section>
        {!allowed ? <section className="empty-state"><h2>Owner or admin access required</h2><p>This inbox is restricted to administrators.</p></section> : null}
        {inbox.error ? <section className="data-warning"><strong>Database notice</strong><p>{inbox.error}</p></section> : null}
        {allowed ? (
          <>
            <nav aria-label="Notification type" className="notification-tabs notification-page-tabs">
              <Link aria-current={tab === "activity" ? "page" : undefined} className={tab === "activity" ? "is-active" : ""} href="/admin/notifications?tab=activity">Activity</Link>
              <Link aria-current={tab === "system" ? "page" : undefined} className={tab === "system" ? "is-active" : ""} href="/admin/notifications?tab=system">System status</Link>
            </nav>
            <form className="activity-filter-bar">
              <input name="tab" type="hidden" value={tab} />
              <span><Filter size={16} />Filter</span>
              <label>Status<select defaultValue={params.status ?? "all"} name="status"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
              {tab === "activity" ? (
                <label>Category<select defaultValue={params.category ?? ""} name="category"><option value="">All categories</option>{notificationCategories.map((category) => <option key={category} value={category}>{notificationCategoryLabels[category]}</option>)}</select></label>
              ) : null}
              <button className="secondary-action" type="submit">Apply</button>
            </form>
            {inbox.data.length ? (
              <section className="notification-inbox-list">
                {inbox.data.map((notification) => {
                  const systemNotification = isSystemHealthNotification(notification);
                  return (
                    <article className={notification.read_at ? "" : "is-unread"} key={notification.id}>
                      <span className={`notification-category-icon ${systemNotification ? "system_health" : notification.category}`}><Bell size={18} /></span>
                      <div>
                        <div className="notification-row-heading"><strong>{notification.title}</strong><time>{formatDateTime(notification.created_at)}</time></div>
                        {notification.body ? <p>{notification.body}</p> : null}
                        <div className="notification-row-actions">
                          {notification.destination_path ? <Link href={notification.destination_path}>{systemNotification ? "Open system health" : "Open record"}</Link> : null}
                          <span>{systemNotification ? "System status" : notificationCategoryLabels[notification.category as NotificationCategory]}</span>
                        </div>
                      </div>
                      <NotificationReadAction id={notification.id} read={Boolean(notification.read_at)} />
                    </article>
                  );
                })}
              </section>
            ) : (
              <section className="empty-state">
                <Bell size={28} />
                <h2>No matching {tab === "system" ? "system alerts" : "notifications"}</h2>
                <p>{tab === "system" ? "System health incidents and recoveries will appear here." : "New customer activity will appear here."}</p>
              </section>
            )}
            <ListPagination
              basePath="/admin/notifications"
              count={inbox.count}
              page={page}
              pageSize={30}
              params={{
                category: tab === "activity" ? params.category : undefined,
                status: params.status,
                tab,
              }}
            />
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
