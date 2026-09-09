import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { BrowsePage } from '@/pages/BrowsePage';
import { SettingsUsersPage } from '@/pages/SettingsUsersPage';
import { SettingsTagsPage } from '@/pages/SettingsTagsPage';
import { SettingsAuditPage } from '@/pages/SettingsAuditPage';
import { SettingsHealthPage } from '@/pages/SettingsHealthPage';
import { SettingsCategoriesPage } from '@/pages/SettingsCategoriesPage';
import { AppSkeleton } from '@/components/AppSkeleton';
import { Callout } from '@/components/ui/Callout';
import { api } from '@/lib/gasClient';
import { CACHE_KEYS, clearCache, put } from '@/lib/cache';
import { getPermissions } from '@/lib/permissions';
import { setCategories } from '@/lib/categories';
import type { CurrentUser } from '@/types';

type Route = 'Browse' | 'SettingsUsers' | 'SettingsTags' | 'SettingsAudit' | 'SettingsHealth' | 'SettingsCategories';

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [route, setRoute] = useState<Route>('Browse');
  const [error, setError] = useState('');
  // Search lives in the header but its results render in BrowsePage, so the query is held here.
  const [searchQuery, setSearchQuery] = useState('');
  const [askOpen, setAskOpen] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      setError('');
      // Re-bootstrapping means the signed-in account may have changed; nothing cached for the old
      // one may be reused, and the fresh categories below are what seeds the empty cache.
      clearCache();
      const res = await api.getBootstrap();
      if (!res || typeof res !== 'object' || !res.user) {
        throw new Error('Bootstrap response was malformed: missing user.');
      }
      if (!res.user.email || !res.user.role) {
        throw new Error('Bootstrap response was malformed: user is missing email or role.');
      }
      // Must run before anything renders: the sidebar, dialogs and search parser all read the tree.
      setCategories(res.categories || []);
      // Bootstrap already carries the taxonomy, so the Categories page opens without re-reading it.
      put(CACHE_KEYS.categories, res.categories || []);
      setUser(res.user);
      setRoute('Browse');
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : 'Failed to load the E-Library.');
    }
  }, []);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Callout tone="error" className="max-w-lg p-5">
          <div className="mb-1 font-semibold">Cannot open the OSDS E-Library</div>
          <div>{error}</div>
        </Callout>
      </div>
    );
  }

  if (!user) return <AppSkeleton />;

  const permissions = getPermissions(user);

  function navigate(next: string) {
    if (next === 'Browse' || next === 'SettingsUsers' || next === 'SettingsTags' || next === 'SettingsAudit' || next === 'SettingsHealth' || next === 'SettingsCategories') setRoute(next);
  }

  // Searching or asking from a Settings page should show the results, not leave them off-screen.
  function search(next: string) {
    setSearchQuery(next);
    setRoute('Browse');
  }

  return (
    <AppShell
      user={user}
      activeRoute={route}
      onNavigate={navigate}
      onUserSwitched={bootstrap}
      searchQuery={searchQuery}
      onSearchChange={search}
      onAsk={() => { setRoute('Browse'); setAskOpen(true); }}
    >
      {route === 'Browse' ? (
        <BrowsePage
          user={user}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          askOpen={askOpen}
          onAskOpenChange={setAskOpen}
        />
      ) : null}
      {route === 'SettingsUsers' && permissions.manageUsers ? <SettingsUsersPage onBack={() => setRoute('Browse')} /> : null}
      {route === 'SettingsTags' && permissions.manageTags ? <SettingsTagsPage onBack={() => setRoute('Browse')} /> : null}
      {route === 'SettingsAudit' && permissions.viewAuditLog ? <SettingsAuditPage onBack={() => setRoute('Browse')} /> : null}
      {route === 'SettingsHealth' && permissions.viewLibraryHealth ? <SettingsHealthPage onBack={() => setRoute('Browse')} /> : null}
      {route === 'SettingsCategories' && permissions.manageCategories ? <SettingsCategoriesPage onBack={() => setRoute('Browse')} /> : null}
    </AppShell>
  );
}
