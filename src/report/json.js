// Machine-readable report: one JSON document, stable field names.
export function toJson(result, version) {
  return JSON.stringify(
    {
      tool: 'falsegreen',
      version,
      artifact: result.artifact,
      guard: result.guard,
      baseline: result.baseline,
      summary: result.summary,
      results: result.results,
    },
    null,
    2,
  );
}
