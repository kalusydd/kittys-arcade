// The only place a game is registered. Order sets the jukebox order.
type GameBase = {
  slug: string;
  title: string;
  // Used where the full title is too long, like the play button.
  shortTitle: string;
  description: string;
  // Jukebox selection code, like A1.
  code: string;
};

export type PlayableGame = GameBase & {
  comingSoon?: false;
  // Served from public/, shown full screen in an iframe.
  gamePath: string;
  // Shown on the record label and used as the link preview image.
  cover: string;
  needsKeyboard?: boolean;
};

export type ComingSoonGame = GameBase & {
  comingSoon: true;
  // Placeholder labels are drawn in CSS from this hue (0 to 360).
  labelHue: number;
};

export type Game = PlayableGame | ComingSoonGame;

export const games: Game[] = [
  {
    slug: "planet-13",
    title: "Planet 13: Interdimensional Escape",
    shortTitle: "Planet 13",
    description:
      "A Halloween platformer from the Intergalactic Archive. Hop across strange worlds, grab each one's Dimensional Artifact and reach the exit portal before the locals get you.",
    code: "A1",
    gamePath: "/games/planet-13/index.html",
    cover: "/games/planet-13/cover.jpg",
    needsKeyboard: true,
  },

  // Placeholder records start here. Delete this block when real games arrive.
  {
    slug: "alley-cat-after-dark",
    title: "Alley Cat After Dark",
    shortTitle: "Alley Cat After Dark",
    description: "Rooftop chases, bins to topple and one very smug moon.",
    code: "A2",
    comingSoon: true,
    labelHue: 350,
  },
  {
    slug: "disco-dino",
    title: "Disco Dino",
    shortTitle: "Disco Dino",
    description: "A tiny dinosaur with big moves and a dance floor that keeps lighting up.",
    code: "A3",
    comingSoon: true,
    labelHue: 140,
  },
  {
    slug: "moon-bowl-a-rama",
    title: "Moon Bowl-a-Rama",
    shortTitle: "Moon Bowl-a-Rama",
    description: "Ten-pin bowling in low gravity. Strikes take a while to land.",
    code: "A4",
    comingSoon: true,
    labelHue: 210,
  },
  {
    slug: "tin-can-rally",
    title: "Tin Can Rally",
    shortTitle: "Tin Can Rally",
    description: "Homemade go-karts, one hill, no brakes.",
    code: "A5",
    comingSoon: true,
    labelHue: 30,
  },
  {
    slug: "haunted-hi-fi",
    title: "Haunted Hi-Fi",
    shortTitle: "Haunted Hi-Fi",
    description: "Something is playing records in the attic. Find out what.",
    code: "A6",
    comingSoon: true,
    labelHue: 280,
  },
  // Placeholder records end here.
];

export function findPlayableGame(slug: string): PlayableGame | undefined {
  const game = games.find((g) => g.slug === slug);
  return game && !game.comingSoon ? game : undefined;
}

export const playableGames = games.filter((g): g is PlayableGame => !g.comingSoon);
