export function applyMetadataFormat(format: string, values: readonly string[]) {
  return format.replace(/[1-5]/g, (token) => values[Number(token) - 1] || "");
}
