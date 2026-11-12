import * as THREE from 'three';
import mapLayout from '../../../data/prison-map.json';

const STAIR_TREAD = 0.42;
const STEPS_PER_FLIGHT = mapLayout.stairs.stepsPerFlight;
const STAIR_RISE = mapLayout.floorHeight / (2 * STEPS_PER_FLIGHT);

export function buildStairwell(world) {
  const { addBox, addMesh, materials } = world;
  const totalHeight = mapLayout.floorHeight * mapLayout.floorCount;
  const stairLength = STEPS_PER_FLIGHT * STAIR_TREAD;
  const stairCenterX = (mapLayout.stairs.minX + mapLayout.stairs.maxX) / 2;
  const landingWidth = mapLayout.stairs.maxX - mapLayout.stairs.minX;
  const wallThickness = 0.24;
  const wallStartZ = mapLayout.stairs.startZ - 0.65;
  const wallEndZ = mapLayout.stairs.endZ + 1.4;
  const wallDepth = wallEndZ - wallStartZ;
  const wallCenterZ = (wallStartZ + wallEndZ) / 2;

  addBox(
    [wallThickness, totalHeight, wallDepth],
    [mapLayout.stairs.minX - wallThickness / 2, totalHeight / 2, wallCenterZ],
    materials.concrete,
  );
  addBox(
    [wallThickness, totalHeight, wallDepth],
    [mapLayout.stairs.maxX + wallThickness / 2, totalHeight / 2, wallCenterZ],
    materials.concrete,
  );
  addBox(
    [landingWidth + wallThickness * 2, totalHeight, wallThickness],
    [stairCenterX, totalHeight / 2, mapLayout.stairs.endZ + 1.28],
    materials.concrete,
  );

  for (let floor = 0; floor < mapLayout.floorCount - 1; floor += 1) {
    const floorY = floor * mapLayout.floorHeight;
    for (let step = 0; step < STEPS_PER_FLIGHT; step += 1) {
      const rise = (step + 1) * STAIR_RISE;
      const firstZ = mapLayout.stairs.startZ + (step + 0.5) * STAIR_TREAD;
      const secondZ = mapLayout.stairs.endZ - (step + 0.5) * STAIR_TREAD;

      addBox(
        [mapLayout.stairs.flightWidth, STAIR_RISE, STAIR_TREAD + 0.04],
        [mapLayout.stairs.firstCenterX, floorY + rise - STAIR_RISE / 2, firstZ],
        materials.floor,
      );
      addBox(
        [mapLayout.stairs.flightWidth, STAIR_RISE, STAIR_TREAD + 0.04],
        [
          mapLayout.stairs.secondCenterX,
          floorY + mapLayout.floorHeight / 2 + rise - STAIR_RISE / 2,
          secondZ,
        ],
        materials.floor,
      );
    }

    addBox(
      [landingWidth, 0.18, 0.58],
      [
        stairCenterX,
        floorY + mapLayout.floorHeight / 2 - 0.09,
        mapLayout.stairs.endZ + 0.06,
      ],
      materials.floor,
    );
    addBox(
      [landingWidth, 0.18, 0.7],
      [stairCenterX, floorY - 0.09, mapLayout.stairs.startZ - 0.25],
      materials.floor,
    );

    for (const [centerX, startZ, direction, baseY] of [
      [mapLayout.stairs.firstCenterX, mapLayout.stairs.startZ, 1, floorY],
      [mapLayout.stairs.secondCenterX, mapLayout.stairs.endZ, -1, floorY + mapLayout.floorHeight / 2],
    ]) {
      for (const side of [-1, 1]) {
        const railX = centerX + side * (mapLayout.stairs.flightWidth / 2 - 0.04);
        for (let post = 0; post <= STEPS_PER_FLIGHT; post += 2) {
          const treadY = baseY + post * STAIR_RISE;
          addBox(
            [0.055, 0.9, 0.055],
            [railX, treadY + 0.45, startZ + direction * post * STAIR_TREAD],
            materials.metal,
            { collide: false, blocker: false },
          );
        }
        const handrail = addMesh(
          new THREE.BoxGeometry(0.07, 0.07, stairLength),
          [railX, baseY + mapLayout.floorHeight / 4 + 0.9, startZ + direction * stairLength / 2],
          materials.metal,
          { blocker: false },
        );
        handrail.rotation.x = direction * Math.atan2(mapLayout.floorHeight / 2, stairLength);
      }
    }
  }
}
