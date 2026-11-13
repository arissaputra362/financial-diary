# FinDiary — Anti-Slop Review Checklist

Use this checklist during design review and code review.

## Visual quality
- [ ] Does the screen have one clear primary purpose?
- [ ] Is information hierarchy obvious within a few seconds?
- [ ] Are important financial values more prominent than decoration?
- [ ] Is whitespace intentional rather than wasteful?
- [ ] Are cards used only when they clarify grouping?
- [ ] Are typography sizes and weights consistent?
- [ ] Are colors semantic and restrained?
- [ ] Are icons from one consistent family?
- [ ] Are gradients, shadows, blur, and animation used sparingly?
- [ ] Does the screen feel like FinDiary rather than a generic template?

## UX quality
- [ ] Is the primary action obvious?
- [ ] Can users complete common tasks with minimal friction?
- [ ] Are labels understandable in Indonesian?
- [ ] Are personal and shared contexts unmistakable?
- [ ] Are errors recoverable and clearly explained?
- [ ] Are empty states useful?
- [ ] Are disabled and pending states clear?
- [ ] Do all visible controls work?

## Mobile quality
- [ ] Designed and checked at narrow mobile width first?
- [ ] No unintended horizontal overflow?
- [ ] Touch targets are comfortable?
- [ ] Keyboard does not obscure fields/actions?
- [ ] Bottom navigation respects safe areas?
- [ ] Dense information is reorganized appropriately?

## Dark mode quality
- [ ] Not just inverted light mode?
- [ ] Surface hierarchy remains visible?
- [ ] Text and muted text remain readable?
- [ ] Semantic colors remain distinguishable?
- [ ] Charts, illustrations, menus, and dialogs are theme-aware?

## Product integrity
- [ ] No existing feature omitted?
- [ ] No fake data or fake analytics?
- [ ] No financial formula changed?
- [ ] No permission boundary weakened?
- [ ] No API/database behavior changed without approval?
- [ ] Feature parity matrix updated?
