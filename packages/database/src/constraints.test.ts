import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from './client.js';
import { violatedConstraint } from './errors.js';
import { Prisma } from './generated/prisma/client.js';
import {
  createAdmin,
  createPlayers,
  createRound,
  createSession,
  createTestClient,
  type RoundFixture,
} from './test/fixtures.js';

const prisma = createTestClient();

async function expectViolation(write: Promise<unknown>, constraint: string): Promise<void> {
  const error: unknown = await write.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected a violation of ${constraint}`).toBeDefined();
  expect(violatedConstraint(error)).toBe(constraint);
}

let adminId: string;
let session: { id: string; startsAt: Date };
let players: string[];

beforeEach(async () => {
  await truncateAllTables(prisma);
  adminId = (await createAdmin(prisma)).id;
  session = await createSession(prisma, adminId);
  players = await createPlayers(prisma, 10);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function at(ids: readonly string[], index: number): string {
  const id = ids[index];
  if (id === undefined) throw new Error(`no id at ${String(index)}`);
  return id;
}

describe('registration', () => {
  it('rejects registering the same player twice for a session', async () => {
    const data = {
      openPlayId: session.id,
      playerId: at(players, 0),
      status: 'ACTIVE',
      source: 'ADMIN',
    } as const;
    await prisma.openPlayParticipant.create({ data });
    await expectViolation(
      prisma.openPlayParticipant.create({ data: { ...data, source: 'IMPORT' } }),
      'OpenPlayParticipant_openPlayId_playerId_key',
    );
  });

  it('allows one session per external AYO event', async () => {
    const ref = { externalProvider: 'AYO', externalEventId: '293332' } as const;
    await prisma.openPlay.update({ where: { id: session.id }, data: ref });
    await expectViolation(
      prisma.openPlay.create({
        data: { title: 'Dup', startsAt: new Date(), courtCount: 1, createdById: adminId, ...ref },
      }),
      'OpenPlay_externalProvider_externalEventId_key',
    );
  });
});

describe('rounds and matches', () => {
  it('rejects a duplicate round number within a session', async () => {
    const data = {
      openPlayId: session.id,
      number: 1,
      mode: 'MANUAL',
      settings: {},
      ratingSnapshot: {},
      createdById: adminId,
    } as const;
    await prisma.round.create({ data });
    await expectViolation(prisma.round.create({ data }), 'Round_openPlayId_number_key');
  });

  it('enforces positive court counts, round numbers and court numbers', async () => {
    await expectViolation(
      prisma.openPlay.update({ where: { id: session.id }, data: { courtCount: 0 } }),
      'OpenPlay_courtCount_check',
    );
    await expectViolation(
      prisma.openPlay.update({ where: { id: session.id }, data: { capacity: 0 } }),
      'OpenPlay_capacity_check',
    );
    await expectViolation(
      prisma.round.create({
        data: {
          openPlayId: session.id,
          number: 0,
          mode: 'MANUAL',
          settings: {},
          ratingSnapshot: {},
          createdById: adminId,
        },
      }),
      'Round_number_check',
    );
    const round = await createRound(prisma, session, adminId, players);
    await expectViolation(
      prisma.match.create({ data: { roundId: round.roundId, courtNumber: 0, orderKey: 'k' } }),
      'Match_courtNumber_check',
    );
  });

  it('accepts only team 1 or 2 as the winner', async () => {
    const round = await createRound(prisma, session, adminId, players);
    const [matchId] = round.matchIds;
    await prisma.match.update({ where: { id: matchId }, data: { winnerTeam: 2 } });
    await expectViolation(
      prisma.match.update({ where: { id: matchId }, data: { winnerTeam: 3 } }),
      'Match_winnerTeam_check',
    );
  });

  it('rejects a fixed team of one player with themselves', async () => {
    await expectViolation(
      prisma.fixedTeam.create({
        data: { openPlayId: session.id, playerAId: at(players, 0), playerBId: at(players, 0) },
      }),
      'FixedTeam_distinct_players_check',
    );
  });
});

describe('round assignments', () => {
  let round: RoundFixture;

  beforeEach(async () => {
    round = await createRound(prisma, session, adminId, players);
  });

  async function assignmentOf(playerId: string) {
    return prisma.roundAssignment.findUniqueOrThrow({
      where: { roundId_playerId: { roundId: round.roundId, playerId } },
    });
  }

  it('rejects a player assigned twice in one round', async () => {
    await expectViolation(
      prisma.roundAssignment.create({
        data: { roundId: round.roundId, playerId: at(round.playing, 0), status: 'RESTING' },
      }),
      'RoundAssignment_roundId_playerId_key',
    );
  });

  it('rejects two players in the same match slot', async () => {
    const restingPlayer = at(round.resting, 0);
    await prisma.roundAssignment.delete({
      where: { roundId_playerId: { roundId: round.roundId, playerId: restingPlayer } },
    });
    await expectViolation(
      prisma.roundAssignment.create({
        data: {
          roundId: round.roundId,
          playerId: restingPlayer,
          status: 'PLAYING',
          matchId: round.matchIds[0],
          team: 1,
          position: 1,
        },
      }),
      'RoundAssignment_match_slot_key',
    );
  });

  it('requires PLAYING rows to have a slot and RESTING rows to have none', async () => {
    const [first, second] = round.resting;
    if (first === undefined || second === undefined) throw new Error('need two resting players');
    await prisma.roundAssignment.deleteMany({ where: { playerId: { in: [first, second] } } });
    await expectViolation(
      prisma.roundAssignment.create({
        data: { roundId: round.roundId, playerId: first, status: 'PLAYING' },
      }),
      'RoundAssignment_status_slot_check',
    );
    await expectViolation(
      prisma.roundAssignment.create({
        data: {
          roundId: round.roundId,
          playerId: second,
          status: 'RESTING',
          matchId: round.matchIds[1],
          team: 1,
          position: 1,
        },
      }),
      'RoundAssignment_status_slot_check',
    );
    await expectViolation(
      prisma.roundAssignment.update({
        where: { roundId_playerId: { roundId: round.roundId, playerId: at(round.playing, 0) } },
        data: { team: 3 },
      }),
      'RoundAssignment_team_check',
    );
  });

  it('swaps two players across matches inside one transaction (deferred unique)', async () => {
    const a = await assignmentOf(at(round.playing, 0));
    const b = await assignmentOf(at(round.playing, 5));

    await prisma.$transaction(async (tx) => {
      await tx.roundAssignment.update({ where: { id: a.id }, data: { playerId: b.playerId } });
      await tx.roundAssignment.update({ where: { id: b.id }, data: { playerId: a.playerId } });
      await tx.round.update({ where: { id: round.roundId }, data: { version: { increment: 1 } } });
    });

    const swappedA = await assignmentOf(a.playerId);
    const swappedB = await assignmentOf(b.playerId);
    expect(swappedA).toMatchObject({ matchId: b.matchId, team: b.team, position: b.position });
    expect(swappedB).toMatchObject({ matchId: a.matchId, team: a.team, position: a.position });
    const { version } = await prisma.round.findUniqueOrThrow({ where: { id: round.roundId } });
    expect(version).toBe(1);
  });

  it('swaps a playing player with a resting player', async () => {
    const playing = await assignmentOf(at(round.playing, 2));
    const resting = await assignmentOf(at(round.resting, 1));

    await prisma.$transaction(async (tx) => {
      await tx.roundAssignment.update({
        where: { id: playing.id },
        data: { playerId: resting.playerId },
      });
      await tx.roundAssignment.update({
        where: { id: resting.id },
        data: { playerId: playing.playerId },
      });
    });

    expect(await assignmentOf(playing.playerId)).toMatchObject({
      status: 'RESTING',
      matchId: null,
    });
    expect(await assignmentOf(resting.playerId)).toMatchObject({
      status: 'PLAYING',
      matchId: playing.matchId,
    });
  });

  it('only defers the check: a duplicate left at COMMIT rolls the whole transaction back', async () => {
    const a = await assignmentOf(at(round.playing, 0));
    const b = await assignmentOf(at(round.playing, 1));

    await expectViolation(
      prisma.$transaction(async (tx) => {
        await tx.roundAssignment.update({ where: { id: a.id }, data: { playerId: b.playerId } });
        await tx.round.update({ where: { id: round.roundId }, data: { version: 99 } });
      }),
      'RoundAssignment_roundId_playerId_key',
    );

    expect((await prisma.roundAssignment.findUniqueOrThrow({ where: { id: a.id } })).playerId).toBe(
      a.playerId,
    );
    const { version } = await prisma.round.findUniqueOrThrow({ where: { id: round.roundId } });
    expect(version).toBe(0);
  });

  it('needs the deferral: the same swap fails when the constraint is checked immediately', async () => {
    const a = await assignmentOf(at(round.playing, 0));
    const b = await assignmentOf(at(round.playing, 5));

    await expectViolation(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET CONSTRAINTS "RoundAssignment_roundId_playerId_key" IMMEDIATE`;
        await tx.roundAssignment.update({ where: { id: a.id }, data: { playerId: b.playerId } });
        await tx.roundAssignment.update({ where: { id: b.id }, data: { playerId: a.playerId } });
      }),
      'RoundAssignment_roundId_playerId_key',
    );
  });
});

