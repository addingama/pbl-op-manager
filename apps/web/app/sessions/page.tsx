import { Button, Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import Link from 'next/link';
import { getAdminSession } from '@/lib/auth';
import { formatSessionWhen, listSessions } from '@/lib/sessions';
import { messages } from '@/messages';

export default async function SessionsPage() {
  const [sessions, admin] = await Promise.all([listSessions(), getAdminSession()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.sessions.title}</h1>
      {admin !== null ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600" data-testid="admin-banner">
            {messages.nav.adminSignedIn}: {admin.displayName}
          </p>
          <Button asChild className="min-h-11 w-full">
            <Link href="/sessions/new" data-testid="create-session-cta">
              {messages.sessions.createCta}
            </Link>
          </Button>
        </div>
      ) : null}
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-600">
            {messages.sessions.empty}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/sessions/${session.id}`}
                className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="text-base">{session.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-slate-700">
                    <p>{formatSessionWhen(session.startsAt)}</p>
                    {session.venue !== null ? <p>{session.venue}</p> : null}
                    <p>
                      {messages.status[session.status]} · {session.participantCount}{' '}
                      {messages.sessions.participants} · {session.courtCount}{' '}
                      {messages.sessions.courts}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
