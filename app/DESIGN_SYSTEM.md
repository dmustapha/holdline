# DESIGN_SYSTEM.md, Holdline · Night Watch

> Single source of truth for the Holdline judge-facing surface. Formalized from the shipped
> `app/src/app/globals.css` `:root` (Stage 4 selected direction). The token-drift lint asserts
> shipped `:root` == this file. Change a token here **and** in `globals.css` together, never one alone.

## Identity
- **World statement:** a midnight watchtower for a self-custodial loan, the product that stays awake so you don't get liquidated in your sleep.
- **Accent color:** moon `#6C8CFF` (soft periwinkle-blue). Rationale: a single moonlit hue reads as "night watch" without the alarm energy of red or the greed energy of green; all surface variety comes from its opacity derivatives, never a second brand hue.
- **Named signature element:** the **vigil watch-pulse**, a breathing core dot with a radiating heartbeat ring on the always-visible keeper-liveness strip (`.hl-live-dot`). It is the one detail that says "something is actively watching, right now." It stays visible on every screen; it goes red and stops pulsing when the watcher is OFFLINE.
- **Invariant phrase (EX-10):** **"Don't get liquidated in your sleep."** Reused verbatim across README, the `<title>`, and the hero. The custody law it protects: *You trigger the gap. Nobody triggers the repay*, the keeper can only repay your bound loan from a reserve you fund and own.

## Tokens

### Color, midnight-indigo world (one hue + opacity derivatives)
| Token | Value | Role |
|-------|-------|------|
| `--bg-base` | `#0a0e1a` | page background (z0) |
| `--surface-1` | `#10162a` | lowest card fill (z1) |
| `--surface-2` | `#161e38` | default card fill (z2) |
| `--surface-3` | `#1d2848` | raised / demo card fill (z3) |
| `--moon` (`--amber` alias) | `#6c8cff` | the ONE brand hue |
| `--moon-55/32/12/06` | moon @ 55/32/12/6% | derivative accents, borders, glows |
| `--text-hi` | `#eaeefb` | primary text |
| `--text-mid` | `#9ba6c9` | secondary text |
| `--text-low` | `#868fb5` | tertiary caption text (raised for AA 4.5:1) |

> `--amber` is a **legacy alias → `#6c8cff`**, not a second hue. `btn-primary`, focus rings, and inputs
> inherit the brand through it. Do NOT revert it to a warm value.

### Semantic signal lights (verdict, not decoration)
| Token | Value | Meaning |
|-------|-------|---------|
| `--safe` | `#35d6a4` | loan healthy / watcher online |
| `--warn` | `#f5b841` | approaching trigger LTV |
| `--danger` | `#ff5c6c` | liquidation-risk / watcher OFFLINE |

### Type scale (fluid, `clamp()`)
- Display: **Fraunces** serif (`--font-display`), weights 400–700 + italic. Hero `clamp(2.2rem, 5.4vw + 0.4rem, 3.9rem)`, `letter-spacing:-0.025em`.
- Body: **Familjen Grotesk** (`--font-body`), weights 400–700. Base `line-height:1.55`, `letter-spacing:0.01em`.
- Numerics: `font-variant-numeric: tabular-nums` on all stats/gauge/mono.

### Spacing & radius
- Radius scale (CF-1, tokenized, no ad-hoc values): `--radius-sm 8px` · `--radius-md 14px` · `--radius-lg 20px` · `--radius-xl 28px` · `--radius-full 999px`.
- Layout rhythm via `clamp()`: shell padding `clamp(20px,4vw,40px)`, card padding `clamp(18px,3vw,26px)`.

