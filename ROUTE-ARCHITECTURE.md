# ROUTE-ARCHITECTURE.md - HoldLine (LAW#11)

The page/route architecture is derived from the frozen user model (USER-ONBOARDING.md), not crammed
into one page. Each user class enters through a route built for it: the xStock Borrower uses the
landing + app surface, the Evaluator/Judge uses the separate `/demo` route, and the Keeper Operator
consumes the API/status surface. This maps the ACTUAL shipped Next.js App Router tree
(`app/src/app/`), with the in-window delta additions marked.

## ROUTES

### Pages
- / - Landing + app surface (`app/src/app/page.tsx`). The money shot: a borrower connects a wallet, sees their real Kamino obligation and health, and arms Protect. Serves the xStock Borrower class. Landing legibility in 30 seconds: "borrow against xStocks, never get liquidated in your sleep."
- /demo - Judge/Evaluator route (`app/src/app/demo/page.tsx`). The Lie Detector surface: an adversarial keeper's diverts each revert red on-chain, and a real protective repay goes green. Separate from the app so a cold judge reaches the proof without wallet/onboarding. Serves the Evaluator class.

### API routes (Keeper Operator + app surface)
- /api/protect/arm - arm a vault (fund reserve, set trigger).
- /api/protect/status - per-vault protection status.
- /api/protect/keeper-status - keeper liveness for an armed vault.
- /api/keeper/status - global keeper worker health.
- /api/kamino/market - live (cloned) Kamino market read.
- /api/kamino/obligations - borrower obligation read.
- /api/kamino/transaction/borrow - build a borrow tx (app flow).
- /api/kamino/transaction/repay - build a repay tx (app flow).
- /api/demo/mode - toggle demo view state (reads real cloned state, not mocked input).
- /api/demo/simulate-gap - advances the cloned-fork price to the closed-hours gap scenario on REAL cloned Kamino state (it moves the fork, it does not fake a result; the repay that follows is the real on-chain instruction).

### In-window delta route additions
- Save/Solend second-market reads reuse the `/api/kamino/*` shape generalized by the market descriptor (the net-new adapter surfaces under the same obligation/market API, market-agnostic).
- Lie Detector panel deepened on `/demo` (reuses the shipped design tokens; craft polish only by design-forge at the design_forge phase).

## FIRST-CONTACT
- 30-sec legibility: within 30 seconds on `/`, a visitor reads the one-line thesis ("borrow against tokenized stocks; an autonomous keeper that can ONLY repay saves you from closed-hours liquidation") and sees a live health gauge on a real obligation. On `/demo`, a judge sees the Lie Detector within 30 seconds.
- Money-shot on landing: the health factor going from red (breach) to green (protective repay fired, owner key absent) is the money shot, visible on the landing/app surface and reproducible one-command via `npm run prove`.
- First-contact axis: TRUST (the keeper can only ever repay, never withdraw) demonstrated, not asserted. The opening beat is the custody guarantee made legible, because the whole product rests on a bot the user can trust with wallet-adjacent authority.

### E0 presentation fix-axes
- Liveness / cold-start: `/` and `/demo` must render a live, real-state view on first paint (health gauge on a real cloned obligation); no blank cold-start screen. The reproducible fork guarantees real state is present offline.
- Honesty placement: the trust claim ("keeper can ONLY repay, never withdraw") and the honest scope (closed-hours hero; intraday is roadmap, not built) are placed on first contact, not buried; a 503 "proof not attached" state shows honestly rather than faking a save.
- Money-shot: the red-to-green health transition on a real protective repay (owner key absent), on landing and reproducible via `npm run prove`.
- Entry-funnel: Borrower enters at `/` (connect to arm Protect); Judge enters at `/demo` (Lie Detector, no wallet); Keeper Operator enters at the `/api/*` status surface. Each class has one clear entry, no cross-funnel confusion.
