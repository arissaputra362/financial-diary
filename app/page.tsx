import { redirect } from "next/navigation";

/*
  Landing route. The dashboard lives at /home (feat-dashboard), so the root
  redirects there. The request proxy protects /home and sends missing or
  expired sessions to /login before the dashboard renders.
*/
export default function RootPage() {
  redirect("/home");
}
