export const artisticTreeVariants = ["sparse", "balanced", "golden"] as const;

export type ArtisticTreeVariant = (typeof artisticTreeVariants)[number];

export function chooseLoadingTreeVariant(
  previous: ArtisticTreeVariant | null,
  randomValue = Math.random(),
): ArtisticTreeVariant {
  const choices = previous
    ? artisticTreeVariants.filter((variant) => variant !== previous)
    : [...artisticTreeVariants];
  const boundedRandom = Math.min(Math.max(randomValue, 0), 0.9999999999999999);

  return choices[Math.floor(boundedRandom * choices.length)] ?? artisticTreeVariants[0];
}

export function isArtisticTreeVariant(value: string | null): value is ArtisticTreeVariant {
  return artisticTreeVariants.includes(value as ArtisticTreeVariant);
}
