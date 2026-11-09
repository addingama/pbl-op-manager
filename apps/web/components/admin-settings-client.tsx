'use client';

import type { AdminMe, AppDefaults } from '@pbl/shared';
import {
  adminListResponseSchema,
  appSettingsResponseSchema,
  type AdminUser,
} from '@pbl/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { messages } from '@/messages';

const generatorModes = [
  'RANDOM',
  'BALANCED_ELO',
  'MEXICANO',
  'AMERICANO',
  'FIXED_PARTNER',
  'MANUAL',
] as const;

export function AdminSettingsClient({
  defaults,
  admins: initialAdmins,
  me,
}: {
  defaults: AppDefaults;
  admins: AdminUser[];
  me: AdminMe;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(defaults.defaultMode);
  const [courtCount, setCourtCount] = useState(String(defaults.defaultCourtCount));
  const [visibility, setVisibility] = useState(defaults.defaultVisibility);
  const [defaultsMsg, setDefaultsMsg] = useState<string | null>(null);

  const [admins, setAdmins] = useState(initialAdmins);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function saveDefaults() {
    setDefaultsMsg(null);
    const res = await clientJson('/api/settings', {
      method: 'PATCH',
      headers: csrfMutationHeaders(),
      body: JSON.stringify({
        defaultMode: mode,
        defaultCourtCount: Number(courtCount),
        defaultVisibility: visibility,
      }),
    });
    if (!res.ok) {
      setDefaultsMsg(res.message);
      return;
    }
    appSettingsResponseSchema.parse(res.data);
    setDefaultsMsg(messages.adminSettings.saved);
    router.refresh();
  }

  async function refreshAdmins() {
    const res = await clientJson('/api/admins', { method: 'GET' });
    if (res.ok) {
      const parsed = adminListResponseSchema.parse(res.data);
      setAdmins(parsed.admins);
    }
  }

  async function createAdmin() {
    setAdminMsg(null);
    const res = await clientJson('/api/admins', {
      method: 'POST',
      headers: csrfMutationHeaders(),
      body: JSON.stringify({
        email: newEmail,
        displayName: newName,
        password: newPassword,
      }),
    });
    if (!res.ok) {
      setAdminMsg(res.message);
      return;
    }
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setAdminMsg(messages.adminSettings.adminCreated);
    await refreshAdmins();
  }

  async function toggleAdmin(id: string, active: boolean) {
    setAdminMsg(null);
    const res = await clientJson(`/api/admins/${id}`, {
      method: 'PATCH',
      headers: csrfMutationHeaders(),
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      setAdminMsg(res.message);
      return;
    }
    await refreshAdmins();
  }

  async function changePassword() {
    setPwMsg(null);
    const res = await clientJson('/api/auth/change-password', {
      method: 'POST',
      headers: csrfMutationHeaders(),
      body: JSON.stringify({ currentPassword, newPassword: newPw }),
    });
    if (!res.ok) {
      setPwMsg(res.message);
      return;
    }
    setCurrentPassword('');
    setNewPw('');
    setPwMsg(messages.adminSettings.passwordChanged);
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="defaults-heading">
        <h2 id="defaults-heading" className="text-lg font-semibold">
          {messages.adminSettings.defaultsTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{messages.adminSettings.defaultsHint}</p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{messages.live.mode}</span>
            <select
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as AppDefaults['defaultMode']);
              }}
            >
              {generatorModes.map((m) => (
                <option key={m} value={m}>
                  {messages.generatorMode[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{messages.adminSettings.defaultCourts}</span>
            <input
              type="number"
              min={1}
              max={99}
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              value={courtCount}
              onChange={(e) => {
                setCourtCount(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{messages.adminSettings.defaultVisibility}</span>
            <select
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value as AppDefaults['defaultVisibility']);
              }}
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
          </label>
          <p className="text-sm text-slate-600">
            {messages.adminSettings.rankedThreshold}: {defaults.rankedThreshold}
          </p>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white"
            onClick={() => void saveDefaults()}
          >
            {messages.adminSettings.saveDefaults}
          </button>
          {defaultsMsg ? <p className="text-sm text-emerald-800">{defaultsMsg}</p> : null}
        </div>
      </section>

      <section aria-labelledby="admins-heading">
        <h2 id="admins-heading" className="text-lg font-semibold">
          {messages.adminSettings.adminsTitle}
        </h2>
        <ul className="mt-3 flex flex-col gap-2" data-testid="admin-list">
          {admins.map((a) => (
            <li
              key={a.id}
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{a.displayName}</p>
                <p className="truncate text-slate-600">{a.email}</p>
              </div>
              {a.id === me.id ? (
                <span className="text-xs text-slate-500">{messages.adminSettings.you}</span>
              ) : (
                <button
                  type="button"
                  className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-medium"
                  onClick={() => void toggleAdmin(a.id, !a.active)}
                >
                  {a.active ? messages.adminSettings.deactivate : messages.adminSettings.activate}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <input
            placeholder={messages.login.email}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
            }}
          />
          <input
            placeholder={messages.adminSettings.displayName}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
          />
          <input
            type="password"
            placeholder={messages.login.password}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
            }}
          />
          <button
            type="button"
            className="min-h-11 rounded-lg bg-slate-800 px-4 text-sm font-medium text-white"
            onClick={() => void createAdmin()}
          >
            {messages.adminSettings.addAdmin}
          </button>
          {adminMsg ? <p className="text-sm text-emerald-800">{adminMsg}</p> : null}
        </div>
      </section>

      <section aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-lg font-semibold">
          {messages.adminSettings.passwordTitle}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          <input
            type="password"
            autoComplete="current-password"
            placeholder={messages.adminSettings.currentPassword}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
            }}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={messages.adminSettings.newPassword}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
            value={newPw}
            onChange={(e) => {
              setNewPw(e.target.value);
            }}
          />
          <button
            type="button"
            className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white"
            onClick={() => void changePassword()}
          >
            {messages.adminSettings.changePassword}
          </button>
          {pwMsg ? <p className="text-sm text-emerald-800">{pwMsg}</p> : null}
        </div>
      </section>
    </div>
  );
}
