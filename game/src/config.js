// Velora Heat — central tuning. Every number the game uses lives here so the
// other modules read from one place and never hard-code a tuning value twice.
// All distances are metres, all speeds are metres per second, all times seconds.

export const CONFIG = {
  // City layout: a regular grid of blocks separated by roads.
  city: {
    blocks: 4, // blocks per side (roads run between them and around the edge)
    blockSize: 42, // side of one city block, metres
    roadWidth: 11, // width of a road, metres
    sidewalkWidth: 3, // pavement strip on each side of a road
    buildingGap: 4, // gap between neighbouring buildings inside a block
    maxBuildingHeight: 30,
    minBuildingHeight: 8,
  },

  // The player on foot.
  player: {
    walkSpeed: 4.2,
    runSpeed: 7.5,
    turnSpeed: 9.0, // radians per second of heading change
    radius: 0.45, // collision radius
    height: 1.8,
  },

  // Cars: acceleration, braking and top speeds.
  car: {
    accel: 14,
    brake: 26,
    reverseAccel: 8,
    reverseTop: 9,
    topSpeed: 34, // about 122 km/h
    policeTopSpeed: 38,
    turnRate: 2.1, // steering response, radians per second at full lock
    grip: 6.0, // how fast sideways slide dies out
    handbrakeGrip: 1.2,
    radius: 1.3,
  },

  // Traffic and pedestrians.
  traffic: {
    count: 14,
    cruiseSpeed: 9,
    minGap: 7, // metres kept to the car ahead
    despawnDistance: 170,
    spawnDistance: 120,
  },
  pedestrians: {
    count: 18,
    walkSpeed: 1.4,
    despawnDistance: 150,
    spawnDistance: 100,
  },

  // Wanted level and police.
  police: {
    maxWanted: 5,
    carsPerStar: 1, // pursuit cars on the road per wanted star
    escapeSeconds: 9, // hidden from all police for this long to lose one star
    searchRadius: 90, // police give up beyond this distance from the player
    ramDamage: 6,
  },

  // Missions and money.
  missions: {
    rewards: [120, 220, 350, 900], // dollars per mission, in order
    startMoney: 40,
    startHealth: 100,
    garageDebt: 1500, // the story goal: earn this much to clear Nia's garage
  },

  // The garage: where the story starts and where the gold car must end up.
  garage: {
    x: 0,
    z: 96,
    doorWidth: 7,
  },

  // Camera.
  camera: {
    onFootDistance: 7,
    onFootHeight: 3.4,
    driveDistance: 10,
    driveHeight: 4.2,
    lookSpeed: 0.0035,
    fov: 62,
    near: 0.1,
    far: 900,
  },

  // Golden-hour palette: ink, cream, coral, gold, teal.
  palette: {
    ink: 0x141a20,
    cream: 0xf6ecd6,
    coral: 0xe2604a,
    gold: 0xf0b93c,
    teal: 0x2f8f8a,
    skyTop: 0x7fb2e8,
    skyHorizon: 0xffd9a3,
    sun: 0xffd9a0,
    sunGround: 0x8a6a4a,
    asphalt: 0x2e3138,
    sidewalk: 0x9a938a,
    kerb: 0x6f6a62,
  },

  // Rendering budget.
  render: {
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadowExtent: 150, // half-width of the sun shadow frustum, metres
    fogNear: 220,
    fogFar: 700,
  },
};
