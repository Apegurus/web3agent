export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("Canonical values cannot contain non-finite numbers");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "bigint":
      return JSON.stringify(value.toString());
    case "object":
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      return `{${Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(",")}}`;
    default:
      throw new Error("Canonical values cannot contain undefined, functions, or symbols");
  }
}
