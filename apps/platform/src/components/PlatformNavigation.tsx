"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Users,
  Building2,
  BriefcaseBusiness,
  ReceiptText,
  Command,
  HardHat,
  Leaf,
  LogOut,
  Menu,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRecordSearch } from "@/hooks/use-record-search";
import { PlatformModal } from "@/components/platform-modal";
import { SignOutForm } from "@/components/sign-out-form";
import { NotificationBell } from "@/components/notification-bell";
import type { PlatformRoleName } from "@/lib/auth/roles";
import {
  getVisibleNavigationCommands,
  getVisibleNavigationItems,
  isNavigationItemActive,
  navigationSectionLabels,
  type NavigationAudience,
  type NavigationItem,
  type NavigationSection,
} from "@/lib/navigation";

const adminSections: NavigationSection[] = ["workflow", "records", "operations", "team", "business"];
const crewSections: NavigationSection[] = ["crew", "team"];
const expansionStorageKey = "angel-tree-navigation-sections-v1";

type PlatformNavigationProps = {
  audience: NavigationAudience;
  roles: PlatformRoleName[];
  userEmail?: string | null;
};

export function PlatformNavigation({ audience, roles, userEmail }: PlatformNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useMemo(() => getVisibleNavigationItems(roles, audience), [audience, roles]);
  const activeItem = items.find((item) => isNavigationItemActive(pathname, item));
  const activeSection = activeItem?.section;
  const sections = audience === "admin" ? adminSections : crewSections;
  const [expanded, setExpanded] = useState<Partial<Record<NavigationSection, boolean>>>(() =>
    activeSection ? { [activeSection]: true } : {},
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(expansionStorageKey);
      if (stored) setExpanded((current) => ({ ...current, ...JSON.parse(stored) }));
    } catch {
      // Navigation remains deterministic when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (activeSection) setExpanded((current) => ({ ...current, [activeSection]: true }));
    setMobileOpen(false);
  }, [activeSection, pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleSection(section: NavigationSection) {
    if (section === activeSection) return;
    setExpanded((current) => {
      const next = { ...current, [section]: !current[section] };
      try {
        window.localStorage.setItem(expansionStorageKey, JSON.stringify(next));
      } catch {
        // Expansion preference is optional.
      }
      return next;
    });
  }

  const roleSummary = roles.length ? roles.join(", ") : "No role assigned";
  const canSeeNotifications = audience === "admin" && roles.some((role) => role === "owner" || role === "admin");

  return (
    <>
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <Brand href={audience === "crew" ? "/crew" : "/admin"} onIntent={(href) => router.prefetch(href)} />
          {canSeeNotifications ? <NotificationBell /> : null}
        </div>

        <nav className="workflow-navigation" aria-label="Platform navigation">
          {sections.map((section) => {
            const sectionItems = items.filter((item) => item.section === section);
            if (!sectionItems.length) return null;
            const isWorkflow = section === "workflow" || section === "crew";
            const isOpen = isWorkflow || Boolean(expanded[section]) || section === activeSection;

            return (
              <section className={`navigation-section navigation-section-${section}`} key={section}>
                {isWorkflow ? (
                  <p className="navigation-section-label">{navigationSectionLabels[section]}</p>
                ) : (
                  <button
                    aria-expanded={isOpen}
                    className="navigation-section-toggle"
                    onClick={() => toggleSection(section)}
                    type="button"
                  >
                    <span>{navigationSectionLabels[section]}</span>
                    <ChevronDown aria-hidden="true" className={isOpen ? "is-open" : ""} size={15} />
                  </button>
                )}
                {isOpen ? <NavigationLinks items={sectionItems} onIntent={(href) => router.prefetch(href)} pathname={pathname} /> : null}
              </section>
            );
          })}
        </nav>

        <div className="app-sidebar-footer">
          <button className="command-palette-trigger" onClick={() => setPaletteOpen(true)} type="button">
            <Search aria-hidden="true" size={15} />
            <span>Find or create</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="workspace-shortcuts" aria-label="Workspace shortcuts">
            {audience === "admin" ? <Link href="/crew" onFocus={() => router.prefetch("/crew")} onMouseEnter={() => router.prefetch("/crew")} onTouchStart={() => router.prefetch("/crew")} prefetch={false}><HardHat aria-hidden="true" size={15} />Crew workspace</Link> : null}
            <Link href="/employee" onFocus={() => router.prefetch("/employee")} onMouseEnter={() => router.prefetch("/employee")} onTouchStart={() => router.prefetch("/employee")} prefetch={false}><UserCheck aria-hidden="true" size={15} />My profile</Link>
          </div>
          <div className="app-user">
            <small>Signed in</small>
            <strong>{userEmail ?? "Platform user"}</strong>
            <span>{roleSummary}</span>
          </div>
          <SignOutForm>
            <button className="app-signout" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Sign out
            </button>
          </SignOutForm>
        </div>
      </aside>

      <header className="app-mobilebar">
        <Brand compact href={audience === "crew" ? "/crew" : "/admin"} onIntent={(href) => router.prefetch(href)} />
        <div className="mobilebar-actions">
          {canSeeNotifications ? <NotificationBell mobile /> : null}
          <button aria-label="Open command palette" className="mobile-icon-button" onClick={() => setPaletteOpen(true)} type="button">
            <Search aria-hidden="true" size={19} />
          </button>
          <button aria-expanded={mobileOpen} aria-label="Open navigation" className="mobile-menu-button" onClick={() => setMobileOpen(true)} type="button">
            <Menu aria-hidden="true" size={20} />
            Menu
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <PlatformModal className="mobile-navigation-layer" label="Platform navigation" onDismiss={() => setMobileOpen(false)}>
          <button aria-hidden="true" tabIndex={-1} className="mobile-navigation-backdrop" onClick={() => setMobileOpen(false)} type="button" />
          <aside aria-label="Mobile platform navigation" className="mobile-navigation-drawer">
            <div className="mobile-navigation-header">
              <Brand href={audience === "crew" ? "/crew" : "/admin"} onIntent={(href) => router.prefetch(href)} />
              <button data-modal-initial-focus aria-label="Close navigation" className="mobile-icon-button" onClick={() => setMobileOpen(false)} type="button"><X size={20} /></button>
            </div>
            <nav>
              {sections.map((section) => {
                const sectionItems = items.filter((item) => item.section === section);
                return sectionItems.length ? (
                  <section className="mobile-navigation-section" key={section}>
                    <p>{navigationSectionLabels[section]}</p>
                    <NavigationLinks items={sectionItems} onIntent={(href) => router.prefetch(href)} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                  </section>
                ) : null;
              })}
            </nav>
            <SignOutForm><button className="mobile-signout" type="submit"><LogOut size={17} />Sign out</button></SignOutForm>
          </aside>
        </PlatformModal>
      ) : null}

      {paletteOpen ? <CommandPalette audience={audience} items={items} onClose={() => setPaletteOpen(false)} roles={roles} /> : null}
    </>
  );
}

