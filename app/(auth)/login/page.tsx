import { readInviteCode, readRedirect } from "../auth-params";
import { LoginForm } from "../login/LoginForm";

/*
  Login route. Rendered on the server so the form is in the first HTML payload:
  a slow or failed JS load never leaves the screen on a bare "Memuat..." state
  (issue: Safari iOS stuck on the loading screen).
*/
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      redirectTo={readRedirect(params.redirect)}
      initialInviteCode={readInviteCode(params.invite)}
    />
  );
}
