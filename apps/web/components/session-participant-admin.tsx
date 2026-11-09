'use client';

import { useState } from 'react';
import { CreatePlayerInline } from '@/components/create-player-inline';
import { ParticipantManager } from '@/components/participant-manager';
import type { Participant } from '@/lib/session-detail';

interface SessionParticipantAdminProps {
  readonly sessionId: string;
  readonly initialParticipants: Participant[];
}

export function SessionParticipantAdmin({
  sessionId,
  initialParticipants,
}: SessionParticipantAdminProps) {
  const [playersRevision, setPlayersRevision] = useState(0);

  return (
    <div className="flex flex-col gap-4" data-testid="session-participant-admin">
      <CreatePlayerInline
        sessionId={sessionId}
        sessionParticipants={initialParticipants}
        onPlayerCreated={() => {
          setPlayersRevision((n) => n + 1);
        }}
      />
      <ParticipantManager
        sessionId={sessionId}
        initialParticipants={initialParticipants}
        playersRevision={playersRevision}
      />
    </div>
  );
}