### Ready-to-paste `@theme` block (EX-10)
```css
/* Holdline · Night Watch, paste to adopt the whole system (dark-only) */
:root {
  --radius-sm: 8px; --radius-md: 14px; --radius-lg: 20px; --radius-xl: 28px; --radius-full: 999px;
  --bg-base: #0a0e1a; --surface-1: #10162a; --surface-2: #161e38; --surface-3: #1d2848;
  --border-hair: rgba(108,140,255,.12); --border-soft: rgba(108,140,255,.22); --hairline-2: rgba(108,140,255,.06);
  --text-hi: #eaeefb; --text-mid: #9ba6c9; --text-low: #868fb5;
  --moon: #6c8cff; --moon-55: rgba(108,140,255,.55); --moon-32: rgba(108,140,255,.32);
  --moon-12: rgba(108,140,255,.12); --moon-06: rgba(108,140,255,.06);
  --amber: #6c8cff; --amber-soft: rgba(108,140,255,.14);
  --safe: #35d6a4; --warn: #f5b841; --danger: #ff5c6c;
  --safe-soft: rgba(53,214,164,.12); --warn-soft: rgba(245,184,65,.12); --danger-soft: rgba(255,92,108,.1);
  --elev-1: 0 1px 0 rgba(255,255,255,.03) inset, 0 2px 6px rgba(0,0,0,.35);
  --elev-2: 0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.4);
  --elev-3: 0 1px 0 rgba(255,255,255,.05) inset, 0 20px 48px rgba(0,0,0,.55), 0 8px 20px rgba(0,0,0,.45);
  --glow-moon: 0 0 0 1px var(--moon-32), 0 8px 30px rgba(108,140,255,.22);
  --ring: 0 0 0 3px var(--moon-55);
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Familjen Grotesk", ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

### Do's / Don'ts (EX-10)
- **Do** derive every accent from `--moon` via opacity; **Don't** introduce a second brand hue (signal lights are semantic-only).
- **Do** use the radius tokens; **Don't** write ad-hoc `rounded-[17px]` / inline hex.
- **Do** lighten the surface per elevation level (`surface-1 → surface-2 → surface-3`); **Don't** flatten cards to a single fill.

## Status Legend (EX-10)
Color carries verdict meaning, never decoration. Maps to the honesty surfaces (E-2/E-3/E-6).
| Color | State token | Meaning to the user |
|-------|-------------|---------------------|
| `--safe` `#35d6a4` | `WATCHER_ONLINE` / zone `safe` | Protect is watching; loan health is comfortably below trigger |
| `--warn` `#f5b841` | zone `warn` (LTV ≥ trigger) | Loan is drifting toward the trigger LTV; a repay may fire |
| `--danger` `#ff5c6c` | `WATCHER_OFFLINE` / zone `danger` | Watcher is OFFLINE (fail-closed, loud) **or** loan is at liquidation risk |
| `--text-low` (grey) | zone `unknown` | Live position not yet loaded, no false green |

## Craft
- **Radius scale (CF-1):** tokenized, no inline radii.
- **Elevation ladder (CF-2):** dark surfaces get lighter per z-level (`#10162a → #161e38 → #1d2848`).
- **Shadow philosophy, `soft-elevation` (exactly one, named):** every raised element uses a layered drop + a `rgba(255,255,255,.03–.05) inset` top highlight (`--elev-1/2/3`). The moon glow (`--glow-moon`) is an accent overlay on brand/interactive surfaces, not a second philosophy.
- **Glass recipe:** modal backdrop `background: rgba(5,8,18,.66); backdrop-filter: blur(6px)` + the modal itself carries `--elev-3` and a `--border-soft` hairline.
- **Hover recipe:** buttons lift `translateY(-2px)` + gain `--elev-2, --glow-moon`; primary deepens its moon glow. Timing `transform .18s ease, box-shadow .2s ease`.
- **Focus-visible recipe:** `box-shadow: var(--ring)` (`0 0 0 3px var(--moon-55)`) + `border-radius: var(--radius-sm)`, consistent everywhere via the global `:focus-visible` rule.
- **Signature element:** the vigil watch-pulse (`.hl-live-dot` breathing core + `hl-vigil-ring` radiating ring, 2.4s) stays visible on the liveness strip on every screen; disabled + red when OFFLINE.

## Primitives
- **Card** `.hl-card`, `linear-gradient(180deg, surface-2, surface-1)`, `--border-hair`, `--radius-lg`, `--elev-2`.
- **Button** `.hl-btn` / `.hl-btn-primary`, pill (`--radius-full`), soft-elevation, moon-glow on primary; dark ink on the moon gradient.
- **Input** `.hl-input`, inset shadow, moon focus border + `--moon-12` ring.
- **Verdict pill** `.hl-pill-{safe,warn,danger}`, signal-light dot (`::before` glowing) + soft-tinted background.
- **Health gauge** `.hl-health`, physical inset track + fill knob + trigger/liquidation stem markers (the second signature object).
- **Banner** `.hl-banner-{warn,danger}`, loud E-3 state, `inset 3px 0 0` accent bar.

## Motion
- Keyframe vocabulary: `hl-vigil-dot` (breathing, 2.4s ease-in-out) + `hl-vigil-ring` (radiating, 2.4s ease-out), the signature; health fill `width 500ms cubic-bezier(.22,1,.36,1)`.
- Default transition: `.18–.2s ease` on transform/shadow/background.
- `@media (prefers-reduced-motion: reduce)` disables all animation/transition.
