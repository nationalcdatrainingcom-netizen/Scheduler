'use strict';

const { toMin, toHHMM, spans } = require('./time');

// =============================================================================
// TCC Ratio Scheduler — Compliance Engine (Phase 0)
//
// One pure function: evaluateDay(snapshot) -> Violation[]
// No database access, no I/O, no side effects. Everything the dashboard, the
// call-out remediator, and the consolidation recommender do is a call to this.
//
// Two load-bearing ideas:
//   1. Ratio is a property of a GROUP (a supervision unit in a space over an
//      interval), not a room. Consolidation merges rooms into one group.
//   2. Compliance is INSTANTANEOUS. We slice the day at every event boundary
//      and check every slice. A day is compliant iff every slice is.
//
// Severity:
//   LEGAL  = violates Michigan licensing. Hard block, cannot be dismissed.
//   POLICY = violates a TCC rule (e.g. no toddlers with preschool). Soft block,
//            director may override with a logged reason.
// =============================================================================

// ---- lookups ----------------------------------------------------------------

function ratioFor(snapshot, bandId, date) {
  const rule = snapshot.ratioRules.find(
    (r) =>
      r.ageBandId === bandId &&
      r.effectiveFrom <= date &&
      (r.effectiveTo == null || r.effectiveTo >= date)
  );
  if (!rule) throw new Error(`No ratio rule for band ${bandId} on ${date}`);
  return rule.childrenPerAdult;
}

function settingOf(space) {
  return space.kind === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR';
}

// Effective capacity of a group = the tighter of the physical space limit and
// the licensing group-size cap for the youngest band present, in this setting.
// This is exactly how the gym works: 22 preschoolers (square footage binds) but
// only 12 toddlers (the 1:4 group-size cap binds).
function capacityFor(snapshot, space, bandId) {
  const setting = settingOf(space);
  const cap = snapshot.groupSizeCaps.find(
    (c) => c.ageBandId === bandId && c.setting === setting
  );
  const sizeCap = cap && cap.maxChildren != null ? cap.maxChildren : Infinity;
  const physical = space.physicalCapacity != null ? space.physicalCapacity : Infinity;
  return {
    limit: Math.min(sizeCap, physical),
    binding: sizeCap <= physical ? 'GROUP_SIZE' : 'SPACE_CAPACITY',
  };
}

function hasValidCredential(snapshot, staffId, credential, date) {
  return snapshot.credentials.some(
    (c) =>
      c.staffId === staffId &&
      c.credential === credential &&
      (c.expiresOn == null || c.expiresOn >= date)
  );
}

// ---- census helpers ---------------------------------------------------------

function bandsPresent(group) {
  return group.census.filter((c) => c.count > 0);
}

function totalChildren(group) {
  return group.census.reduce((s, c) => s + c.count, 0);
}

function youngestBand(snapshot, group) {
  const present = bandsPresent(group);
  if (present.length === 0) return null;
  return present
    .map((c) => snapshot.ageBands.find((b) => b.id === c.ageBandId))
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
}

// ---- boundaries -------------------------------------------------------------

function collectBoundaries(snapshot) {
  const set = new Set();
  for (const g of snapshot.groups) {
    set.add(g._start);
    set.add(g._end);
  }
  for (const a of snapshot.assignments) {
    set.add(a._start);
    set.add(a._end);
  }
  return [...set].sort((x, y) => x - y);
}

function teachingStaffInSlice(snapshot, groupId, t0, t1) {
  const ids = new Set();
  for (const a of snapshot.assignments) {
    if (a.groupId === groupId && a.kind === 'TEACHING' && spans(a._start, a._end, t0, t1)) {
      ids.add(a.staffId);
    }
  }
  return [...ids];
}

// ---- the engine -------------------------------------------------------------

