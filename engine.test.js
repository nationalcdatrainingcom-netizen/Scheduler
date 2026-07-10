'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDay, mergeDividend } = require('../src/engine');
const { baseSnapshot } = require('../src/peace-seed');

const DATE = '2026-08-31';

// ---- tiny builders ----------------------------------------------------------
let sid = 0;
const staffId = () => ++sid;

function group(id, spaceId, name, census, startsAt = '06:30', endsAt = '18:00') {
  return { id, spaceId, name, startsAt, endsAt, origin: 'BASELINE', census };
}
function asg(groupId, staff, startsAt, endsAt, kind = 'TEACHING') {
  return { groupId, staffId: staff, startsAt, endsAt, kind };
}
function lead(snapshot, id) {
  snapshot.credentials.push({ staffId: id, credential: 'LEAD_CAREGIVER', expiresOn: null });
  return id;
}
const codes = (v) => v.map((x) => x.code).sort();
const legal = (v) => v.filter((x) => x.severity === 'LEGAL');
const has = (v, code) => v.some((x) => x.code === code);

// A helper that staffs a group correctly at full ratio with a lead + aides,
// all day, no breaks — a trivially compliant baseline to perturb.
function staffFully(snapshot, g, adults) {
  const leadS = lead(snapshot, staffId());
  snapshot.assignments.push(asg(g.id, leadS, g.startsAt, g.endsAt));
  for (let i = 1; i < adults; i++) {
    snapshot.assignments.push(asg(g.id, staffId(), g.startsAt, g.endsAt));
  }
}

// =============================================================================
// 1. RATIO BOUNDARIES — every band, on and off the line
// =============================================================================

test('toddler room of 12 needs exactly 3 adults', () => {
  const s = baseSnapshot(DATE);
  const g = group(1, 101, 'Caterpillars', [{ ageBandId: 1, count: 12 }]);
  s.groups.push(g);
  staffFully(s, g, 3);
  assert.equal(legal(evaluateDay(s)).length, 0, 'three adults is compliant');
});

test('toddler room of 12 with only 2 adults is a RATIO violation', () => {
  const s = baseSnapshot(DATE);
  const g = group(1, 101, 'Caterpillars', [{ ageBandId: 1, count: 12 }]);
  s.groups.push(g);
  staffFully(s, g, 2);
  const v = evaluateDay(s);
  assert.ok(has(v, 'RATIO'), 'flags the shortfall');
  const r = v.find((x) => x.code === 'RATIO');
  assert.equal(r.required, 3);
  assert.equal(r.actual, 2);
});

test('preschool room of 20 needs 2 adults (1:10)', () => {
  const s = baseSnapshot(DATE);
  const g = group(7, 201, 'Bears', [{ ageBandId: 3, count: 20 }]);
  s.groups.push(g);
  staffFully(s, g, 2);
  assert.equal(legal(evaluateDay(s)).length, 0);
});

test('preschool room of 20 with 1 adult is a RATIO violation', () => {
  const s = baseSnapshot(DATE);
  const g = group(7, 201, 'Bears', [{ ageBandId: 3, count: 20 }]);
  s.groups.push(g);
  staffFully(s, g, 1);
  assert.ok(has(evaluateDay(s), 'RATIO'));
});

test('Flamingos at 30 needs 3 adults (1:10)', () => {
  const s = baseSnapshot(DATE);
  const g = group(11, 205, 'Flamingos', [{ ageBandId: 3, count: 30 }]);
  s.groups.push(g);
  staffFully(s, g, 3);
  assert.equal(legal(evaluateDay(s)).length, 0);
});

test('Flamingos at 30 with 2 adults is a RATIO violation', () => {
  const s = baseSnapshot(DATE);
  const g = group(11, 205, 'Flamingos', [{ ageBandId: 3, count: 30 }]);
  s.groups.push(g);
  staffFully(s, g, 2);
  const r = evaluateDay(s).find((x) => x.code === 'RATIO');
  assert.equal(r.required, 3);
  assert.equal(r.actual, 2);
});

// =============================================================================
// 2. INSTANTANEOUS BREAK COLLISION — the case paper cannot catch
// =============================================================================

test('two staff on break simultaneously drops a room below ratio', () => {
  // Butterflies: 8 toddlers, 2 adults. Both go on break 12:35–12:50. During
  // that 15-minute slice the room has 0 teaching adults.
  const s = baseSnapshot(DATE);
  const g = group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]);
  s.groups.push(g);
  const a = lead(s, staffId());
  const b = staffId();
  // each teaches, minus an overlapping break
  s.assignments.push(asg(g.id, a, '06:30', '12:35'));
  s.assignments.push(asg(g.id, a, '12:35', '12:50', 'BREAK'));
  s.assignments.push(asg(g.id, a, '12:50', '18:00'));
  s.assignments.push(asg(g.id, b, '06:30', '12:35'));
  s.assignments.push(asg(g.id, b, '12:35', '12:50', 'BREAK'));
  s.assignments.push(asg(g.id, b, '12:50', '18:00'));

  const v = evaluateDay(s);
  const r = v.find((x) => x.code === 'RATIO');
  assert.ok(r, 'flags the collision');
  assert.deepEqual(r.interval, ['12:35', '12:50'], 'pinned to the exact overlap');
  assert.equal(r.actual, 0);
});

