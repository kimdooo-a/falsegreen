// The ordered catalogue of failure families.
import placeholderAsContent from './placeholder-as-content.js';

export const MUTATORS = [placeholderAsContent];

export const byId = (id) => MUTATORS.find((m) => m.id === id);
export const familyNumber = (id) => String(MUTATORS.findIndex((m) => m.id === id) + 1).padStart(2, '0');
