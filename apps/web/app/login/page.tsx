import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@pbl/ui';
import { LoginForm } from '@/components/login-form';
import { messages } from '@/messages';

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.login.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm />
        <Link
          href="/"
          className="text-center text-sm text-emerald-800 underline-offset-2 hover:underline"
        >
          {messages.login.back}
        </Link>
      </CardContent>
    </Card>
  );
}
