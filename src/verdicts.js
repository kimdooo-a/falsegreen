// The four verdicts. INCONCLUSIVE is a first-class answer, not an error:
// a harness that reports its own no-ops as findings commits the failure it hunts.
export const CAUGHT = 'CAUGHT';
export const FALSE_GREEN = 'FALSE_GREEN';
export const INCONCLUSIVE = 'INCONCLUSIVE';
export const NOT_APPLICABLE = 'NOT_APPLICABLE';

export const VERDICTS = [CAUGHT, FALSE_GREEN, INCONCLUSIVE, NOT_APPLICABLE];

export const LABEL = {
  [CAUGHT]: 'CAUGHT',
  [FALSE_GREEN]: 'FALSE GREEN',
  [INCONCLUSIVE]: 'INCONCLUSIVE',
  [NOT_APPLICABLE]: 'n/a',
};
