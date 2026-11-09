import { Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateSessionForm } from '@/components/create-session-form';
import { getAdminSession } from '@/lib/auth';
import { messages } from '@/messages';

export default async function NewSessionPage() {
  const admin = await getAdminSession();
  if (admin === null) {
    redirect('/login?next=/sessions/new');
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/sessions"
        className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
      >
        {messages.sessions.backToList}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{messages.sessions.createPageTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateSessionForm />
        </CardContent>
      </Card>
    </div>
  );
}
