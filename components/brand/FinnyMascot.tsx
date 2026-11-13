/*
  Finny is the FinDiary guide: a small sprout holding a rupiah coin. The artwork
  is decorative only; the surrounding card always states the actual budget
  condition in text, so the character never carries meaning by itself.
*/
export function FinnyMascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="60" cy="108" rx="28" ry="5" fill="#0E2A1C" opacity="0.1" />

      {/* arms */}
      <path
        d="M38 74c-7 1-12 5-13 10"
        fill="none"
        stroke="#5BB85C"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M82 74c7 1 12 5 13 10"
        fill="none"
        stroke="#5BB85C"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* body */}
      <path
        d="M60 26c-17 0-30 14-30 33 0 20 13 34 30 34s30-14 30-34c0-19-13-33-30-33Z"
        fill="#8FD96B"
      />
      <path
        d="M60 26c-17 0-30 14-30 33 0 5 1 9 2 13 4-16 15-27 28-27s24 11 28 27c1-4 2-8 2-13 0-19-13-33-30-33Z"
        fill="#A8E784"
        opacity="0.7"
      />

      {/* sprout */}
      <path
        d="M60 27c0-10 4-16 13-20 1 11-4 18-13 20Z"
        fill="#3F9D4A"
      />
      <path
        d="M58 27c-1-10-6-15-15-18 0 11 6 17 15 18Z"
        fill="#58B85E"
      />
      <path
        d="M59 28c5-4 10-5 15-4"
        fill="none"
        stroke="#2F7D3A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* face */}
      <circle cx="49" cy="59" r="3.4" fill="#12321F" />
      <circle cx="71" cy="59" r="3.4" fill="#12321F" />
      <circle cx="50.2" cy="57.8" r="1.1" fill="#FFFFFF" />
      <circle cx="72.2" cy="57.8" r="1.1" fill="#FFFFFF" />
      <ellipse cx="40" cy="68" rx="5" ry="3" fill="#F59E0B" opacity="0.35" />
      <ellipse cx="80" cy="68" rx="5" ry="3" fill="#F59E0B" opacity="0.35" />
      <path
        d="M54 69c2 3 10 3 12 0"
        fill="none"
        stroke="#12321F"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* coin */}
      <circle cx="86" cy="86" r="14" fill="#FBBF24" stroke="#D97706" strokeWidth="2" />
      <circle cx="86" cy="86" r="10.5" fill="none" stroke="#D97706" strokeWidth="1.2" opacity="0.65" />
      <text
        x="86"
        y="90"
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontSize="9"
        fontWeight="700"
        fill="#7C4A03"
      >
        Rp
      </text>
    </svg>
  );
}
