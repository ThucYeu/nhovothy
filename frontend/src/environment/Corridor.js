import mapLayout from '../../../data/prison-map.json';

export const CELL_CENTERS = mapLayout.corridor.cellCenters;
export const CELL_DOOR_WIDTH = 1.7;

export function buildCorridor(world) {
  const { addBox, materials } = world;
  const wallX = 3.5;
  const startZ = 5;
  const endZ = 20;

  addBox([7, 0.36, endZ - startZ], [0, -0.18, (startZ + endZ) / 2], materials.floor);

  for (const side of [-1, 1]) {
    let wallStart = startZ;
    for (const centerZ of CELL_CENTERS) {
      const gapStart = centerZ - CELL_DOOR_WIDTH / 2;
      const gapEnd = centerZ + CELL_DOOR_WIDTH / 2;
      if (gapStart > wallStart) {
        const depth = gapStart - wallStart;
        addBox([0.34, 3.8, depth], [side * wallX, 1.9, wallStart + depth / 2], materials.concrete);
      }
      addBox([0.38, 1.05, CELL_DOOR_WIDTH], [side * wallX, 3.28, centerZ], materials.concrete);
      addBox([0.48, 2.75, 0.16], [side * wallX, 1.38, centerZ - CELL_DOOR_WIDTH / 2 - 0.13], materials.concretePanel);
      addBox([0.48, 2.75, 0.16], [side * wallX, 1.38, centerZ + CELL_DOOR_WIDTH / 2 + 0.13], materials.concretePanel);
      wallStart = gapEnd;
    }
    if (wallStart < endZ) {
      const depth = endZ - wallStart;
      addBox([0.34, 3.8, depth], [side * wallX, 1.9, wallStart + depth / 2], materials.concrete);
    }
  }

  addBox([7.35, 3.8, 0.38], [0, 1.9, startZ], materials.concrete);
  addBox([7.45, 0.44, 15.4], [0, 3.82, (startZ + endZ) / 2], materials.concrete);

  for (const z of [5.45, 9.65, 13.85, 18.05]) {
    addBox([7.5, 0.16, 0.28], [0, 3.58, z], materials.gate);
    addBox([7.35, 0.035, 0.08], [0, 3.48, z], materials.concretePanel, { collide: false });
  }

  for (const side of [-1, 1]) {
    addBox([0.16, 0.14, 15.1], [side * 2.82, 3.56, (startZ + endZ) / 2], materials.metal);
  }

  for (const z of [9.9, 15.1]) {
    for (const side of [-1, 1]) {
      addBox([0.88, 0.055, 0.74], [side * 2.12, 3.57, z], materials.gate, { collide: false });
      for (let slat = 0; slat < 5; slat += 1) {
        addBox([0.72, 0.035, 0.035], [side * 2.12, 3.53, z - 0.28 + slat * 0.14], materials.metal, { collide: false });
      }
    }
  }

  for (const z of [7.3, 12.2, 17.1]) {
    addBox([0.82, 0.08, 1.78], [0, 3.57, z], materials.gate, { collide: false });
    addBox([0.62, 0.08, 1.55], [0, 3.45, z], materials.light, { collide: false });
    addBox([0.44, 0.08, 1.25], [0, 3.38, z], materials.glow, { collide: false, blocker: false });
    for (const x of [-0.31, 0.31]) {
      addBox([0.035, 0.15, 1.62], [x, 3.48, z], materials.metal, { collide: false });
    }
  }

  for (const side of [-1, 1]) {
    for (let panel = 0; panel < 4; panel += 1) {
      addBox([0.02, 0.75, 0.86], [side * 3.31, 1.9, 6.35 + panel * 3.45], materials.concretePanel, { collide: false });
    }
  }
}