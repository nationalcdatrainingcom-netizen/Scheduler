'use strict';

// Reference configuration for Peace Boulevard, post-consolidation.
// This is data, not logic. Adding school-age in 2027 is an edit here, never a
// code change.

const ageBands = [
  { id: 1, code: 'INFANT_TODDLER', label: 'Under 2½', sortOrder: 10 },
  { id: 2, code: 'AGE_2_5', label: '2½ years', sortOrder: 20 },
  { id: 3, code: 'AGE_3', label: '3 years', sortOrder: 30 },
  { id: 4, code: 'AGE_4_5', label: '4–5 years', sortOrder: 40 },
  { id: 5, code: 'SCHOOL_AGE', label: 'School age', sortOrder: 50 },
];

// Michigan ratios. Versioned by effective date so history re-evaluates correctly.
const ratioRules = [
  { ageBandId: 1, childrenPerAdult: 4, effectiveFrom: '2026-01-01', effectiveTo: null },
  { ageBandId: 2, childrenPerAdult: 8, effectiveFrom: '2026-01-01', effectiveTo: null },
  { ageBandId: 3, childrenPerAdult: 10, effectiveFrom: '2026-01-01', effectiveTo: null },
  { ageBandId: 4, childrenPerAdult: 12, effectiveFrom: '2026-01-01', effectiveTo: null },
  { ageBandId: 5, childrenPerAdult: 18, effectiveFrom: '2026-01-01', effectiveTo: null },
];

// Group-size caps depend on SETTING. Indoors they bind; outdoors, ratio alone
// governs (playgrounds are sized to hold the whole age group).
const groupSizeCaps = [
  { ageBandId: 1, setting: 'INDOOR', maxChildren: 12 },
  { ageBandId: 1, setting: 'OUTDOOR', maxChildren: null },
  { ageBandId: 3, setting: 'INDOOR', maxChildren: 36 },
  { ageBandId: 3, setting: 'OUTDOOR', maxChildren: null },
];

// Spaces. physicalCapacity is the number of bodies the room actually holds;
// null = unbounded by size (the playgrounds). The gym holds 22 preschoolers by
// square footage; the toddler limit of 12 comes from the group-size cap above.
const spaces = [
  { id: 101, name: 'Caterpillars room', kind: 'CLASSROOM', physicalCapacity: 12 },
  { id: 102, name: 'Butterflies room', kind: 'CLASSROOM', physicalCapacity: 8 },
  { id: 103, name: 'Lions room', kind: 'CLASSROOM', physicalCapacity: 8 },
  { id: 104, name: 'Dolphins room', kind: 'CLASSROOM', physicalCapacity: 8 },
  { id: 105, name: 'Kangas room', kind: 'CLASSROOM', physicalCapacity: 8 },
  { id: 106, name: 'Montessori satellite room', kind: 'CLASSROOM', physicalCapacity: 12 },
  { id: 201, name: 'Bears room', kind: 'CLASSROOM', physicalCapacity: 20 },
  { id: 202, name: 'Tigers room', kind: 'CLASSROOM', physicalCapacity: 20 },
  { id: 203, name: 'Dinos room', kind: 'CLASSROOM', physicalCapacity: 20 },
  { id: 204, name: 'Penguins room', kind: 'CLASSROOM', physicalCapacity: 20 },
  { id: 205, name: 'Flamingos room', kind: 'CLASSROOM', physicalCapacity: 30 },
  { id: 301, name: 'Gym', kind: 'GYM', physicalCapacity: 22 },
  { id: 401, name: 'Infant/Toddler playground', kind: 'OUTDOOR', physicalCapacity: null },
  { id: 402, name: 'Preschool playground', kind: 'OUTDOOR', physicalCapacity: null },
  { id: 403, name: 'School-age playground', kind: 'OUTDOOR', physicalCapacity: null },
];

// The six under-2½ rooms and five preschool (3-year-old) rooms.
const rooms = [
  { id: 1, name: 'Caterpillars', spaceId: 101, bandId: 1, licensedCapacity: 12 },
  { id: 2, name: 'Butterflies', spaceId: 102, bandId: 1, licensedCapacity: 8 },
  { id: 3, name: 'Lions', spaceId: 103, bandId: 1, licensedCapacity: 8 },
  { id: 4, name: 'Dolphins', spaceId: 104, bandId: 1, licensedCapacity: 8 },
  { id: 5, name: 'Kangas', spaceId: 105, bandId: 1, licensedCapacity: 8 },
  { id: 6, name: 'Montessori satellite', spaceId: 106, bandId: 1, licensedCapacity: 12 },
  { id: 7, name: 'Bears', spaceId: 201, bandId: 3, licensedCapacity: 20 },
  { id: 8, name: 'Tigers', spaceId: 202, bandId: 3, licensedCapacity: 20 },
  { id: 9, name: 'Dinos', spaceId: 203, bandId: 3, licensedCapacity: 20 },
  { id: 10, name: 'Penguins', spaceId: 204, bandId: 3, licensedCapacity: 20 },
  { id: 11, name: 'Flamingos', spaceId: 205, bandId: 3, licensedCapacity: 30 },
];

// TCC's own rule: under-2½ children are not combined with preschoolers.
// Michigan would ALLOW this if staffed to the youngest ratio, so this is POLICY
// (overridable with a logged reason), not LEGAL. Confirm severity with the
// licensing consultant if you want it treated as a hard block.
const separationPolicy = [
  { bandA: 1, bandB: 3, severity: 'POLICY', rationale: 'TCC: no under-2½ with preschool' },
  { bandA: 1, bandB: 4, severity: 'POLICY', rationale: 'TCC: no under-2½ with preschool' },
  { bandA: 1, bandB: 5, severity: 'POLICY', rationale: 'TCC: no under-2½ with school age' },
];

// A reliever covering a lead's protected break need not hold the lead
// credential. Flip to 'CONTINUOUS' only if licensing requires a lead present
// every instant — that materially tightens the break math.
const config = { leadPresence: 'BREAK_EXEMPT' };

function baseSnapshot(date) {
  return {
    date,
    ageBands,
    ratioRules,
    groupSizeCaps,
    spaces,
    separationPolicy,
    config,
    staff: [],
    credentials: [],
    groups: [],
    assignments: [],
  };
}

module.exports = {
  ageBands,
  ratioRules,
  groupSizeCaps,
  spaces,
  rooms,
  separationPolicy,
  config,
  baseSnapshot,
};
