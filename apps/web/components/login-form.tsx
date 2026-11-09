'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input } from '@pbl/ui';
import { loginRequest } from '@/lib/api/client';
import { messages } from '@/messages';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await loginRequest({ email, password });
          setBusy(false);
          if (result.ok) {
            router.refresh();
            router.push('/sessions');
            return;
          }
          setError(result.message || messages.login.failed);
        })();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.login.email}
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {messages.login.password}
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </label>
      {error !== null ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {messages.login.submit}
      </Button>
    </form>
  );
}