function Brand({ compact = false, href, onIntent }: { compact?: boolean; href: "/admin" | "/crew"; onIntent: (href: string) => void }) {
  return (
    <Link className="app-brand" href={href} onFocus={() => onIntent(href)} onMouseEnter={() => onIntent(href)} onTouchStart={() => onIntent(href)} prefetch={false}>
      <span className="app-brand-mark" aria-hidden="true"><Leaf size={17} /></span>
      <span><strong>Angel Tree</strong><small>{compact ? "Operations" : "Field service operations"}</small></span>
    </Link>
  );
}

function NavigationLinks({ items, onIntent, onNavigate, pathname }: { items: NavigationItem[]; onIntent: (href: string) => void; onNavigate?: () => void; pathname: string }) {
  return (
    <div className="navigation-links">
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item);
        return (
          <Link aria-current={active ? "page" : undefined} href={item.href} key={item.id} onClick={onNavigate} onFocus={() => onIntent(item.href)} onMouseEnter={() => onIntent(item.href)} onTouchStart={() => onIntent(item.href)} prefetch={false}>
            <item.icon aria-hidden="true" size={17} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function CommandPalette({ audience, items, onClose, roles }: { audience: NavigationAudience; items: NavigationItem[]; onClose: () => void; roles: PlatformRoleName[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const commands = useMemo(() => {
    const openCommands = items.map((item) => ({ ...item, label: `Open ${item.label}` }));
    return [...openCommands, ...getVisibleNavigationCommands(roles, audience)];
  }, [audience, items, roles]);
  const records = useRecordSearch(query, audience === "admin" && roles.some(role => ["owner","admin","estimator","payroll_admin"].includes(role)));
  const recordIcons = {customer:Users,organization:Building2,job:BriefcaseBusiness,quote:FileText,invoice:ReceiptText};
  const recordLabels = {customer:"Customer",organization:"Organization",job:"Work order",quote:"Quote",invoice:"Invoice"};
  const filtered = [
    ...records.results.map(record => ({...record,id:`${record.recordType}:${record.id}`,label:record.title,description:`${recordLabels[record.recordType]} · ${record.detail}`,icon:recordIcons[record.recordType],isRecord:true})),
    ...commands.filter((command) => `${command.label} ${command.keywords.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).map(command => ({...command,description:"Page or action",isRecord:false})),
  ];

  useEffect(() => setActiveIndex(0), [query, records.results]);
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, Math.min(index + 1, filtered.length - 1)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if ((event.key === "Home" || event.key === "End") && event.altKey) { event.preventDefault(); setActiveIndex(event.key === "Home" ? 0 : Math.max(0, filtered.length - 1)); }
    if (event.key === "Enter" && !event.nativeEvent.isComposing && filtered[activeIndex]) {
      event.preventDefault();
      // Native navigation survives modal teardown and respects before-unload
      // protection on an editor with unsaved work.
      window.location.assign(filtered[activeIndex].href);
    }
  }

  return (
    <PlatformModal className="command-palette-layer" label="Command palette" onDismiss={onClose}>
      <button aria-hidden="true" tabIndex={-1} className="command-palette-backdrop" onClick={onClose} type="button" />
      <section className={`command-palette${audience === "admin" ? " has-record-search" : ""}`}>
        <div className="command-palette-search">
          <Search aria-hidden="true" size={19} />
          <input data-modal-initial-focus role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined} aria-label={audience === "admin" ? "Find a record, page or action" : "Find a page or action"} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} maxLength={80} placeholder={audience === "admin" ? "Name, phone, address, quote or invoice…" : "Find a page or action…"} ref={inputRef} value={query} />
          <button aria-label="Close command palette" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {audience === "admin" ? <p className="command-search-status" role="status">{records.status === "loading" ? "Searching records…" : records.status === "error" ? "Record search is unavailable. Try again; page shortcuts still work." : records.status === "ready" ? records.results.length ? `${records.results.length} record matches. Showing up to four per type.` : "No matching records. Try a name, phone or document number." : "Type at least two characters to search records."}</p> : null}
        <div aria-label="Records, pages and actions" aria-busy={records.status === "loading"} className="command-palette-results" id={listId} role="listbox">
          {filtered.length ? filtered.map((command, index) => (
            <Link id={`${listId}-${index}`} tabIndex={-1} aria-selected={index === activeIndex} className={index === activeIndex ? "is-active" : ""} href={command.href} key={`${command.isRecord ? "record" : "command"}-${command.id}`} onClick={onClose} onFocus={() => router.prefetch(command.href)} onMouseEnter={() => { setActiveIndex(index); router.prefetch(command.href); }} onTouchStart={() => router.prefetch(command.href)} prefetch={false} role="option">
              <span><command.icon aria-hidden="true" size={18} /><span className="command-result-label"><strong>{command.label}</strong>{command.isRecord ? <small>{command.description}</small> : null}</span></span>
              <Command aria-hidden="true" size={14} />
            </Link>
          )) : records.status === "loading" ? null : <p className="command-palette-empty">No matching shortcut.</p>}
        </div>
        <footer><span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span></footer>
      </section>
    </PlatformModal>
  );
}
