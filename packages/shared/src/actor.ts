/** Who is performing an action (guest vs admin; player actor reserved for post-MVP). */
export type Actor =
  { readonly kind: 'guest' } | { readonly kind: 'admin'; readonly userId: string };

export const GUEST_ACTOR: Actor = { kind: 'guest' };
