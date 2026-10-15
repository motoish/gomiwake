import { date, httpsUrl, slug, validText } from "./calendar.ts";

/** Classification metadata only; never includes districts or collection dates. */
export interface CategoryProfile {
  municipality: { id: string; name: string };
  sourceUrl: string;
  reviewedAt: string;
  categories: Record<string, string>;
}

export function validateCategoryProfiles(
  input: unknown,
): asserts input is CategoryProfile[] {
  if (!Array.isArray(input))
    throw new Error("Expected category profiles array");
  const seen = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected category profile object");
    const profile = value as CategoryProfile;
    slug(profile.municipality?.id);
    validText(profile.municipality?.name);
    httpsUrl(profile.sourceUrl);
    date(profile.reviewedAt);
    if (seen.has(profile.municipality.id))
      throw new Error(
        `Conflicting category profile: ${profile.municipality.id}`,
      );
    seen.add(profile.municipality.id);
    if (
      !profile.categories ||
      typeof profile.categories !== "object" ||
      Array.isArray(profile.categories) ||
      !Object.keys(profile.categories).length
    )
      throw new Error("Missing category definitions");
    for (const [id, label] of Object.entries(profile.categories)) {
      slug(id);
      validText(label);
    }
  }
}
