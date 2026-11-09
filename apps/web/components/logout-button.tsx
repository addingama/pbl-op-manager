'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@pbl/ui';
import { logoutRequest } from '@/lib/api/client';
import { messages } from '@/messages';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            await logoutRequest();
            router.refresh();
            router.push('/');
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {messages.nav.signOut}
    </Button>
  );
}
