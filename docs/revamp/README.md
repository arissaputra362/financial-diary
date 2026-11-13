# FinDiary Revamp Documentation

Dokumentasi redesign ini tetap terisolasi di `docs/revamp/`. Jangan memindahkan atau mengganti dokumentasi maupun konfigurasi agent yang sudah ada.

## Entry points

1. Baca [`AGENTS.md`](AGENTS.md) dan instruksi repository di `../../AGENTS.md`.
2. Baca [master redesign instructions](.agent/MASTER_REVAMP_INSTRUCTIONS.md).
3. Baca [phase execution prompts](PROMPT.md).
4. Ikuti urutan baca dokumen produk dan desain di bawah ini.

Phase 0 bersifat read-only dan memerlukan persetujuan eksplisit pemilik produk sebelum dimulai. Setelah Phase 0, berhenti untuk review. Fase berikutnya juga memerlukan persetujuan eksplisit terpisah.

## Urutan baca

1. [Revamp brief](docs/REVAMP_BRIEF.md)
2. [Product and brand identity](docs/PRODUCT_AND_BRAND_IDENTITY.md)
3. [Design system](docs/DESIGN_SYSTEM.md)
4. [Information architecture](docs/INFORMATION_ARCHITECTURE.md)
5. [UX and interaction guidelines](docs/UX_AND_INTERACTION_GUIDELINES.md)
6. [Page specifications](docs/PAGE_SPECIFICATIONS.md)
7. [Component inventory](docs/COMPONENT_INVENTORY.md)
8. [Data and business logic guardrails](docs/DATA_AND_BUSINESS_LOGIC_GUARDRAILS.md)
9. [Accessibility and responsive requirements](docs/ACCESSIBILITY_AND_RESPONSIVE.md)
10. [QA and acceptance criteria](docs/QA_AND_ACCEPTANCE_CRITERIA.md)
11. [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
12. [Anti-slop review checklist](docs/ANTI_SLOP_REVIEW_CHECKLIST.md)
13. [Audit deliverables and templates](docs/audit/README.md)

Repository implementation, APIs, database, and verified behavior remain the source of truth for existing capabilities. If design documents conflict with current behavior or the existing project design system, document the conflict and obtain a product decision before changing behavior or established design foundations. Mockups are conceptual direction, not proof that depicted features exist.

**Visual direction update (2026-11-11):** Product-owner approval for a total redesign supersedes prior visual-foundation approval gates. Current implementation and verified behavior remain authoritative for existing capabilities and business rules.

## Phase 4 status (2026-11-13)

Phase 4 implementation and required regression gates are complete:

- Unit tests: 563/563 passed.
- Integration tests: 39/39 passed.
- Focused Phase 4 browser gates: 45/45 passed.
- Visual refresh browser gates: 12/12 passed.
- OCR regression browser gates: 27/27 passed.
- Production build, TypeScript, and lint completed successfully.

The broad legacy Playwright command still reports failures in older dashboard,
goals/advisor, money-input, budget, bank-institution, chart, and undo specs.
Those assertions target superseded labels, navigation, and integer-only money
behavior; they are not used as the current Phase 4 acceptance gate.

## Phase 5 status (2026-11-13)

Final polish review completed. No additional UI or business-logic change was
justified after reviewing visual consistency, micro-interactions, loading and
empty states, form usability, navigation, accessibility, mobile ergonomics,
and production build output. Adding changes without a confirmed user-impact
finding would risk disturbing the approved Phase 3/4 surfaces.

The remaining legacy Playwright failures are tracked separately and remain
outside the approved Phase 5 polish scope.