describe('rating ledger', () => {
  let matchId: string;
  let runId: string;

  beforeEach(async () => {
    const round = await createRound(prisma, session, adminId, players);
    matchId = round.matchIds[0];
    runId = (await createRun('INCREMENTAL')).id;
  });

  function createRun(kind: 'INCREMENTAL' | 'REPLAY') {
    return prisma.ratingRun.create({
      data: { kind, reason: 'confirm', engineVersion: 'elo-engine@1.0.0', createdById: adminId },
    });
  }

  function txn(playerId: string, run: string) {
    const d = (v: string) => new Prisma.Decimal(v);
    return {
      playerId,
      matchId,
      orderKey: 'k',
      team: 1,
      result: 1,
      ratingBefore: d('1000'),
      teamRating: d('1000'),
      opponentRating: d('1000'),
      expected: d('0.5'),
      delta: d('16'),
      ratingAfter: d('1016'),
      runId: run,
    };
  }

  it('rejects a second active transaction for the same match and player', async () => {
    await prisma.ratingTransaction.create({ data: txn(at(players, 0), runId) });
    await expectViolation(
      prisma.ratingTransaction.create({ data: txn(at(players, 0), runId) }),
      'RatingTransaction_active_match_player_key',
    );
  });

  it('allows a replacement once the old row is superseded by a replay run', async () => {
    const old = await prisma.ratingTransaction.create({ data: txn(at(players, 0), runId) });
    const replay = await createRun('REPLAY');
    await prisma.$transaction([
      prisma.ratingTransaction.update({
        where: { id: old.id },
        data: { supersededByRunId: replay.id },
      }),
      prisma.ratingTransaction.create({ data: txn(at(players, 0), replay.id) }),
    ]);
    const rows = await prisma.ratingTransaction.findMany({ where: { matchId } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.supersededByRunId === null)).toHaveLength(1);
  });

  it('accepts only team 1/2 and result 0/1', async () => {
    await expectViolation(
      prisma.ratingTransaction.create({ data: { ...txn(at(players, 0), runId), team: 0 } }),
      'RatingTransaction_team_check',
    );
    await expectViolation(
      prisma.ratingTransaction.create({ data: { ...txn(at(players, 1), runId), result: 2 } }),
      'RatingTransaction_result_check',
    );
  });

  it('stores Decimal(10,4) ratings exactly', async () => {
    const row = await prisma.ratingTransaction.create({
      data: { ...txn(at(players, 0), runId), ratingAfter: new Prisma.Decimal('1015.9999') },
    });
    expect(row.ratingAfter.toFixed(4)).toBe('1015.9999');
  });
});

describe('player aliases', () => {
  it('keeps aliases unique per provider, including provider-less aliases', async () => {
    const playerId = at(players, 0);
    await prisma.playerAlias.create({ data: { provider: 'AYO', aliasKey: 'budi', playerId } });
    await expectViolation(
      prisma.playerAlias.create({ data: { provider: 'AYO', aliasKey: 'budi', playerId } }),
      'PlayerAlias_provider_aliasKey_key',
    );
    await prisma.playerAlias.create({ data: { provider: null, aliasKey: 'budi', playerId } });
    await expectViolation(
      prisma.playerAlias.create({ data: { provider: null, aliasKey: 'budi', playerId } }),
      'PlayerAlias_generic_aliasKey_key',
    );
  });
});
