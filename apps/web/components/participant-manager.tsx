'use client';

import { type AddParticipantsBody, type PlayerListItem } from '@pbl/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@pbl/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { objectRecord, parseParticipant } from '@/lib/participant-parse';
import {
  filterPlayersForPicker,
  partitionParticipants,
  type Participant,
} from '@/lib/session-detail';
import { messages } from '@/messages';

type PlayerRow = PlayerListItem;

interface ParticipantManagerProps {
  readonly sessionId: string;
  readonly initialParticipants: Participant[];
}

export function ParticipantManager({ sessionId, initialParticipants }: ParticipantManagerProps) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  useEffect(() => {
    void (async () => {
      const res = await clientJson('/api/players', { method: 'GET' });
      if (res.ok) {
        const row = objectRecord(res.data);
        const list = row?.['players'];
        if (Array.isArray(list)) setPlayers(list as PlayerRow[]);
      }
    })();
  }, []);

  const inSession = useMemo(
    () => new Set(participants.filter((p) => p.status !== 'REMOVED').map((p) => p.playerId)),
    [participants],
  );

  const pickerOptions = useMemo(
    () => filterPlayersForPicker(players, query, inSession),
    [players, query, inSession],
  );

  const { roster, waitlist, inactive } = useMemo(
    () => partitionParticipants(participants),
    [participants],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runMutation = useCallback(
    async (apply: () => void, rollback: () => void, work: () => Promise<boolean>) => {
      setError(null);
      setFeedback(null);
      apply();
      setPending(true);
      const ok = await work();
      setPending(false);
      if (!ok) {
        rollback();
        return;
      }
      setFeedback(messages.sessionDetail.updated);
      router.refresh();
    },
    [router],
  );

  const addSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const before = participants;
    const names = new Map(players.map((p) => [p.id, p.displayName]));
    const optimistic: Participant[] = [
      ...participants,
      ...ids.map((playerId) => ({
        id: `optimistic-${playerId}`,
        playerId,
        displayName: names.get(playerId) ?? playerId,
        status: 'REGISTERED' as const,
        waitlistPos: null,
        joinedAt: new Date().toISOString(),
        leftAt: null,
      })),
    ];
    await runMutation(
      () => {
        setParticipants(optimistic);
        setSelected(new Set());
      },
      () => {
        setParticipants(before);
      },
      async () => {
        const body: AddParticipantsBody = { playerIds: ids };
        const res = await clientJson(`/api/sessions/${sessionId}/participants`, {
          method: 'POST',
          headers: {
            ...csrfMutationHeaders(),
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError(res.message);
          return false;
        }
        const row = objectRecord(res.data);
        const created = row?.['participants'];
        const added = Array.isArray(created) ? created.map((item) => parseParticipant(item)) : [];
        setParticipants((curr) => {
          const without = curr.filter((p) => !p.id.startsWith('optimistic-'));
          return [...without, ...added];
        });
        setFeedback(messages.sessionDetail.added);
        return true;
      },
    );
  }, [participants, players, runMutation, selected, sessionId]);

  const removeParticipant = useCallback(
    async (playerId: string) => {
      const before = participants;
      await runMutation(
        () => {
          setParticipants((curr) =>
            curr.map((p) =>
              p.playerId === playerId ? { ...p, status: 'REMOVED', waitlistPos: null } : p,
            ),
          );
        },
        () => {
          setParticipants(before);
        },
        async () => {
          const res = await clientJson(`/api/sessions/${sessionId}/participants/${playerId}`, {
            method: 'DELETE',
            headers: csrfMutationHeaders(),
          });
          if (!res.ok) {
            setError(res.message);
            return false;
          }
          const row = objectRecord(res.data);
          const updated = parseParticipant(row?.['participant'] ?? res.data);
          setParticipants((curr) => curr.map((p) => (p.playerId === playerId ? updated : p)));
          return true;
        },
      );
    },
    [participants, runMutation, sessionId],
  );

  const patchStatus = useCallback(
    async (playerId: string, status: 'UNAVAILABLE' | 'LEFT') => {
      const before = participants;
      await runMutation(
        () => {
          setParticipants((curr) =>
            curr.map((p) =>
              p.playerId === playerId
                ? {
                    ...p,
                    status,
                    leftAt: status === 'LEFT' ? new Date().toISOString() : p.leftAt,
                  }
                : p,
            ),
          );
        },
        () => {
          setParticipants(before);
        },
        async () => {
          const res = await clientJson(`/api/sessions/${sessionId}/participants/${playerId}`, {
            method: 'PATCH',
            headers: { ...csrfMutationHeaders(), 'content-type': 'application/json' },
            body: JSON.stringify({ status }),
          });
          if (!res.ok) {
            setError(res.message);
            return false;
          }
          const row = objectRecord(res.data);
          const updated = parseParticipant(row?.['participant'] ?? res.data);
          setParticipants((curr) => curr.map((p) => (p.playerId === playerId ? updated : p)));
          return true;
        },
      );
    },
    [participants, runMutation, sessionId],
  );

  const promote = useCallback(
    async (playerId: string) => {
      const before = participants;
      await runMutation(
        () => {
          setParticipants((curr) =>
            curr.map((p) =>
              p.playerId === playerId ? { ...p, status: 'REGISTERED', waitlistPos: null } : p,
            ),
          );
        },
        () => {
          setParticipants(before);
        },
        async () => {
          const res = await clientJson(
            `/api/sessions/${sessionId}/participants/${playerId}/promote`,
            { method: 'POST', headers: csrfMutationHeaders() },
          );
          if (!res.ok) {
            setError(res.message);
            return false;
          }
          const row = objectRecord(res.data);
          const updated = parseParticipant(row?.['participant'] ?? res.data);
          setParticipants((curr) => curr.map((p) => (p.playerId === playerId ? updated : p)));
          return true;
        },
      );
    },
    [participants, runMutation, sessionId],
  );

  return (
    <Card data-testid="participant-manager">
      <CardHeader>
        <CardTitle className="text-base">{messages.sessionDetail.manage}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MutationFeedback error={error} feedback={feedback} pending={pending} />
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800" htmlFor="player-search">
            {messages.sessionDetail.searchPlayers}
          </label>
          <Input
            id="player-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            autoComplete="off"
            data-testid="player-search"
          />
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {pickerOptions.length === 0 ? (
              <li className="text-sm text-slate-500">No matching players.</li>
            ) : (
              pickerOptions.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => {
                        toggleSelected(p.id);
                      }}
                      className="size-5 rounded border-slate-300"
                    />
                    {p.displayName}
                  </label>
                </li>
              ))
            )}
          </ul>
          <Button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => {
              void addSelected();
            }}
            data-testid="add-participants"
          >
            {messages.sessionDetail.addSelected}
          </Button>
        </div>

        <ParticipantSection
          title={messages.sessionDetail.participants}
          rows={roster}
          pending={pending}
          onRemove={(id) => {
            void removeParticipant(id);
          }}
          onUnavailable={(id) => {
            void patchStatus(id, 'UNAVAILABLE');
          }}
          onLeft={(id) => {
            void patchStatus(id, 'LEFT');
          }}
        />
        <ParticipantSection
          title={messages.sessionDetail.waitlist}
          rows={waitlist}
          pending={pending}
          onRemove={(id) => {
            void removeParticipant(id);
          }}
          onPromote={(id) => {
            void promote(id);
          }}
        />
        <ParticipantSection
          title={messages.sessionDetail.inactive}
          rows={inactive}
          pending={pending}
        />
      </CardContent>
    </Card>
  );
}

