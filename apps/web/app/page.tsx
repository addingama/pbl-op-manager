import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import { messages } from '@/messages';

export default function HomePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.home.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-slate-700">{messages.home.intro}</p>
        <Button asChild className="w-full">
          <Link href="/sessions">{messages.home.viewSessions}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
