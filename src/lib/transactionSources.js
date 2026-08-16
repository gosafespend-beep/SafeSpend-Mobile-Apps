import { CAPTURE_METHODS, captureMethodsFor } from './regions';

// Pluggable "transaction source" abstraction — the seam that lets SafeSpend add
// new ways of getting transactions in (SMS parsing, bank aggregation, email
// receipts) per region without touching the core. Today only `manual` and
// `receipt` are implemented; `sms`/`aggregator`/`email` are registered as
// coming-soon so the region UI and the roadmap stay in sync.
//
// A future real source replaces its registry entry with a richer object, e.g.:
//   registerSource({ id: 'sms', ...CAPTURE_METHODS.sms, isImplemented: true,
//                    async ingest(ctx) { /* parse configured senders → drafts */ } })

const REGISTRY = {};

export function registerSource(source) { REGISTRY[source.id] = source; }
export function getSource(id) { return REGISTRY[id] || null; }
export function allSources() { return Object.values(REGISTRY); }

/** Sources available (or coming) for a country, in that region's priority order. */
export function sourcesForRegion(country) {
  return captureMethodsFor(country).map((m) => REGISTRY[m.id]).filter(Boolean);
}

// Seed the registry from the capability catalog. Real implementations override
// these entries later.
Object.values(CAPTURE_METHODS).forEach((m) => {
  registerSource({ ...m, isImplemented: m.status === 'available' });
});
