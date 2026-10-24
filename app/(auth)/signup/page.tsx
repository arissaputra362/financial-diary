import { readInviteCode } from "../auth-params";
import { LoginForm } from "../login/LoginForm";

/*
  Signup shares the login form (server-rendered, same reason as `/login`), so it
  inherits the same post-auth redirect (currently /transactions).
*/
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <LoginForm initialSignup initialInviteCode={readInviteCode(params.invite)} />;
}
