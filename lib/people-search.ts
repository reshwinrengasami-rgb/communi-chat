export function peopleSearchTerm(query: string): string | null {
  const search = query.trim();
  return search.length >= 2 && search.length <= 80 ? search : null;
}

export function peopleSearchPattern(search: string): RegExp {
  return new RegExp(`^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
}
