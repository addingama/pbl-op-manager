'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@pbl/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientJson, csrfMutationHeaders } from '@/lib/api/client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { parseRound } from '@/lib/round-parse';
import { messages } from '@/messages';
import { IDEMPOTENCY_HEADER } from '@pbl/shared';

const MODES = ['RANDOM', 'BALANCED_ELO', 'MEXICANO', 'AMERICANO', 'FIXED_PARTNER'] as const;

type GeneratorMode = (typeof MODES)[number];

export function RoundGeneratorForm({
  sessionId,
  defaultMode,
}: {
  readonly sessionId: string;
  readonly defaultMode: string;
}) {
  const router = useRouter();
  const initialMode: GeneratorMode = MODES.some((m) => m === defaultMode)
    ? (defaultMode as GeneratorMode)
    : 'BALANCED_ELO';
  const [mode, setMode] = useState<GeneratorMode>(initialMode);
  const [seed, setSeed] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card data-testid="round-generator">
      <CardHeader>
        <CardTitle className="text-base">{messages.live.generateTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error !== null ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-800">{messages.live.mode}</span>
          <select
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as GeneratorMode);
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {messages.generatorMode[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-800">{messages.live.seedOptional}</span>
          <Input
            value={seed}
            onChange={(e) => {
              setSeed(e.target.value);
            }}
            placeholder="Optional"
          />
        </label>
        <Button
          type="button"
          disabled={pending}
          data-testid="generate-round"
          onClick={() => {
            void (async () => {
              setPending(true);
              setError(null);
              const payload: { mode: GeneratorMode; seed?: string } = { mode };
              if (seed.trim() !== '') payload.seed = seed.trim();
              const res = await clientJson(`/api/sessions/${sessionId}/rounds`, {
                method: 'POST',
                headers: {
                  ...csrfMutationHeaders(),
                  'content-type': 'application/json',
                  [IDEMPOTENCY_HEADER]: newIdempotencyKey(),
                },
                body: JSON.stringify(payload),
              });
              setPending(false);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              const record = typeof res.data === 'object' && res.data !== null ? res.data : {};
              const row = 'round' in record ? record.round : res.data;
              const round = parseRound(row);
              router.push(`/sessions/${sessionId}/live?round=${String(round.number)}`);
              router.refresh();
            })();
          }}
        >
          {pending ? messages.live.generating : messages.live.generateRound}
        </Button>
      </CardContent>
    </Card>
  );
}