function evaluateDay(input) {
  const snapshot = normalize(input);
  const date = snapshot.date;
  const config = snapshot.config || {};
  const leadMode = config.leadPresence || 'BREAK_EXEMPT';
  const raw = [];

  const spaceById = new Map(snapshot.spaces.map((s) => [s.id, s]));
  const boundaries = collectBoundaries(snapshot);

  // ---- per-slice checks: RATIO (and continuous-lead, if configured) ----
  for (let i = 0; i < boundaries.length - 1; i++) {
    const t0 = boundaries[i];
    const t1 = boundaries[i + 1];
    if (t1 <= t0) continue;

    for (const group of snapshot.groups) {
      if (!spans(group._start, group._end, t0, t1)) continue;
      const total = totalChildren(group);
      if (total === 0) continue;

      const youngest = youngestBand(snapshot, group);
      const ratio = ratioFor(snapshot, youngest.id, date);
      const required = Math.ceil(total / ratio);
      const teaching = teachingStaffInSlice(snapshot, group.id, t0, t1);

      if (teaching.length < required) {
        raw.push({
          code: 'RATIO',
          severity: 'LEGAL',
          groupId: group.id,
          t0,
          t1,
          required,
          actual: teaching.length,
          detail:
            `${group.name || 'Group ' + group.id}: ${total} children ` +
            `(youngest ${youngest.label}, 1:${ratio}) need ${required} adults, ` +
            `have ${teaching.length}`,
        });
      }

      if (leadMode === 'CONTINUOUS') {
        const leadPresent = teaching.some((sid) =>
          hasValidCredential(snapshot, sid, 'LEAD_CAREGIVER', date)
        );
        if (!leadPresent) {
          raw.push({
            code: 'NO_LEAD',
            severity: 'LEGAL',
            groupId: group.id,
            t0,
            t1,
            detail: `${group.name || 'Group ' + group.id}: no lead caregiver present`,
          });
        }
      }
    }
  }

  // ---- per-group-day checks: capacity, band separation, break-exempt lead ----
  for (const group of snapshot.groups) {
    const total = totalChildren(group);
    if (total === 0) continue;
    const space = spaceById.get(group.spaceId);
    const youngest = youngestBand(snapshot, group);

    // capacity / group size
    const { limit, binding } = capacityFor(snapshot, space, youngest.id);
    if (total > limit) {
      raw.push({
        code: binding,
        severity: 'LEGAL',
        groupId: group.id,
        t0: group._start,
        t1: group._end,
        required: limit,
        actual: total,
        detail:
          `${group.name || 'Group ' + group.id}: ${total} children in ${space.name} ` +
          `exceeds ${binding === 'GROUP_SIZE' ? 'group-size cap' : 'space capacity'} of ${limit}`,
      });
    }

    // band separation (TCC policy layered on top of licensing)
    const present = bandsPresent(group).map((c) => c.ageBandId);
    for (let a = 0; a < present.length; a++) {
      for (let b = a + 1; b < present.length; b++) {
        const pol = separationPolicy(snapshot, present[a], present[b]);
        if (pol) {
          raw.push({
            code: 'BAND_SEPARATION',
            severity: pol.severity,
            groupId: group.id,
            t0: group._start,
            t1: group._end,
            detail:
              `${group.name || 'Group ' + group.id}: mixes ` +
              `${bandLabel(snapshot, present[a])} with ${bandLabel(snapshot, present[b])}` +
              (pol.rationale ? ` (${pol.rationale})` : ''),
          });
        }
      }
    }

    // lead presence, break-exempt: the group must have a lead caregiver
    // *assigned* to it that day. Momentary absence for that lead's own
    // protected break, covered by any adult, is fine.
    if (leadMode !== 'CONTINUOUS') {
      const hasLead = snapshot.assignments.some(
        (a) =>
          a.groupId === group.id &&
          a.kind === 'TEACHING' &&
          hasValidCredential(snapshot, a.staffId, 'LEAD_CAREGIVER', date)
      );
      if (!hasLead) {
        raw.push({
          code: 'NO_LEAD',
          severity: 'LEGAL',
          groupId: group.id,
          t0: group._start,
          t1: group._end,
          detail: `${group.name || 'Group ' + group.id}: no lead caregiver assigned`,
        });
      }
    }
  }

  // ---- whole-day checks: opener / closer must be lead-qualified ----
  const teachingAsgs = snapshot.assignments.filter((a) => a.kind === 'TEACHING');
  if (teachingAsgs.length > 0) {
    const firstStart = Math.min(...teachingAsgs.map((a) => a._start));
    const lastEnd = Math.max(...teachingAsgs.map((a) => a._end));

    const openers = teachingAsgs.filter((a) => a._start === firstStart);
    if (!openers.some((a) => hasValidCredential(snapshot, a.staffId, 'LEAD_CAREGIVER', date))) {
      raw.push({
        code: 'UNQUALIFIED_OPENER',
        severity: 'LEGAL',
        groupId: null,
        t0: firstStart,
        t1: firstStart,
        detail: `First adult on the floor (${toHHMM(firstStart)}) is not a lead caregiver`,
      });
    }

    const closers = teachingAsgs.filter((a) => a._end === lastEnd);
    if (!closers.some((a) => hasValidCredential(snapshot, a.staffId, 'LEAD_CAREGIVER', date))) {
      raw.push({
        code: 'UNQUALIFIED_CLOSER',
        severity: 'LEGAL',
        groupId: null,
        t0: lastEnd,
        t1: lastEnd,
        detail: `Last adult on the floor (${toHHMM(lastEnd)}) is not a lead caregiver`,
      });
    }
  }

  return finalize(mergeContiguous(raw));
}

