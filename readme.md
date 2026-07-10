# TCC Ratio Scheduler — Phase 0

The compliance engine for Peace Boulevard, post-consolidation. This phase is the
**engine and its proof** — no user interface, no live deployment, nothing a
teacher touches yet. That is deliberate. You trust this the way you trust a
surgical checklist: not because it's clever, but because you watched it be right.

## What's here

```
db/schema.sql        PostgreSQL tables + Peace seed data (11 rooms, ratios, caps)
src/time.js          time helpers
src/engine.js        evaluateDay() — the whole product, as one pure function
src/peace-seed.js    Peace's real configuration as data
test/engine.test.js  25 scenarios with answers you can verify by hand
demo.js              runs a Peace day and prints what a director would see
package.json
```

## Run it

You don't need a terminal for the *build* — files drop into a GitHub repo the
same way as your other apps. But to watch the tests pass, anyone with Node 18+
can run:

```
npm test      # runs the 25-scenario suite
npm run demo  # prints a full Peace day, a call-out, and the fix
```

Current status: **25 pass, 0 fail.**

## The two things to remember

1. **This is Planned Compliance, not live truth.** The engine evaluates the
   *schedule*. A teacher who clocks in nine minutes late creates a real gap the
   engine cannot see until Staff Time Entry is wired in (Phase 6). Any screen
   built on this must say "Planned Compliance" until then. This single label
   prevents the most dangerous failure mode of the whole system.

2. **Your break margin is thin.** At 28 bodies on the floor with a 9:30 break
   open, the schedule closes with about 60 minutes to spare across the day. The
   first call-out puts it underwater. The 9:30 open is load-bearing — protect it
   like ratio itself. See the architecture doc, §break math.

## What the engine checks

| Check | Severity | What it catches |
|---|---|---|
| RATIO | LEGAL | too few teaching adults for the youngest child present, at any instant |
| GROUP_SIZE | LEGAL | more children than the indoor group-size cap (e.g. 16 toddlers in the gym) |
| SPACE_CAPACITY | LEGAL | more children than the room physically holds |
| NO_LEAD | LEGAL | a group with no lead caregiver assigned (break-exempt) |
| BAND_SEPARATION | POLICY | under-2½ mixed with preschool — overridable with a logged reason |
| UNQUALIFIED_OPENER / CLOSER | LEGAL | first-in / last-out adult isn't a lead |

## Confirm-with-consultant flags (baked in as config, easy to flip)

- `config.leadPresence = 'BREAK_EXEMPT'` — a reliever covering a lead's break
  needn't be lead-qualified. Flip to `'CONTINUOUS'` if Michigan requires a lead
  present every instant; this tightens the break math significantly.
- `band_separation_policy` severity is `POLICY`. Make it `LEGAL` if your
  licensor treats age mixing as a hard block.
- Preschool group-size cap is 36 indoors, uncapped outdoors — as you specified.

## The build plan

| Phase | Window | Deliverable |
|---|---|---|
| **0. Engine** ✅ | Jul 13–24 | schema + `evaluateDay()` + 25 tests — **done** |
| 1. Pre-flight | Jul 27–Aug 7 | Day Setup screen → read-only morning timeline |
| 2. Breaks & open/close | Aug 10–21 | break solver, `UNSCHEDULABLE_BREAK` |
| 3. Freeze | Aug 24–28 | move week — no deploys |
| 4. Shadow mode | Aug 31–Sep 30 | app computes, paper governs, every diff investigated |
| 5. Live | Oct 1+ | call-out engine + consolidation recommender govern |
| 6. Integrate | Nov+ | Playground census + Staff Time actuals; retire "Planned" label |

**Phase 4 is not optional.** Thirty days of the engine matching reality before a
single teacher depends on it. October 1 go-live, not August 31.