function MutationFeedback({
  error,
  feedback,
  pending,
}: {
  readonly error: string | null;
  readonly feedback: string | null;
  readonly pending: boolean;
}) {
  return (
    <>
      {pending ? <p className="text-sm text-slate-600">{messages.sessionDetail.saving}</p> : null}
      {error !== null ? (
        <p className="text-sm text-red-700" role="alert" data-testid="participant-error">
          {error}
        </p>
      ) : null}
      {feedback !== null && error === null ? (
        <p className="text-sm text-emerald-800" data-testid="participant-feedback">
          {feedback}
        </p>
      ) : null}
    </>
  );
}

function ParticipantSection({
  title,
  rows,
  pending,
  onRemove,
  onUnavailable,
  onLeft,
  onPromote,
}: {
  title: string;
  rows: Participant[];
  pending: boolean;
  onRemove?: (playerId: string) => void;
  onUnavailable?: (playerId: string) => void;
  onLeft?: (playerId: string) => void;
  onPromote?: (playerId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="space-y-2">
        {rows.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid={`participant-${p.playerId}`}
          >
            <div>
              <p className="font-medium text-slate-900">{p.displayName}</p>
              <p className="text-xs text-slate-600">
                {messages.participantStatus[p.status]}
                {p.waitlistPos !== null ? ` #${String(p.waitlistPos)}` : ''}
              </p>
            </div>
            {onRemove !== undefined || onPromote !== undefined ? (
              <div className="flex flex-wrap gap-2">
                {onPromote !== undefined && p.status === 'WAITLISTED' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      onPromote(p.playerId);
                    }}
                  >
                    {messages.sessionDetail.promote}
                  </Button>
                ) : null}
                {onUnavailable !== undefined &&
                (p.status === 'REGISTERED' || p.status === 'ACTIVE') ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      onUnavailable(p.playerId);
                    }}
                  >
                    {messages.sessionDetail.markUnavailable}
                  </Button>
                ) : null}
                {onLeft !== undefined && (p.status === 'REGISTERED' || p.status === 'ACTIVE') ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      onLeft(p.playerId);
                    }}
                  >
                    {messages.sessionDetail.markLeft}
                  </Button>
                ) : null}
                {onRemove !== undefined && p.status !== 'REMOVED' && p.status !== 'LEFT' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      onRemove(p.playerId);
                    }}
                  >
                    {messages.sessionDetail.remove}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
