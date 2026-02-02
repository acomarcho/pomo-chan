export const AMBIENT_SOUNDS = ["fire", "rain", "forest"] as const;
export type AmbientSound = (typeof AMBIENT_SOUNDS)[number];

export const DEFAULT_AMBIENT_VOLUMES: Record<AmbientSound, number> = {
  fire: 0,
  rain: 0,
  forest: 0,
};

export const AMBIENT_SOUND_LABELS: Record<AmbientSound, string> = {
  fire: "Fire",
  rain: "Rain",
  forest: "Forest",
};

export const AMBIENT_SOUND_FILES: Record<AmbientSound, string> = {
  fire: "fire.mp3",
  rain: "rain.mp3",
  forest: "forest.mp3",
};
