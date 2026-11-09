'use client';

import { sessionDetailSchema } from '@pbl/shared';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Input } from '@pbl/ui';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { messages } from '@/messages';

function defaultStartsAtLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateSessionForm() {
  const router = useRouter();
  const defaultWhen = useMemo(() => defaultStartsAtLocal(), []);
  const [title, setTitle] = useState('');
  const [startsAtLocal, setStartsAtLocal] = useState(defaultWhen);
  const [venue, setVenue] = useState('');
  const [courtCount, setCourtCount] = useState('2');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [openForRegistration, setOpenForRegistration] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="create-session-form"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setBusy(true);
          setError(null);
          const startsAt = new Date(startsAtLocal);
          if (Number.isNaN(startsAt.getTime())) {
            setError(messages.sessions.createInvalidDate);
            setBusy(false);
            return;
          }
          const courts = Number(courtCount);
          if (!Number.isInteger(courts) || courts < 1) {
            setError(messages.sessions.createInvalidCourts);
            setBusy(false);
            return;
          }
          const create = await clientJson('/api/sessions', {
            method: 'POST',
            headers: csrfMutationHeaders(),
            body: JSON.stringify({
              title: title.trim(),
              startsAt: startsAt.toISOString(),
              courtCount: courts,
              visibility,
              ...(venue.trim() !== '' ? { venue: venue.trim() } : {}),
            }),
          });
          if (!create.ok) {
            setError(create.message);
            setBusy(false);
            return;
          }
          const session = sessionDetailSchema.parse(create.data);
          if (openForRegistration) {
            const open = await clientJson(`/api/sessions/${session.id}`, {
              method: 'PATCH',
              headers: csrfMutationHeaders(),
              body: JSON.stringify({ status: 'OPEN' }),
            });
            if (!open.ok) {
              setError(open.message);
              setBusy(false);
              return;
            }
          }
          router.push(`/sessions/${session.id}`);
          router.refresh();
        })();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.sessions.createTitleLabel}
        <Input
          required
          maxLength={200}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.sessions.createStartsAt}
        <Input
          required
          type="datetime-local"
          value={startsAtLocal}
          onChange={(e) => {
            setStartsAtLocal(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.sessions.createVenue}
        <Input
          value={venue}
          maxLength={200}
          onChange={(e) => {
            setVenue(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.sessions.createCourts}
        <Input
          required
          type="number"
          min={1}
          max={99}
          value={courtCount}
          onChange={(e) => {
            setCourtCount(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.adminSettings.defaultVisibility}
        <select
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE');
          }}
        >
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Private</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={openForRegistration}
          onChange={(e) => {
            setOpenForRegistration(e.target.checked);
          }}
        />
        {messages.sessions.createOpenNow}
      </label>
      {error !== null ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full" data-testid="create-session-submit">
        {messages.sessions.createSubmit}
      </Button>
    </form>
  );
}
