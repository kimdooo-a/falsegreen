// The ordered catalogue of failure families. The order is the family number (01–12)
// used in reports and in FAILURE_MODES.md.
import emptyInput from './empty-input.js';
import placeholderAsContent from './placeholder-as-content.js';
import occlusion from './occlusion.js';
import overflow from './overflow.js';
import declaredVsRendered from './declared-vs-rendered.js';
import metadataIdentity from './metadata-identity.js';
import staleCache from './stale-cache.js';
import numericTruncation from './numeric-truncation.js';
import deadRegex from './dead-regex.js';
import silentTrack from './silent-track.js';
import selfReferentialCheck from './self-referential-check.js';
import structuredOverridesBody from './structured-overrides-body.js';

export const MUTATORS = [
  emptyInput,
  placeholderAsContent,
  occlusion,
  overflow,
  declaredVsRendered,
  metadataIdentity,
  staleCache,
  numericTruncation,
  deadRegex,
  silentTrack,
  selfReferentialCheck,
  structuredOverridesBody,
];

export const byId = (id) => MUTATORS.find((m) => m.id === id);
export const familyNumber = (id) => String(MUTATORS.findIndex((m) => m.id === id) + 1).padStart(2, '0');
