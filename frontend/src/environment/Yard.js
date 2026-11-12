export function buildYard(world) {
  const { addBox, materials } = world;
  addBox([28, 0.36, 20], [0, -0.18, 30], materials.yardFloor);

  for (const side of [-1, 1]) {
    addBox([0.42, 4.4, 20.4], [side * 13.82, 2.2, 30], materials.concrete);
    addBox([0.58, 0.2, 20.5], [side * 13.82, 4.48, 30], materials.concretePanel);
  }

  for (const side of [-1, 1]) {
    addBox([10.25, 4.4, 0.42], [side * 8.875, 2.2, 39.78], materials.concrete);
    addBox([10.4, 0.2, 0.58], [side * 8.875, 4.48, 39.78], materials.concretePanel);
    addBox([10.5, 4.4, 0.42], [side * 8.75, 2.2, 20.22], materials.concrete);
  }
  addBox([7.5, 3.8, 0.42], [0, 1.9, 39.78], materials.gate);

  addBox([0.34, 4.6, 0.34], [10, 2.3, 36], materials.concrete);
  addBox([3.2, 0.3, 3.2], [10, 4.75, 36], materials.concrete);
  addBox([2.5, 0.18, 2.5], [10, 5.1, 36], materials.metal);
  addBox([2.1, 2.1, 2.1], [10, 6.25, 36], materials.windowGlass, { collide: false, blocker: false });
  addBox([3.4, 0.16, 3.4], [10, 7.35, 36], materials.concrete);

  for (const z of [24, 31]) {
    addBox([2.8, 0.12, 0.48], [-6, 0.62, z], materials.wood);
    for (const x of [-7.1, -4.9]) {
      addBox([0.1, 0.62, 0.1], [x, 0.31, z], materials.metal);
    }
  }

  for (const x of [4.8, 5.8, 6.8, 7.8]) {
    addBox([0.1, 1.35, 0.1], [x, 0.68, 27], materials.metal);
  }
  addBox([3.4, 0.1, 0.12], [6.3, 1.34, 27], materials.metal);
  addBox([3.4, 0.1, 0.12], [6.3, 0.55, 27], materials.metal);
  addBox([0.18, 2.9, 0.18], [0, 1.45, 37.5], materials.concrete);
  addBox([0.18, 2.9, 0.18], [1.8, 1.45, 37.5], materials.concrete);
  addBox([2.1, 0.16, 0.18], [0.9, 2.8, 37.5], materials.metal);
}