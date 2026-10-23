import { redirect } from "next/navigation";

/*
  Landing route. The dashboard lives at /home (feat-dashboard), so the root
  redirects there. Auth is enforced by the dashboard's API calls; an expired or
  missing session sends the user to /login from the client view.
*/
export default function RootPage() {
  redirect("/home");
}
