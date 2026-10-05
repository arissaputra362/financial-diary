import { Card } from "@/components/ui/Card";

export interface ComingSoonProps {
  title: string;
  description: string;
}

/**
 * Honest placeholder for a route whose feature has not shipped yet.
 * The label is visible to the user, so the page is never a dead end (R-26).
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card variant="sky" className="text-center">
        <span className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
          Segera hadir
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          {description}
        </p>
      </Card>
    </div>
  );
}
