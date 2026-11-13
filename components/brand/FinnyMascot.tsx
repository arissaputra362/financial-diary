/**
 * The dashboard uses the shared vector artwork so SVG and PNG exports stay aligned.
 */
export function FinnyMascot({ className }: { className?: string }) {
  return (
    <Image
      src="/finny-mascot.svg"
      alt=""
      width={196}
      height={200}
      unoptimized
      className={className}
    />
  );
}
import Image from "next/image";

