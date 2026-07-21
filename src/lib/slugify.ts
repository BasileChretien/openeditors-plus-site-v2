/**
 * Convert an entity name to a URL-safe slug.
 * Examples:
 *   "Springer Nature" -> "springer-nature"
 *   "United States" -> "united-states"
 *   "Biochemistry, Genetics and Molecular Biology" -> "biochemistry-genetics-and-molecular-biology"
 *   "Türkiye" -> "turkiye"
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")    // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "")        // Trim leading/trailing hyphens
    .replace(/-{2,}/g, "-");         // Collapse multiple hyphens
}