test('staggered breaks with a reliever hold ratio all day', () => {
  const s = baseSnapshot(DATE);
  const g = group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]);
  s.groups.push(g);
  const a = lead(s, staffId());
  const b = staffId();
  const floater = staffId(); // dedicated relief
  // a breaks 12:30–13:00, b breaks 13:00–13:30, floater covers each
  s.assignments.push(asg(g.id, a, '06:30', '12:30'));
  s.assignments.push(asg(g.id, a, '12:30', '13:00', 'BREAK'));
  s.assignments.push(asg(g.id, a, '13:00', '18:00'));
  s.assignments.push(asg(g.id, b, '06:30', '13:00'));
  s.assignments.push(asg(g.id, b, '13:00', '13:30', 'BREAK'));
  s.assignments.push(asg(g.id, b, '13:30', '18:00'));
  s.assignments.push(asg(g.id, floater, '12:30', '13:30')); // covers both breaks
  assert.equal(legal(evaluateDay(s)).length, 0, 'no gap when relief overlaps');
});

// =============================================================================
// 3. SETTING-DEPENDENT CAPS — the gym
// =============================================================================

test('16 toddlers in the gym exceed the 12 group-size cap', () => {
  const s = baseSnapshot(DATE);
  const g = group(99, 301, 'Gym', [{ ageBandId: 1, count: 16 }]);
  s.groups.push(g);
  staffFully(s, g, 4); // ratio is fine (16/4)
  const v = evaluateDay(s);
  assert.ok(has(v, 'GROUP_SIZE'), 'group-size cap binds, not ratio');
  assert.ok(!has(v, 'RATIO'));
});

test('12 toddlers in the gym are exactly at cap', () => {
  const s = baseSnapshot(DATE);
  const g = group(99, 301, 'Gym', [{ ageBandId: 1, count: 12 }]);
  s.groups.push(g);
  staffFully(s, g, 3);
  assert.equal(legal(evaluateDay(s)).length, 0);
});

test('22 preschoolers fit the gym; 40 do not', () => {
  const ok = baseSnapshot(DATE);
  const g1 = group(99, 301, 'Gym', [{ ageBandId: 3, count: 22 }]);
  ok.groups.push(g1);
  staffFully(ok, g1, 3); // ceil(22/10)=3
  assert.equal(legal(evaluateDay(ok)).length, 0, '22 is within square footage');

  const over = baseSnapshot(DATE);
  const g2 = group(99, 301, 'Gym', [{ ageBandId: 3, count: 40 }]);
  over.groups.push(g2);
  staffFully(over, g2, 4);
  assert.ok(has(evaluateDay(over), 'SPACE_CAPACITY'), '40 exceeds the room itself');
});

test('outdoors, group size is uncapped — the whole toddler cohort is one group', () => {
  const s = baseSnapshot(DATE);
  // 52 toddlers (all six rooms) on the infant/toddler playground
  const g = group(99, 401, 'Infant/Toddler playground', [{ ageBandId: 1, count: 52 }]);
  s.groups.push(g);
  staffFully(s, g, 13); // ceil(52/4)
  assert.equal(legal(evaluateDay(s)).length, 0, 'ratio alone governs outdoors');
});

// =============================================================================
// 4. YOUNGEST-CHILD RATIO + BAND SEPARATION (mixed group)
// =============================================================================

test('a mixed group takes the youngest child ratio', () => {
  // 4 toddlers + 8 preschoolers = 12 children. Youngest is toddler → 1:4 →
  // needs 3 adults, NOT ceil(12/10)=2.
  const s = baseSnapshot(DATE);
  const g = group(99, 402, 'Preschool playground', [
    { ageBandId: 1, count: 4 },
    { ageBandId: 3, count: 8 },
  ]);
  s.groups.push(g);
  staffFully(s, g, 2); // would satisfy 1:10, fails 1:4
  const v = evaluateDay(s);
  const r = v.find((x) => x.code === 'RATIO');
  assert.ok(r, 'youngest drives the requirement');
  assert.equal(r.required, 3);
});

test('mixing toddlers with preschool raises a POLICY separation flag', () => {
  const s = baseSnapshot(DATE);
  const g = group(99, 402, 'Preschool playground', [
    { ageBandId: 1, count: 4 },
    { ageBandId: 3, count: 8 },
  ]);
  s.groups.push(g);
  staffFully(s, g, 3); // ratio satisfied at 1:4
  const v = evaluateDay(s);
  assert.equal(legal(v).length, 0, 'no LEGAL violation when staffed to youngest');
  const sep = v.find((x) => x.code === 'BAND_SEPARATION');
  assert.ok(sep, 'but TCC policy is flagged');
  assert.equal(sep.severity, 'POLICY', 'overridable, not a hard block');
});

// =============================================================================
// 5. LEAD CAREGIVER (break-exempt)
// =============================================================================

