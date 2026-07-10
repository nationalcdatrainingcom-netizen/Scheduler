'use strict';

// All times in the engine are integers: minutes since midnight.
// Input/output is "HH:MM" (24-hour). This keeps comparisons exact and
// avoids any timezone/Date pitfalls — a schedule is a set of wall-clock
// intervals, not moments in real time.

function toMin(hhmm) {
  if (typeof hhmm === 'number') return hhmm;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Half-open interval overlap: [a0,a1) intersects [b0,b1)
function overlaps(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

// Does [start,end] fully span the slice [t0,t1]?  Because the engine slices
// the day at every assignment/group boundary, any interval either fully
// covers a slice or does not touch it — there are no partial slices.
function spans(start, end, t0, t1) {
  return start <= t0 && end >= t1;
}

module.exports = { toMin, toHHMM, overlaps, spans };'use strict';

// All times in the engine are integers: minutes since midnight.
// Input/output is "HH:MM" (24-hour). This keeps comparisons exact and
// avoids any timezone/Date pitfalls — a schedule is a set of wall-clock
// intervals, not moments in real time.

function toMin(hhmm) {
  if (typeof hhmm === 'number') return hhmm;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Half-open interval overlap: [a0,a1) intersects [b0,b1)
function overlaps(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

// Does [start,end] fully span the slice [t0,t1]?  Because the engine slices
// the day at every assignment/group boundary, any interval either fully
// covers a slice or does not touch it — there are no partial slices.
function spans(start, end, t0, t1) {
  return start <= t0 && end >= t1;
}

module.exports = { toMin, toHHMM, overlaps, spans };
