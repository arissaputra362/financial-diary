# Financial Diary — Claude Guide

@AGENTS.md

---

> **Note for Claude:** The `@AGENTS.md` above imports the full agent guide. Read it completely before writing any code. All conventions, tech stack, design system, antislop rules, and feature constraints are defined there.

## Claude-Specific Notes

- This project uses **Bun** as the package manager. Always use `bun add` / `bun remove`, never `npm` or `yarn`.
- This project uses **Tailwind CSS v4** with the new `@import "tailwindcss"` syntax (no `tailwind.config.js`). Do not generate a `tailwind.config.js` file.
- This project uses **Next.js 16 App Router**. Do not use `getServerSideProps`, `getStaticProps`, or anything from the Pages Router.
- Before any UI work, read the antislop core skill and apply it in **Mode 1 (during)**, not after.
- The UI design reference (HTML prototype) is at `docs/design/interactive-mockup.html`.
