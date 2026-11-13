import { BottomNav } from "./BottomNav";
import { FloatingNavbar } from "./FloatingNavbar";

/**
 * Shared chrome for every signed-in screen.
 * Desktop shows the floating charcoal navbar, mobile shows the bottom bar only.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FloatingNavbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-5 md:pb-12 md:pt-24 lg:px-6">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
