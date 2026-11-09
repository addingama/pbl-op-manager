import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RoundGeneratorForm } from '@/components/round-generator-form';
import { getAdminSession } from '@/lib/auth';
import { getSessionDetail } from '@/lib/sessions-detail-server';
import { messages } from '@/messages';

export default async function SessionGeneratorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, admin] = await Promise.all([getSessionDetail(id), getAdminSession()]);
  if (session === null) notFound();
  if (admin === null) redirect(`/sessions/${id}/live`);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <Link href={`/sessions/${id}`} className="text-sm font-medium text-emerald-800 underline">
          {messages.live.backToSession}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
        <p className="text-sm text-slate-600">{messages.live.generatorIntro}</p>
      </div>
      <RoundGeneratorForm sessionId={session.id} defaultMode={session.defaultMode} />
      <Link
        href={`/sessions/${id}/live`}
        className="text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
      >
        {messages.live.openLive}
      </Link>
    </div>
  );
}
