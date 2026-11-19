// Velora Heat — shared tuning, layout and palette.
// Every number the game balances on lives here so systems agree with each other.
export const GAME_NAME = 'Velora Heat';
export const SAVE_KEY = 'velora-heat-save-v1';

// ---- city layout (metres) ----
// Streets run on a 52 m pitch: 40 m blocks, 12 m roads. 8 streets each way.
// Block centres sit halfway between neighbouring streets.
export const PITCH = 52;
export const BLOCK = 40;
export const ROAD = 12;
export const STREETS = [-182, -130, -78, -26, 26, 78, 130, 182];
export const BLOCKS = [-156, -104, -52, 0, 52, 104, 156];
export const CITY_HALF = 188; // playable clamp, x and z
// The south edge (positive z) is a beach: sand, then open water.
export const BEACH_START = 190;
export const WATER_START = 234;
export const WATER_END = 560;

// ---- palette: a sun-soaked coastal city at golden hour ----
export const PALETTE = {
  skyTop: 0x2f4d7d,
  skyMid: 0x8f7ba8,
  skyHorizon: 0xffb36b,
  sun: 0xffdca8,
  fog: 0xf0a56e,
  sunLight: 0xffcf99,
  hemiSky: 0xffc98f,
  hemiGround: 0x6b4a3a,
  asphalt: 0x35383d,
  asphaltWarm: 0x3d3833,
  sidewalk: 0xbfae90,
  curb: 0x8f8271,
  sand: 0xe8cf9e,
  water: 0x2e7f8f,
  waterDeep: 0x1d5a6b,
  grass: 0x7d9b5a,
  // building plaster, warm and varied
  plaster: [0xf2e3c6, 0xd97b57, 0xe8c98f, 0xe2604a, 0x3f8f8a, 0xd9a441, 0xf6f1e6, 0xe8a798, 0x9db38a, 0xc96f4a],
  glassDay: 0x2c4a5e,
  glassLit: 0xffc46b,
  // cars
  carPaint: [0xc23b2e, 0xf2b705, 0x2f8f8a, 0xe8e4da, 0x2b3a55, 0xe2703a, 0x6b4a8a, 0x3a6b2f],
  policeWhite: 0xf0ede4,
  policeBlack: 0x1c2126,
  // characters
  skin: [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0],
  shirt: [0xe2604a, 0x2f8f8a, 0xf2b705, 0x6b4a8a, 0xe8e4da, 0x3a6b2f, 0x2b3a55],
  pants: [0x2b3a55, 0x35383d, 0x6b5a3a, 0x4a4a52],
};

// ---- player ----
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.6,
  accel: 34,
  radius: 0.55,
  height: 1.8,
  health: 100,
  punchRange: 1.9,
  punchArc: 1.1, // radians, half-angle
  punchDamage: 22,
  punchCooldown: 0.42,
  comboWindow: 0.9,
};

// ---- driving (arcade) ----
export const CAR = {
  maxSpeed: 38, // m/s ~ 137 km/h
  maxReverse: 10,
  accel: 16,
  brake: 30,
  drag: 0.55,
  steerMax: 0.55, // radians at low speed
  steerSpeed: 2.6,
  grip: 8.5,
  handbrakeGrip: 2.2,
  length: 4.4,
  width: 1.9,
  wheelBase: 2.7,
};

// ---- traffic ----
// Denser than the first pass: 16 cars and 18 walkers keep the streets
// feeling lived-in in screenshots, still well inside the render budget.
export const TRAFFIC = {
  count: 16,
  speedMin: 7,
  speedMax: 12,
  followGap: 9,
  despawnDist: 260,
  spawnDist: 150,
};

// ---- pedestrians ----
export const PEDS = {
  count: 18,
  walkMin: 1.0,
  walkMax: 1.8,
  fleeSpeed: 4.2,
  despawnDist: 240,
  spawnDist: 120,
};

// ---- wanted / police ----
export const WANTED = {
  maxStars: 5,
  heatPerStar: 20,
  decayDelay: 6, // seconds unseen before heat decays
  decayRate: 3.5, // heat per second while unseen
  bustTime: 2.2, // seconds a cop must be close on foot to bust you
  policePerStar: [0, 2, 3, 4, 5, 6],
  policeSpeed: 15.5,
  ramDamage: 9,
};

// ---- missions ----
export const MISSIONS = [
  {
    id: 'fare',
    title: 'First Fare',
    giver: 'Mrs. Alvarez',
    brief: 'A fare is waiting at the promenade. Pick her up in any car and drive her to the gallery on Calle Verde. Drive smooth — she tips for a calm ride.',
    reward: 120,
  },
  {
    id: 'package',
    title: 'The Package',
    giver: 'Nia',
    brief: 'Nia needs a package carried from the café on the marina to the garage — on foot, through the crowd. A rival crew heard about it. Keep moving, don’t get cornered.',
    reward: 220,
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    giver: 'Nia',
    brief: 'The pickup went loud and the whole department is on you. Three stars. Get to the safehouse behind the market without getting busted.',
    reward: 300,
  },
  {
    id: 'score',
    title: 'The Big Score',
    giver: 'Sal',
    brief: 'Sal’s buyer wants the Aurelio GT parked at the marina — a one-of-one coupe in sunset gold. Take it, lose whoever follows, and bring it to the garage. This one clears the debt.',
    reward: 650,
  },
];
