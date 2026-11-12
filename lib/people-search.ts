import type { UserFilters } from "stream-chat";

export function peopleSearchFilter(query: string): UserFilters | null {
  const search = query.trim();
  if (!search) return null;

  return {
    $or: [
      { name: { $autocomplete: search } },
      { username: { $autocomplete: search } },
    ],
  };
}
