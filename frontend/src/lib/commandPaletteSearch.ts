/** Command-palette lead search should run for any query of 2+ characters, including spaces. */
export function shouldSearchLeads(query: string): boolean {
  return query.trim().length >= 2;
}
