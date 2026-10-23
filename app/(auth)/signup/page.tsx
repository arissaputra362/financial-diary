import LoginPage from "../login/page";

/*
  Signup shares the login form, so it inherits the same post-auth redirect
  (currently /transactions, see BUG-003 in ../login/page.tsx).
*/
export default function SignupPage() {
  return <LoginPage initialSignup />;
}