test('a group with no lead assigned is a NO_LEAD violation', () => {
  const s = baseSnapshot(DATE);
  const g = group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]);
  s.groups.push(g);
  // two aides, no lead credential
  s.assignments.push(asg(g.id, staffId(), '06:30', '18:00'));
  s.assignments.push(asg(g.id, staffId(), '06:30', '18:00'));
  assert.ok(has(evaluateDay(s), 'NO_LEAD'));
});

test('lead on break covered by an aide is fine (break-exempt)', () => {
  const s = baseSnapshot(DATE);
  const g = group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]);
  s.groups.push(g);
  const leadS = lead(s, staffId());
  const aide = staffId();
  const floater = staffId();
  s.assignments.push(asg(g.id, leadS, '06:30', '12:30'));
  s.assignments.push(asg(g.id, leadS, '12:30', '13:00', 'BREAK'));
  s.assignments.push(asg(g.id, leadS, '13:00', '18:00'));
  s.assignments.push(asg(g.id, aide, '06:30', '18:00'));
  s.assignments.push(asg(g.id, floater, '12:30', '13:00')); // covers ratio during break
  assert.equal(legal(evaluateDay(s)).length, 0, 'lead is assigned; break relief is fine');
});

test('an expired lead credential does not count', () => {
  const s = baseSnapshot(DATE);
  const g = group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]);
  s.groups.push(g);
  const person = staffId();
  s.credentials.push({ staffId: person, credential: 'LEAD_CAREGIVER', expiresOn: '2026-06-30' });
  s.assignments.push(asg(g.id, person, '06:30', '18:00'));
  s.assignments.push(asg(g.id, staffId(), '06:30', '18:00'));
  assert.ok(has(evaluateDay(s), 'NO_LEAD'), 'expired credential is not valid on 2026-08-31');
});

// =============================================================================
// 6. OPENER / CLOSER
// =============================================================================

test('first adult on the floor must be a lead', () => {
  const s = baseSnapshot(DATE);
  const g = group(7, 201, 'Bears', [{ ageBandId: 3, count: 20 }]);
  s.groups.push(g);
  const aide = staffId();
  const leadS = lead(s, staffId());
  // aide opens at 06:30, lead arrives 07:00
  s.assignments.push(asg(g.id, aide, '06:30', '18:00'));
  s.assignments.push(asg(g.id, leadS, '07:00', '18:00'));
  assert.ok(has(evaluateDay(s), 'UNQUALIFIED_OPENER'));
});

test('lead opening and closing clears the opener/closer checks', () => {
  const s = baseSnapshot(DATE);
  const g = group(7, 201, 'Bears', [{ ageBandId: 3, count: 20 }]);
  s.groups.push(g);
  const leadS = lead(s, staffId());
  const aide = staffId();
  s.assignments.push(asg(g.id, leadS, '06:30', '18:00'));
  s.assignments.push(asg(g.id, aide, '07:00', '17:00'));
  const v = evaluateDay(s);
  assert.ok(!has(v, 'UNQUALIFIED_OPENER'));
  assert.ok(!has(v, 'UNQUALIFIED_CLOSER'));
});

// =============================================================================
// 7. CLEAN MULTI-ROOM DAY — the happy path returns empty
// =============================================================================

test('a correctly staffed slice of Peace has zero LEGAL violations', () => {
  const s = baseSnapshot(DATE);
  const rooms = [
    group(1, 101, 'Caterpillars', [{ ageBandId: 1, count: 12 }]),
    group(2, 102, 'Butterflies', [{ ageBandId: 1, count: 8 }]),
    group(7, 201, 'Bears', [{ ageBandId: 3, count: 20 }]),
    group(11, 205, 'Flamingos', [{ ageBandId: 3, count: 30 }]),
  ];
  const adults = { 1: 3, 2: 2, 7: 2, 11: 3 };
  for (const g of rooms) {
    s.groups.push(g);
    staffFully(s, g, adults[g.id]);
  }
  assert.equal(legal(evaluateDay(s)).length, 0);
});

// =============================================================================
// 8. CONSOLIDATION ARITHMETIC — merging saves zero at full census
// =============================================================================

test('merging two full toddler rooms (8+8) saves zero adults', () => {
  assert.equal(mergeDividend([8, 8], 4), 0);
});

test('merging two full preschool rooms (20+20) saves zero adults', () => {
  assert.equal(mergeDividend([20, 20], 10), 0);
});

test('merging two half-full toddler rooms (6+6) saves one adult', () => {
  // 2 + 2 separate = 4; ceil(12/4) = 3 merged → dividend of 1
  assert.equal(mergeDividend([6, 6], 4), 1);
});

test('merging three low rooms (5+5+5) saves two adults', () => {
  // ceil(5/4)*3 = 6; ceil(15/4) = 4 → dividend of 2
  assert.equal(mergeDividend([5, 5, 5], 4), 2);
});

// =============================================================================
// 9. EMPTY GROUP — a room with no children needs no staff
// =============================================================================

test('an empty group produces no violations', () => {
  const s = baseSnapshot(DATE);
  s.groups.push(group(3, 103, 'Lions', [{ ageBandId: 1, count: 0 }]));
  assert.equal(evaluateDay(s).length, 0);
});
