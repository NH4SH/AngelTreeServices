import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export type PasswordRecoveryGrant = {
  userId: string;
};

export function grantPasswordRecovery(
  event: AuthChangeEvent,
  session: Session | null,
): PasswordRecoveryGrant | null {
  if (event !== "PASSWORD_RECOVERY") {
    return null;
  }

  const userId = session?.user?.id?.trim();
  return userId ? { userId } : null;
}

export function recoveryGrantMatchesUser(
  grant: PasswordRecoveryGrant | null,
  user: Pick<User, "id"> | null,
) {
  return Boolean(grant?.userId && user?.id && grant.userId === user.id);
}
