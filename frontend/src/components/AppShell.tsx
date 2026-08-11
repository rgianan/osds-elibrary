import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollText, Search, Settings, ShieldCheck, Sparkles, Tags, Users, X } from 'lucide-react';
import type { CurrentUser } from '@/types';
import { getPermissions } from '@/lib/permissions';
import { api, isGasRuntime } from '@/lib/gasClient';
import { cn } from '@/lib/utils';
import { ProfileMenu } from '@/components/ProfileMenu';

const SETTINGS_MENU = [
  { route: 'SettingsUsers', icon: Users, title: 'User Management', description: 'Add, edit, and deactivate the ched.gov.ph accounts allowed into the E-Library.' },
  { route: 'SettingsTags', icon: Tags, title: 'Tags', description: 'Create and maintain the tag vocabulary used when filing documents.' },
  { route: 'SettingsAudit', icon: ScrollText, title: 'Audit Log', description: 'Who created, changed, or deleted what — and every question asked of the assistant.' },
  { route: 'SettingsHealth', icon: ShieldCheck, title: 'Library Health', description: 'Check every document against Drive for files deleted, binned, or moved out of place.' },
] as const;

type Props = {
  user: CurrentUser;
  activeRoute: string;
  onNavigate: (route: string) => void;
  onUserSwitched: () => void;
  searchQuery: string;
  onSearchChange: (next: string) => void;
  onAsk: () => void;
  children: ReactNode;
};

export function AppShell({ user, activeRoute, onNavigate, onUserSwitched, searchQuery, onSearchChange, onAsk, children }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const permissions = getPermissions(user);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 h-14 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="flex h-full items-center gap-3 px-6">
          <button
            type="button"
            onClick={() => onNavigate('Browse')}
            className="flex shrink-0 items-center gap-2.5 text-left"
            title="Back to the library"
          >
            <img
              src="https://ik.imagekit.io/k2qmtccm6/osds_logo_alt.png?updatedAt=1694734076531"
              alt="OSDS"
              className="h-8 w-8 object-contain"
            />
            <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:block">OSDS E-Library</span>
          </button>

          <div className="mx-4 flex min-w-0 flex-1 items-center justify-center gap-2">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search the library — try “CMO 16 2026”, “AOM 2023”, or “CEB August 2025”"
                aria-label="Search the library"
                title={'Searches every category by name, tag, and remarks.\n\nShorthand is understood: CMO, CAO/AO, JAO, JMC, AOM, OO, WFP, CEB — plus a year (2016, s. 2016) and an issuance number (16, No. 16).'}
                className={cn(
                  'h-9 w-full rounded-full border border-input bg-background px-9 text-sm text-foreground outline-none transition',
                  'placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20',
                )}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1.5 rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onAsk}
              title="Ask a question about the library"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3">
            <DevUserSwitcher onUserSwitched={onUserSwitched} />

            {permissions.openSettings ? (
              <div
                className="relative"
                onMouseEnter={() => setSettingsOpen(true)}
                onMouseLeave={() => setSettingsOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setSettingsOpen((open) => !open)}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition',
                    activeRoute.startsWith('Settings')
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  aria-haspopup="menu"
                  aria-expanded={settingsOpen}
                  title="Administrator settings: users, tags, and the audit log"
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </button>

                {settingsOpen ? (
                  // A genuine menu: every child is an action, so menu semantics are accurate here.
                  <div role="menu" className="settings-hover-panel absolute right-0 top-full z-50 w-[380px] rounded-lg border border-border bg-card p-2 shadow-xl">
                    {SETTINGS_MENU.map((menu) => (
                      <button
                        key={menu.route}
                        type="button"
                        role="menuitem"
                        onClick={() => { setSettingsOpen(false); onNavigate(menu.route); }}
                        title={menu.description}
                        className="flex w-full items-start gap-3 rounded-md border border-transparent p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <menu.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">{menu.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{menu.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <ProfileMenu user={user} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/**
 * Dev-only affordance: in `npm run dev` there is no Google session, so this switches which seeded
 * mock account is "signed in" to exercise Admin vs staff behavior. It renders nothing once the app
 * is running inside Apps Script, where the real Google identity applies.
 */
function DevUserSwitcher({ onUserSwitched }: { onUserSwitched: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (isGasRuntime() || loaded.current) return;
    loaded.current = true;
    api.listMockUserEmails().then(setEmails, () => setEmails([]));
  }, []);

  if (isGasRuntime() || emails.length === 0) return null;

  return (
    <label className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold uppercase text-amber-600 dark:text-amber-400">Dev</span>
      <select
        className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground"
        onChange={async (event) => {
          // Switching to a denied account (inactive, or off-domain) rejects by design — the
          // re-bootstrap still has to run so App can render the access-denied screen.
          await api.switchMockUser(event.target.value).catch(() => undefined);
          onUserSwitched();
        }}
      >
        {emails.map((email) => <option key={email} value={email}>{email}</option>)}
      </select>
    </label>
  );
}
