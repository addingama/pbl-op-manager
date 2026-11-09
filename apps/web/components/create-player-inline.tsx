'use client';

import { createPlayerResponseSchema } from '@pbl/shared';
import type { Participant } from '@/lib/session-detail';
import { Button, Input } from '@pbl/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { messages } from '@/messages';

interface CreatePlayerInlineProps {
  readonly sessionId: string;
  readonly sessionParticipants: Participant[];
  readonly onPlayerCreated?: () => void;
}

export function CreatePlayerInline({
  sessionId,
  sessionParticipants,
  onPlayerCreated,
}: CreatePlayerInlineProps) {
  const router = useRouter();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [addNewPlayerToSession, setAddNewPlayerToSession] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const inSession = useMemo(
    () =>
      new Set(
        sessionParticipants.filter((p) => p.status !== 'REMOVED').map((p) => p.playerId),
      ),
    [sessionParticipants],
  );

  useEffect(() => {
    setError(null);
    setFeedback(null);
  }, [sessionParticipants]);

  const addPlayerToSession = useCallback(
    async (playerId: string) => {
      const res = await clientJson(`/api/sessions/${sessionId}/participants`, {
        method: 'POST',
        headers: {
          ...csrfMutationHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ playerIds: [playerId] }),
      });
      if (!res.ok) {
        setError(res.message);
        return false;
      }
      setFeedback(messages.sessionDetail.added);
      return true;
    },
    [sessionId],
  );

  const createPlayer = useCallback(async () => {
    const name = newPlayerName.trim();
    if (name === '') return;
    setError(null);
    setFeedback(null);
    setPending(true);
    const res = await clientJson('/api/players', {
      method: 'POST',
      headers: { ...csrfMutationHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: name }),
    });
    if (!res.ok) {
      setPending(false);
      setError(res.message);
      return;
    }
    const { player, warnings } = createPlayerResponseSchema.parse(res.data);
    setNewPlayerName('');
    setPending(false);
    if (warnings !== undefined && warnings.length > 0) {
      setFeedback(
        `${messages.sessionDetail.createPlayerCreated} (${warnings[0]?.players.map((p) => p.displayName).join(', ') ?? 'similar names exist'})`,
      );
    } else {
      setFeedback(messages.sessionDetail.createPlayerCreated);
    }
    onPlayerCreated?.();
    if (addNewPlayerToSession && !inSession.has(player.id)) {
      setPending(true);
      const ok = await addPlayerToSession(player.id);
      setPending(false);
      if (ok) router.refresh();
    } else {
      router.refresh();
    }
  }, [
    addNewPlayerToSession,
    addPlayerToSession,
    inSession,
    newPlayerName,
    onPlayerCreated,
    router,
  ]);

  return (
    <section
      className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3"
      aria-labelledby="create-player-title"
      data-testid="create-player-section"
    >
      <p id="create-player-title" className="text-sm font-medium text-slate-800">
        {messages.sessionDetail.createPlayerTitle}
      </p>
      {pending ? <p className="text-sm text-slate-600">{messages.sessionDetail.saving}</p> : null}
      {error !== null ? (
        <p className="text-sm text-red-700" role="alert" data-testid="create-player-error">
          {error}
        </p>
      ) : null}
      {feedback !== null && error === null ? (
        <p className="text-sm text-emerald-800" data-testid="create-player-feedback">
          {feedback}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        {messages.sessionDetail.createPlayerName}
        <Input
          value={newPlayerName}
          maxLength={120}
          data-testid="create-player-name"
          onChange={(e) => {
            setNewPlayerName(e.target.value);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={addNewPlayerToSession}
          onChange={(e) => {
            setAddNewPlayerToSession(e.target.checked);
          }}
        />
        {messages.sessionDetail.createPlayerAddToSession}
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={pending || newPlayerName.trim() === ''}
        data-testid="create-player-submit"
        onClick={() => {
          void createPlayer();
        }}
      >
        {messages.sessionDetail.createPlayerSubmit}
      </Button>
    </section>
  );
}
