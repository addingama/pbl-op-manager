import { adminMeSchema } from '@pbl/shared';
import { apiGet } from '@/lib/api/server';

export async function getAdminSession() {
  return apiGet('/api/auth/me', adminMeSchema);
}
