// Ertalabki zaryad (morning boost): the scenes the screen can open with.
// Pure, so it is unit-tested; the screen is components/team/TeamMoments.tsx.

export const BOOST_ANIMATIONS = [
  "sun",
  "rocket",
  "confetti",
  "ocean",
  "mountain",
  "daily",
] as const;
export type BoostAnimation = (typeof BOOST_ANIMATIONS)[number];
export type Scene = Exclude<BoostAnimation, "daily">;
const SCENES: Scene[] = ["sun", "rocket", "confetti", "ocean", "mountain"];

export type BoostTexts = { greeting?: string; meaning?: string; goal?: string };

/** "Har kuni boshqa" picks the scene by the day of the year. */
export function sceneFor(animation: string | null | undefined, now = new Date()): Scene {
  if ((SCENES as string[]).includes(animation ?? "")) return animation as Scene;
  const day = Math.floor(now.getTime() / 86_400_000);
  return SCENES[day % SCENES.length]!;
}
