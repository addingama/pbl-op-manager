import { redirect } from 'next/navigation';
import {
  adminListResponseSchema,
  appSettingsResponseSchema,
} from '@pbl/shared';
import { AdminSettingsClient } from '@/components/admin-settings-client';
import { apiGet } from '@/lib/api/server';
import { getAdminSession } from '@/lib/auth';
import { messages } from '@/messages';

export default async function AdminSettingsPage() {
  const me = await getAdminSession();
  if (me === null) redirect('/login?next=/admin/settings');

  const [settings, admins] = await Promise.all([
    apiGet('/api/settings', appSettingsResponseSchema),
    apiGet('/api/admins', adminListResponseSchema),
  ]);

  if (settings === null || admins === null) {
    return <p className="text-sm text-slate-600">{messages.adminSettings.loadFailed}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.adminSettings.title}</h1>
      <AdminSettingsClient defaults={settings.defaults} admins={admins.admins} me={me} />
    </div>
  );
}
