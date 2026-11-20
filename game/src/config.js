// Velora Heat — central tuning. Every module reads its numbers from here;
// no tuning value is hard-coded anywhere else.
export const CONFIG = {
  // City layout
  citySize: 640,          // playable square, metres, centred on origin
  blockSize: 64,          // one city block edge, metres
  roadWidth: 12,          // road surface width, metres
  sidewalkWidth: 4,       // pavement strip beside each road
  blockGap: 76,           // block pitch = blockSize + roadWidth

  // Player on foot
  walkSpeed: 4.2,         // m/s
  runSpeed: 8.0,          // m/s while Shift held
  turnSpeed: 6.5,         // rad/s

  // Cars
  carTopSpeed: 38,        // m/s, fastest road car
  carAccel: 14,           // m/s^2
  carBrake: 26,           // m/s^2
  carReverseSpeed: 10,    // m/s
  carSteer: 1.9,          // rad/s at full lock, scaled by speed
  policeTopSpeed: 44,     // m/s, pursuit cars are faster

  // Wanted / police
  wantedMax: 5,
  wantedEscapeTime: 12,   // seconds out of the search area to drop a star
  wantedSearchRadius: 90, // metres, police search circle around last seen

  // Missions
  missionRewards: [250, 400, 600, 1500], // money per mission, in order
  startingMoney: 120,
  startingHealth: 100,
  maxHealth: 100,

  // Crowd — busy GTA streets (r15: raised from 14 peds / 12 traffic cars)
  pedestrians: { count: 36 }, // sidewalk walkers near the player
  traffic: { count: 30 },     // AI cars on the road network

  // Palette — golden hour over a coastal city
  palette: {
    ink: 0x1d2430,     // dark UI / shadows
    cream: 0xf6ead8,   // warm light
    coral: 0xff6b5e,   // accent, wanted stars
    gold: 0xffb830,    // money, the Aurelio GT
    teal: 0x2fb3a3,     // sea / objective marker
  },

  // Sky / light
  sunElevation: 18,       // degrees above horizon, golden hour
  sunAzimuth: 235,        // degrees, sun sits low over the sea
  fogNear: 180,
  fogFar: 620,
};
