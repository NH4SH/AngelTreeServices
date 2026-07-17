"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Command,
  HardHat,
  Leaf,
  LogOut,
  Menu,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "@/app/login/actions";
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

  return (
    <>
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <Brand />
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
                {isOpen ? <NavigationLinks items={sectionItems} pathname={pathname} /> : null}
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
            {audience === "admin" ? <Link href="/crew"><HardHat aria-hidden="true" size={15} />Crew workspace</Link> : null}
            <Link href="/employee"><UserCheck aria-hidden="true" size={15} />My profile</Link>
          </div>
          <div className="app-user">
            <small>Signed in</small>
            <strong>{userEmail ?? "Platform user"}</strong>
            <span>{roleSummary}</span>
          </div>
          <form action={signOut}>
            <button className="app-signout" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="app-mobilebar">
        <Brand compact />
        <div className="mobilebar-actions">
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
        <div className="mobile-navigation-layer">
          <button aria-label="Close navigation" className="mobile-navigation-backdrop" onClick={() => setMobileOpen(false)} type="button" />
          <aside aria-label="Mobile platform navigation" className="mobile-navigation-drawer">
            <div className="mobile-navigation-header">
              <Brand />
              <button aria-label="Close navigation" className="mobile-icon-button" onClick={() => setMobileOpen(false)} type="button"><X size={20} /></button>
            </div>
            <nav>
              {sections.map((section) => {
                const sectionItems = items.filter((item) => item.section === section);
                return sectionItems.length ? (
                  <section className="mobile-navigation-section" key={section}>
                    <p>{navigationSectionLabels[section]}</p>
                    <NavigationLinks items={sectionItems} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                  </section>
                ) : null;
              })}
            </nav>
            <form action={signOut}><button className="mobile-signout" type="submit"><LogOut size={17} />Sign out</button></form>
          </aside>
        </div>
      ) : null}

      {paletteOpen ? <CommandPalette audience={audience} items={items} onClose={() => setPaletteOpen(false)} roles={roles} /> : null}
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="app-brand" href="/admin">
      <span className="app-brand-mark" aria-hidden="true"><Leaf size={17} /></span>
      <span><strong>Angel Tree</strong><small>{compact ? "Operations" : "Field service operations"}</small></span>
    </Link>
  );
}

function NavigationLinks({ items, onNavigate, pathname }: { items: NavigationItem[]; onNavigate?: () => void; pathname: string }) {
  return (
    <div className="navigation-links">
      {items.map((item) => {
        const active = isNavigationItemActive(pathname, item);
        return (
          <Link aria-current={active ? "page" : undefined} href={item.href} key={item.id} onClick={onNavigate}>
            <item.icon aria-hidden="true" size={17} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function CommandPalette({ audience, items, onClose, roles }: { audience: NavigationAudience; items: NavigationItem[]; onClose: () => void; roles: PlatformRoleName[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const commands = useMemo(() => {
    const openCommands = items.map((item) => ({ ...item, label: `Open ${item.label}` }));
    return [...openCommands, ...getVisibleNavigationCommands(roles, audience)];
  }, [audience, items, roles]);
  const filtered = commands.filter((command) => `${command.label} ${command.keywords.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActiveIndex(0), [query]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && filtered[activeIndex]) {
      window.location.assign(filtered[activeIndex].href);
    }
  }

  return (
    <div className="command-palette-layer" role="presentation">
      <button aria-label="Close command palette" className="command-palette-backdrop" onClick={onClose} type="button" />
      <section aria-label="Command palette" aria-modal="true" className="command-palette" role="dialog">
        <div className="command-palette-search">
          <Search aria-hidden="true" size={19} />
          <input aria-label="Find a page or action" onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="Find a page or action…" ref={inputRef} value={query} />
          <button aria-label="Close command palette" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="command-palette-results" role="listbox">
          {filtered.length ? filtered.map((command, index) => (
            <Link aria-selected={index === activeIndex} className={index === activeIndex ? "is-active" : ""} href={command.href} key={command.id} onClick={onClose} onMouseEnter={() => setActiveIndex(index)} role="option">
              <span><command.icon aria-hidden="true" size={18} /><strong>{command.label}</strong></span>
              <Command aria-hidden="true" size={14} />
            </Link>
          )) : <p className="command-palette-empty">No matching page or action.</p>}
        </div>
        <footer><span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span></footer>
      </section>
    </div>
  );
}
