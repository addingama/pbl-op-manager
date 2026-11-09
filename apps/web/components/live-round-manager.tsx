'use client';

import { IDEMPOTENCY_HEADER } from '@pbl/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfirmResultSheet } from '@/components/confirm-result-sheet';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { formatPlayerPair } from '@/lib/session-detail';
import { type RoundDetail, latestRound, parseRoundsResponse, parseRound } from '@/lib/round-parse';
import {
  nextSwapPhase,
  playerSlotSwappable,
  reduceSwapTap,
  type SwapPhase,
} from '@/lib/swap-selection';
import { tapWinnerPick, winnersForConfirmAll, type WinnerPick } from '@/lib/winner-selection';
import { messages } from '@/messages';
import { objectRecord } from '@/lib/participant-parse';

const POLL_MS = 5000;

export function LiveRoundManager({
  sessionId,
  isAdmin,
  initialRounds,
  playerNames,
  focusRoundNumber,
}: {
  readonly sessionId: string;
  readonly isAdmin: boolean;
  readonly initialRounds: RoundDetail[];
  readonly playerNames: Record<string, string>;
  readonly focusRoundNumber: number | null;
}) {
  const names = useMemo(() => new Map(Object.entries(playerNames)), [playerNames]);
  const [rounds, setRounds] = useState(initialRounds);
  const [roundId, setRoundId] = useState<string | null>(() =>
    pickRoundId(initialRounds, focusRoundNumber),
  );
  const [swapPhase, setSwapPhase] = useState<SwapPhase>({ kind: 'idle' });
  const [winnerPicks, setWinnerPicks] = useState<Map<string, 1 | 2>>(new Map());
  const [sheet, setSheet] = useState<
    { kind: 'none' } | { kind: 'single'; pick: WinnerPick } | { kind: 'all' }
  >({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelMatchId, setCancelMatchId] = useState<string | null>(null);
  const [correctMatchId, setCorrectMatchId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const round = useMemo(
    () => rounds.find((r) => r.id === roundId) ?? latestRound(rounds),
    [roundId, rounds],
  );

  const refresh = useCallback(async () => {
    const res = await clientJson(`/api/sessions/${sessionId}/rounds`, { method: 'GET' });
    if (!res.ok) return;
    const parsed = parseRoundsResponse(res.data);
    setRounds(parsed);
    if (roundId === null) {
      const latest = latestRound(parsed);
      if (latest !== null) setRoundId(latest.id);
    }
  }, [roundId, sessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

  const onPlayerTap = useCallback(
    (playerId: string) => {
      if (!isAdmin || round === null) return;
      const selectable = playerSlotSwappable(round, playerId);
      const result = reduceSwapTap(swapPhase, playerId, selectable);
      if (result.action === 'commit') {
        void (async () => {
          setPending(true);
          setError(null);
          const res = await clientJson(`/api/rounds/${round.id}/swaps`, {
            method: 'POST',
            headers: { ...csrfMutationHeaders(), 'content-type': 'application/json' },
            body: JSON.stringify({
              expectedRoundVersion: round.version,
              a: { playerId: result.a },
              b: { playerId: result.b },
            }),
          });
          setPending(false);
          setSwapPhase({ kind: 'idle' });
          if (!res.ok) {
            setError(res.message);
            void refresh();
            return;
          }
          const row = objectRecord(res.data);
          const next = row?.['round'] ?? res.data;
          setRounds((prev) => prev.map((r) => (r.id === round.id ? parseRound(next) : r)));
        })();
        return;
      }
      setSwapPhase(nextSwapPhase(result));
    },
    [isAdmin, refresh, round, swapPhase],
  );

  const onTeamTap = useCallback(
    (matchId: string, team: 1 | 2, matchStatus: string) => {
      if (!isAdmin) return;
      if (matchStatus === 'COMPLETED' || matchStatus === 'CANCELLED') return;
      const current =
        winnerPicks.has(matchId) && winnerPicks.get(matchId) !== undefined
          ? { matchId, winnerTeam: winnerPicks.get(matchId) as 1 | 2 }
          : null;
      const { pick, openConfirmSheet } = tapWinnerPick(current, matchId, team);
      setWinnerPicks((prev) => new Map(prev).set(matchId, team));
      if (openConfirmSheet) setSheet({ kind: 'single', pick });
    },
    [isAdmin, winnerPicks],
  );

  const confirmSingle = useCallback(async () => {
    if (sheet.kind !== 'single') return;
    setPending(true);
    setError(null);
    const res = await clientJson(`/api/matches/${sheet.pick.matchId}/confirm`, {
      method: 'POST',
      headers: {
        ...csrfMutationHeaders(),
        'content-type': 'application/json',
        [IDEMPOTENCY_HEADER]: newIdempotencyKey(),
      },
      body: JSON.stringify({ winnerTeam: sheet.pick.winnerTeam }),
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSheet({ kind: 'none' });
    await refresh();
  }, [refresh, sheet]);

  const confirmAll = useCallback(async () => {
    if (round === null) return;
    const results = winnersForConfirmAll(winnerPicks, round.matches);
    if (results.length === 0) return;
    setPending(true);
    setError(null);
    const res = await clientJson(`/api/rounds/${round.id}/confirm-all`, {
      method: 'POST',
      headers: {
        ...csrfMutationHeaders(),
        'content-type': 'application/json',
        [IDEMPOTENCY_HEADER]: newIdempotencyKey(),
      },
      body: JSON.stringify({ results }),
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSheet({ kind: 'none' });
    await refresh();
  }, [refresh, round, winnerPicks]);

  if (round === null) {
    return (
      <p className="text-sm text-slate-600">
        {messages.live.noRound}{' '}
        {isAdmin ? (
          <Link
            href={`/sessions/${sessionId}/generator`}
            className="font-medium text-emerald-800 underline"
          >
            {messages.live.openGenerator}
          </Link>
        ) : null}
      </p>
    );
  }

  const confirmAllCandidates = winnersForConfirmAll(winnerPicks, round.matches);

  return (
    <div className="flex flex-col gap-4" data-testid="live-round-manager">
      {error !== null ? (
        <p className="text-sm text-red-700" role="alert" data-testid="live-error">
          {error}
        </p>
      ) : null}
      {pending ? <p className="text-sm text-slate-600">{messages.sessionDetail.saving}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-slate-800" htmlFor="round-select">
          {messages.live.round}
        </label>
        <select
          id="round-select"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={round.id}
          onChange={(e) => {
            setRoundId(e.target.value);
            setSwapPhase({ kind: 'idle' });
          }}
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {messages.live.round} {r.number}
            </option>
          ))}
        </select>
        {isAdmin ? (
          <Link
            href={`/sessions/${sessionId}/generator`}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
          >
            {messages.live.newRound}
          </Link>
        ) : null}
      </div>

      {isAdmin ? (
        <section className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            data-testid="start-round"
            onClick={() => {
              void startRound(round.id, setPending, setError, refresh);
            }}
          >
            {messages.live.startRound}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || confirmAllCandidates.length === 0}
            data-testid="confirm-all"
            onClick={() => {
              setSheet({ kind: 'all' });
            }}
          >
            {messages.live.confirmAll}
          </Button>
        </section>
      ) : (
        <p className="text-xs text-slate-500">{messages.live.guestRefresh}</p>
      )}

      <ul className="flex flex-col gap-3">
        {round.matches.map((match) => (
          <li key={match.id}>
            <Card data-testid={`court-card-${String(match.courtNumber)}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {messages.sessionDetail.court} {match.courtNumber} ·{' '}
                  {matchStatusLabel(match.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <TeamRow
                  label="Team 1"
                  names={formatPlayerPair(match.team1, names)}
                  players={match.team1}
                  team={1}
                  matchId={match.id}
                  matchStatus={match.status}
                  armedId={swapPhase.kind === 'armed' ? swapPhase.playerId : null}
                  pick={winnerPicks.get(match.id)}
                  isAdmin={isAdmin}
                  displayName={(id) => names.get(id) ?? id}
                  onPlayerTap={onPlayerTap}
                  onTeamTap={onTeamTap}
                  swappable={(id) => playerSlotSwappable(round, id)}
                />
                <TeamRow
                  label="Team 2"
                  names={formatPlayerPair(match.team2, names)}
                  players={match.team2}
                  team={2}
                  matchId={match.id}
                  matchStatus={match.status}
                  armedId={swapPhase.kind === 'armed' ? swapPhase.playerId : null}
                  pick={winnerPicks.get(match.id)}
                  isAdmin={isAdmin}
                  displayName={(id) => names.get(id) ?? id}
                  onPlayerTap={onPlayerTap}
                  onTeamTap={onTeamTap}
                  swappable={(id) => playerSlotSwappable(round, id)}
                />
                {isAdmin ? (
                  <MatchAdminActions
                    matchId={match.id}
                    status={match.status}
                    pending={pending}
                    onStart={() => {
                      void startMatch(match.id, setPending, setError, refresh);
                    }}
                    onCancel={() => {
                      setCancelMatchId(match.id);
                    }}
                    onCorrect={() => {
                      setCorrectMatchId(match.id);
                      setReason('');
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {round.resting.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{messages.sessionDetail.resting}</h3>
          <div className="flex flex-wrap gap-2">
            {round.resting.map((playerId) => (
              <button
                key={playerId}
                type="button"
                disabled={!isAdmin || pending}
                className={playerChipClass(
                  swapPhase.kind === 'armed' && swapPhase.playerId === playerId,
                  isAdmin && playerSlotSwappable(round, playerId),
                )}
                onClick={() => {
                  onPlayerTap(playerId);
                }}
              >
                {names.get(playerId) ?? playerId}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ConfirmResultSheet
        open={sheet.kind === 'single'}
        title={messages.live.confirmWinner}
        description={messages.live.confirmWinnerHint}
        confirmLabel={messages.live.confirmMatch}
        pending={pending}
        onDismiss={() => {
          setSheet({ kind: 'none' });
        }}
        onConfirm={() => {
          void confirmSingle();
        }}
      />
      <ConfirmResultSheet
        open={sheet.kind === 'all'}
        title={messages.live.confirmAllTitle}
        description={messages.live.confirmAllHint.replace(
          '{count}',
          String(confirmAllCandidates.length),
        )}
        confirmLabel={messages.live.confirmAll}
        pending={pending}
        onDismiss={() => {
          setSheet({ kind: 'none' });
        }}
        onConfirm={() => {
          void confirmAll();
        }}
      />

      <ReasonDialog
        open={cancelMatchId !== null}
        title={messages.live.cancelMatch}
        reason={reason}
        onReason={setReason}
        requireReason={false}
        pending={pending}
        onDismiss={() => {
          setCancelMatchId(null);
        }}
        onSubmit={() => {
          if (cancelMatchId === null) return;
          void cancelMatch(cancelMatchId, reason, setPending, setError, () => {
            setCancelMatchId(null);
            void refresh();
          });
        }}
      />
      <ReasonDialog
        open={correctMatchId !== null}
        title={messages.live.correctMatch}
        reason={reason}
        onReason={setReason}
        requireReason
        pending={pending}
        onDismiss={() => {
          setCorrectMatchId(null);
        }}
        onSubmit={() => {
          if (correctMatchId === null) return;
          const team = winnerPicks.get(correctMatchId);
          if (team !== 1 && team !== 2) {
            setError(messages.live.pickWinnerFirst);
            return;
          }
          void correctMatch(correctMatchId, team, reason, setPending, setError, () => {
            setCorrectMatchId(null);
            void refresh();
          });
        }}
      />
    </div>
  );
}

function pickRoundId(rounds: RoundDetail[], focusRoundNumber: number | null): string | null {
  if (focusRoundNumber !== null) {
    const hit = rounds.find((r) => r.number === focusRoundNumber);
    if (hit !== undefined) return hit.id;
  }
  return latestRound(rounds)?.id ?? null;
}

function playerChipClass(armed: boolean, enabled: boolean): string {
  const base = 'min-h-11 rounded-full px-4 py-2 text-sm font-medium';
  if (!enabled) return `${base} bg-slate-100 text-slate-400`;
  if (armed) return `${base} bg-emerald-700 text-white ring-2 ring-emerald-400`;
  return `${base} bg-white border border-slate-300 text-slate-900`;
}

function TeamRow({
  label,
  names,
  players,
  team,
  matchId,
  matchStatus,
  armedId,
  pick,
  isAdmin,
  displayName,
  onPlayerTap,
  onTeamTap,
  swappable,
}: {
  label: string;
  names: string;
  players: readonly [string, string];
  team: 1 | 2;
  matchId: string;
  matchStatus: string;
  armedId: string | null;
  pick: 1 | 2 | undefined;
  isAdmin: boolean;
  displayName: (id: string) => string;
  onPlayerTap: (id: string) => void;
  onTeamTap: (matchId: string, team: 1 | 2, status: string) => void;
  swappable: (id: string) => boolean;
}) {
  const winnerSelected = pick === team;
  return (
    <TeamSelectBlock
      label={label}
      winnerSelected={winnerSelected}
      isAdmin={isAdmin}
      matchStatus={matchStatus}
      onSelectTeam={() => {
        onTeamTap(matchId, team, matchStatus);
      }}
    >
      <p className="text-xs text-slate-500">{names}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {players.map((playerId) => (
          <button
            key={playerId}
            type="button"
            disabled={!isAdmin}
            className={playerChipClass(armedId === playerId, isAdmin && swappable(playerId))}
            onClick={(event) => {
              event.stopPropagation();
              onPlayerTap(playerId);
            }}
          >
            {displayName(playerId)}
          </button>
        ))}
      </div>
    </TeamSelectBlock>
  );
}

function TeamSelectBlock({
  label,
  winnerSelected,
  isAdmin,
  matchStatus,
  onSelectTeam,
  children,
}: {
  label: string;
  winnerSelected: boolean;
  isAdmin: boolean;
  matchStatus: string;
  onSelectTeam: () => void;
  children: ReactNode;
}) {
  const canPick = isAdmin && matchStatus !== 'COMPLETED' && matchStatus !== 'CANCELLED';
  return (
    <button
      type="button"
      disabled={!canPick}
      className={`w-full rounded-xl border p-3 text-left ${
        winnerSelected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'
      } ${canPick ? 'min-h-11' : ''}`}
      data-testid={`team-${label.replace(' ', '-').toLowerCase()}`}
      onClick={onSelectTeam}
    >
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      {children}
    </button>
  );
}

function MatchAdminActions({
  matchId,
  status,
  pending,
  onStart,
  onCancel,
  onCorrect,
}: {
  matchId: string;
  status: string;
  pending: boolean;
  onStart: () => void;
  onCancel: () => void;
  onCorrect: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {status === 'SCHEDULED' ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onStart}>
          {messages.live.startMatch}
        </Button>
      ) : null}
      {status !== 'CANCELLED' && status !== 'COMPLETED' ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>
          {messages.live.cancelMatch}
        </Button>
      ) : null}
      {status === 'COMPLETED' ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCorrect}>
          {messages.live.correctMatch}
        </Button>
      ) : null}
      <span className="sr-only">{matchId}</span>
    </div>
  );
}

function ReasonDialog({
  open,
  title,
  reason,
  onReason,
  requireReason,
  pending,
  onDismiss,
  onSubmit,
}: {
  open: boolean;
  title: string;
  reason: string;
  onReason: (value: string) => void;
  requireReason: boolean;
  pending: boolean;
  onDismiss: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        <textarea
          className="mt-3 min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm"
          value={reason}
          onChange={(e) => {
            onReason(e.target.value);
          }}
          placeholder={messages.live.reasonPlaceholder}
        />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            disabled={pending || (requireReason && reason.trim() === '')}
            onClick={onSubmit}
          >
            {messages.live.submit}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onDismiss}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

async function startRound(
  roundId: string,
  setPending: (v: boolean) => void,
  setError: (v: string | null) => void,
  refresh: () => Promise<void>,
): Promise<void> {
  setPending(true);
  setError(null);
  const res = await clientJson(`/api/rounds/${roundId}/start`, {
    method: 'POST',
    headers: csrfMutationHeaders(),
  });
  setPending(false);
  if (!res.ok) setError(res.message);
  else await refresh();
}

async function startMatch(
  matchId: string,
  setPending: (v: boolean) => void,
  setError: (v: string | null) => void,
  refresh: () => Promise<void>,
): Promise<void> {
  setPending(true);
  setError(null);
  const res = await clientJson(`/api/matches/${matchId}/start`, {
    method: 'POST',
    headers: csrfMutationHeaders(),
  });
  setPending(false);
  if (!res.ok) setError(res.message);
  else await refresh();
}

async function cancelMatch(
  matchId: string,
  reason: string,
  setPending: (v: boolean) => void,
  setError: (v: string | null) => void,
  onDone: () => void,
): Promise<void> {
  setPending(true);
  setError(null);
  const body = reason.trim() === '' ? {} : { reason: reason.trim() };
  const res = await clientJson(`/api/matches/${matchId}/cancel`, {
    method: 'POST',
    headers: { ...csrfMutationHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  setPending(false);
  if (!res.ok) setError(res.message);
  else onDone();
}

function matchStatusLabel(status: string): string {
  const keys = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
  if ((keys as readonly string[]).includes(status)) {
    return messages.matchStatus[status as (typeof keys)[number]];
  }
  return status;
}

async function correctMatch(
  matchId: string,
  winnerTeam: 1 | 2,
  reason: string,
  setPending: (v: boolean) => void,
  setError: (v: string | null) => void,
  onDone: () => void,
): Promise<void> {
  setPending(true);
  setError(null);
  const res = await clientJson(`/api/matches/${matchId}/correct`, {
    method: 'POST',
    headers: {
      ...csrfMutationHeaders(),
      'content-type': 'application/json',
      [IDEMPOTENCY_HEADER]: newIdempotencyKey(),
    },
    body: JSON.stringify({ winnerTeam, reason: reason.trim() }),
  });
  setPending(false);
  if (!res.ok) setError(res.message);
  else onDone();
}
