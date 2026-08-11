import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ExternalLink, Monitor, Moon, Sun } from 'lucide-react';
import type { CurrentUser } from '@/types';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string; hint: string }[] = [
  { value: 'light', icon: Sun, label: 'Light', hint: 'Always the light theme' },
  { value: 'dark', icon: Moon, label: 'Dark', hint: 'Always the dark theme' },
  { value: 'system', icon: Monitor, label: 'System default', hint: 'Follow this device’s setting' },
];

/**
 * The user manual, kept in the library's own Drive folder so it inherits the same access as the
 * documents — every active account can open it, nobody else can. Replacing the file in Drive keeps
 * this link valid; only uploading a *new* file would require changing it here.
 */
const USER_MANUAL_URL = 'https://drive.google.com/file/d/1Z2Bvg2cADOjK3U99CsxgRX_g3gFgaxS1/view?usp=drive_link';

function initialsOf(name: string, email: string) {
  const source = String(name || email || '').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Account menu: who you are signed in as, plus the appearance preference.
 *
 * Appearance lives here rather than in Settings because Settings is Admin-only, while the theme is a
 * personal preference every user needs — and because it is set once and then forgotten, so it does
 * not deserve permanent header space.
 */
/*
 * Deliberately aria-haspopup="true" rather than "menu", and role="group" rather than "menu" on the
 * panel: it mixes a link with a radiogroup, which are not valid menu children. Claiming menu
 * semantics would have a screen reader promise arrow-key navigation that does not exist here.
 * The Settings panel in AppShell is a real menu — every child there is an action.
 */
export function ProfileMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const { preference, setPreference, resolved } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm transition',
          open ? 'border-primary/40 bg-accent' : 'border-border hover:bg-accent',
        )}
        title={user.email}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {initialsOf(user.name, user.email)}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium text-foreground lg:block">{user.name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          role="group"
          aria-label="Account and preferences"
          className="settings-hover-panel absolute right-0 top-full z-50 mt-1.5 w-[290px] rounded-lg border border-border bg-card p-3 shadow-xl"
        >
          <div className="flex items-center gap-3 pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initialsOf(user.name, user.email)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {user.role === 'ADMIN' ? 'Administrator' : 'Staff'}
          </div>

          {/*
            Above Appearance on purpose: Appearance is a three-row block, so a single link placed
            after it lands at the very bottom of the panel and reads as an afterthought. The manual
            is what a new or occasional user needs; the theme is set once and forgotten.
          */}
          <a
            href={USER_MANUAL_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            title="Open the E-Library user manual in a new tab"
            className="mt-3 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-foreground/90 transition hover:bg-accent"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block leading-tight">User Manual</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">How to search, upload, tag, and file</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</span>
              <span className="text-[11px] text-muted-foreground">
                {preference === 'system' ? `System · ${resolved}` : null}
              </span>
            </div>
            <div role="radiogroup" aria-label="Colour theme" className="space-y-0.5">
              {THEME_OPTIONS.map((option) => {
                const active = preference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={option.hint}
                    onClick={() => setPreference(option.value)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition',
                      active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/90 hover:bg-accent',
                    )}
                  >
                    <option.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block leading-tight">{option.label}</span>
                      <span className="block text-[11px] leading-tight text-muted-foreground">{option.hint}</span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