// ---- helpers ----------------------------------------------------------------

function separationPolicy(snapshot, bandA, bandB) {
  const pol = (snapshot.separationPolicy || []).find(
    (p) =>
      (p.bandA === bandA && p.bandB === bandB) ||
      (p.bandA === bandB && p.bandB === bandA)
  );
  return pol || null;
}

function bandLabel(snapshot, bandId) {
  const b = snapshot.ageBands.find((x) => x.id === bandId);
  return b ? b.label : `band ${bandId}`;
}

// A ratio gap that persists across several adjacent slices is one problem, not
// five. Merge violations that share (code, groupId) and touch in time.
function mergeContiguous(list) {
  const key = (v) => `${v.code}|${v.groupId}|${v.required}|${v.actual}`;
  const byKey = new Map();
  for (const v of list) {
    if (!byKey.has(key(v))) byKey.set(key(v), []);
    byKey.get(key(v)).push(v);
  }
  const out = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => a.t0 - b.t0);
    let cur = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      if (group[i].t0 <= cur.t1) {
        cur.t1 = Math.max(cur.t1, group[i].t1);
      } else {
        out.push(cur);
        cur = { ...group[i] };
      }
    }
    out.push(cur);
  }
  return out;
}

function finalize(list) {
  return list
    .map((v) => ({
      key: `${v.code}:${v.groupId}:${toHHMM(v.t0)}`,
      code: v.code,
      severity: v.severity,
      groupId: v.groupId,
      interval: [toHHMM(v.t0), toHHMM(v.t1)],
      required: v.required,
      actual: v.actual,
      detail: v.detail,
    }))
    .sort((a, b) => a.interval[0].localeCompare(b.interval[0]) || a.code.localeCompare(b.code));
}

function normalize(input) {
  const snap = { ...input };
  snap.groups = input.groups.map((g) => ({
    ...g,
    _start: toMin(g.startsAt),
    _end: toMin(g.endsAt),
  }));
  snap.assignments = input.assignments.map((a) => ({
    ...a,
    _start: toMin(a.startsAt),
    _end: toMin(a.endsAt),
  }));
  return snap;
}

// ---- consolidation arithmetic (used by the recommender in later phases) -----
// The staff DIVIDEND of merging groups is nonzero only when the rooms carry
// remainders against the ratio. Peace's rooms all divide evenly, so at full
// census every legal merge saves zero adults. This function proves it.
function mergeDividend(censusCounts, ratio) {
  const separate = censusCounts.reduce((s, n) => s + Math.ceil(n / ratio), 0);
  const merged = Math.ceil(censusCounts.reduce((s, n) => s + n, 0) / ratio);
  return separate - merged;
}

module.exports = {
  evaluateDay,
  mergeDividend,
  // exported for unit testing of internals
  _internal: { ratioFor, capacityFor, youngestBand, collectBoundaries, mergeContiguous },
};
