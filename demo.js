'use strict';

const { evaluateDay } = require('./src/engine');
const { baseSnapshot } = require('./src/peace-seed');

// Build a full-census Peace day. Each room = one group. Staffed to ratio with a
// lead + aides, opener/closer are leads. Then we inject one call-out.

function fullDay() {
  const s = baseSnapshot('2026-08-31');
  let id = 0;
  const nextStaff = () => ++id;
  const rooms = [
    { gid: 1, space: 101, name: 'Caterpillars', band: 1, kids: 12, adults: 3 },
    { gid: 2, space: 102, name: 'Butterflies', band: 1, kids: 8, adults: 2 },
    { gid: 3, space: 103, name: 'Lions', band: 1, kids: 8, adults: 2 },
    { gid: 4, space: 104, name: 'Dolphins', band: 1, kids: 8, adults: 2 },
    { gid: 5, space: 105, name: 'Kangas', band: 1, kids: 8, adults: 2 },
    { gid: 6, space: 106, name: 'Montessori satellite', band: 1, kids: 12, adults: 3 },
    { gid: 7, space: 201, name: 'Bears', band: 3, kids: 20, adults: 2 },
    { gid: 8, space: 202, name: 'Tigers', band: 3, kids: 20, adults: 2 },
    { gid: 9, space: 203, name: 'Dinos', band: 3, kids: 20, adults: 2 },
    { gid: 10, space: 204, name: 'Penguins', band: 3, kids: 20, adults: 2 },
    { gid: 11, space: 205, name: 'Flamingos', band: 3, kids: 30, adults: 3 },
  ];
  for (const r of rooms) {
    s.groups.push({
      id: r.gid, spaceId: r.space, name: r.name,
      startsAt: '06:30', endsAt: '18:00', origin: 'BASELINE',
      census: [{ ageBandId: r.band, count: r.kids }],
    });
    const leadS = nextStaff();
    s.credentials.push({ staffId: leadS, credential: 'LEAD_CAREGIVER', expiresOn: null });
    s.assignments.push({ groupId: r.gid, staffId: leadS, startsAt: '06:30', endsAt: '18:00', kind: 'TEACHING' });
    for (let i = 1; i < r.adults; i++) {
      s.assignments.push({ groupId: r.gid, staffId: nextStaff(), startsAt: '06:30', endsAt: '18:00', kind: 'TEACHING' });
    }
  }
  return s;
}

function report(label, snapshot) {
  const v = evaluateDay(snapshot);
  const legal = v.filter((x) => x.severity === 'LEGAL');
  const policy = v.filter((x) => x.severity === 'POLICY');
  console.log(`\n=== ${label} ===`);
  if (legal.length === 0) {
    console.log('  STATUS: IN RATIO — no legal violations');
  } else {
    console.log(`  STATUS: ${legal.length} GAP(S)`);
    for (const x of legal) console.log(`   [LEGAL]  ${x.interval[0]}-${x.interval[1]}  ${x.detail}`);
  }
  for (const x of policy) console.log(`   [policy] ${x.interval[0]}-${x.interval[1]}  ${x.detail}`);
}

// 1. Full census, correctly staffed.
report('Morning pre-flight, full census', fullDay());

// 2. A Bears teacher calls out at 09:14. Truncate her assignment.
const co = fullDay();
const bearsTeacher = co.assignments.find((a) => a.groupId === 7);
bearsTeacher.endsAt = '09:14'; // she leaves
report('After call-out: Bears loses an adult at 09:14', co);

// 3. Director's fix: pull a credentialed admin onto Bears for the rest of the day.
const fixed = fullDay();
const bt = fixed.assignments.find((a) => a.groupId === 7);
bt.endsAt = '09:14';
fixed.assignments.push({ groupId: 7, staffId: 999, startsAt: '09:14', endsAt: '18:00', kind: 'TEACHING' });
fixed.credentials.push({ staffId: 999, credential: 'LEAD_CAREGIVER', expiresOn: null });
report('After remediation: admin covers Bears from 09:14', fixed);
