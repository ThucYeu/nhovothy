import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const toiletBowlGeometry = new THREE.CylinderGeometry(0.18, 0.235, 0.42, 24, 2);
const toiletTopGeometry = new THREE.SphereGeometry(1, 32, 20);
const toiletSeatGeometry = new THREE.TorusGeometry(0.22, 0.035, 10, 32);
toiletSeatGeometry.rotateX(Math.PI / 2);
const toiletWaterGeometry = new THREE.CircleGeometry(0.15, 32);
toiletWaterGeometry.rotateX(-Math.PI / 2);
const toiletTankGeometry = new RoundedBoxGeometry(0.68, 0.74, 0.36, 5, 0.055);
const smallCylinderGeometry = new THREE.CylinderGeometry(0.042, 0.042, 0.012, 16);
const handleCylinderGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12);
const handleBallGeometry = new THREE.SphereGeometry(0.035, 12, 8);

export function buildCell(world, side, centerZ, number, floorY = 0, floorIndex = 0) {
  const { addBox, addDoor, addMesh, addInstance, materials } = world;
  const halfWidth = 2;
  const halfDepth = 3;
  const doorWidth = 1.7;

  const localBox = (size, localPosition, material, options) => {
    const position = [
      side * (3.5 + halfDepth - localPosition[2]),
      localPosition[1],
      centerZ + localPosition[0],
    ];
    const boxOptions = {
      collide: false,
      blocker: false,
      ...options,
    };
    if (options?.collide === true && options.blocker === undefined) boxOptions.blocker = true;
    return addBox([size[2], size[1], size[0]], position, material, boxOptions);
  };
  const localMesh = (geometry, localPosition, material, scale = [1, 1, 1], options) => {
    const position = [
      side * (3.5 + halfDepth - localPosition[2]),
      localPosition[1],
      centerZ + localPosition[0],
    ];
    const transformOptions = {
      ...options,
      rotationY: -side * Math.PI / 2,
      scale,
    };
    if (addInstance) return addInstance(geometry, position, material, transformOptions);
    const mesh = addMesh(geometry, position, material, options);
    mesh.rotation.y = transformOptions.rotationY;
    mesh.scale.set(...scale);
    return mesh;
  };

  localBox([4, 0.36, 6], [0, -0.18, 0], materials.floor, { collide: true });
  localBox([4.3, 3.8, 0.3], [0, 1.9, -halfDepth], materials.concrete, { collide: true });
  localBox([0.3, 3.8, 6.3], [-halfWidth, 1.9, 0], materials.concrete, { collide: true });
  localBox([0.3, 3.8, 6.3], [halfWidth, 1.9, 0], materials.concrete, { collide: true });
  localBox([1.15, 3.8, 0.3], [-(doorWidth / 2 + 0.575), 1.9, halfDepth], materials.concrete, { collide: true });
  localBox([1.15, 3.8, 0.3], [doorWidth / 2 + 0.575, 1.9, halfDepth], materials.concrete, { collide: true });
  localBox([doorWidth, 1.05, 0.3], [0, 3.28, halfDepth], materials.concrete, { collide: true });
  localBox([4.3, 0.22, 6.3], [0, 3.82, 0], materials.concrete, { collide: true });
  for (const localZ of [-2.45, -1.25, -0.05, 1.15, 2.35]) {
    localBox([4.15, 0.13, 0.16], [0, 3.64, localZ], materials.gate);
  }
  for (const localX of [-1.76, 1.76]) {
    localBox([0.1, 0.12, 5.7], [localX, 3.57, 0], materials.metal);
  }

  localBox([0.78, 0.055, 0.64], [1.28, 3.55, -0.8], materials.gate, { collide: false });
  for (let slat = 0; slat < 5; slat += 1) {
    localBox([0.66, 0.035, 0.035], [1.28, 3.53, -1.04 + slat * 0.12], materials.metal, { collide: false });
  }

  const bedX = -0.95;
  const bedZ = -1.65;
  const interactables = [];
  for (const level of [0.42, 1.62]) {
    localBox([1.6, 0.14, 2.15], [bedX, level, bedZ], materials.bedding);
    localBox([1.62, 0.1, 2.18], [bedX, level + 0.12, bedZ], materials.sheet);
    for (const x of [bedX - 0.72, bedX + 0.72]) {
      for (const z of [bedZ - 0.94, bedZ + 0.94]) {
        localBox([0.1, 0.84, 0.1], [x, 0.43, z], materials.metal);
      }
    }

    const upperBunk = level > 1;
    const exitPosition = {
      x: side * 6.65,
      y: floorY + 0.86,
      z: centerZ + bedX + (upperBunk ? 0.5 : -0.4),
    };
    interactables.push({
      kind: 'bed',
      number,
      position: exitPosition,
      prompt: `E  NẰM GIƯỜNG TẦNG ${upperBunk ? 'TRÊN' : 'DƯỚI'}`,
      action: {
        animation: 'sleep',
        yaw: -side * Math.PI / 2,
        position: {
          x: side * (3.5 + halfDepth - bedZ),
          y: floorY + level + 0.32,
          z: centerZ + bedX,
        },
        exitPosition,
      },
    });
  }
  localBox([0.32, 0.42, 0.32], [1.43, 0.22, -2.05], materials.porcelain, { visible: false });
  localMesh(toiletBowlGeometry, [1.43, 0.23, -2.05], materials.porcelain);
  localMesh(toiletTopGeometry, [1.43, 0.49, -2.05], materials.porcelain, [0.37, 0.19, 0.48]);

  localMesh(toiletSeatGeometry, [1.43, 0.65, -2.05], materials.porcelain, [1.35, 1, 1.9]);
  localMesh(toiletWaterGeometry, [1.43, 0.655, -2.05], materials.toiletWater, [1.2, 1, 1.7], { blocker: false });

  localMesh(toiletTankGeometry, [1.43, 0.94, -2.56], materials.porcelain);
  localBox([0.58, 0.64, 0.27], [1.43, 0.94, -2.56], materials.porcelain, { visible: false });
  localMesh(smallCylinderGeometry, [1.43, 1.32, -2.56], materials.porcelain);
  localMesh(handleCylinderGeometry, [1.43, 0.68, -2.35], materials.porcelain);
  for (const localX of [1.25, 1.61]) {
    localMesh(handleBallGeometry, [localX, 0.69, -2.25], materials.porcelain);
  }
  localBox([0.54, 0.28, 0.2], [1.55, 0.87, -0.55], materials.porcelain);
  localBox([0.62, 0.6, 0.26], [1.55, 0.32, -0.55], materials.concretePanel);
  localBox([1.2, 0.1, 0.62], [-1.4, 0.85, 0.35], materials.wood);
  localBox([0.1, 0.78, 0.1], [-1.85, 0.4, 0.35], materials.wood);
  localBox([0.1, 0.78, 0.1], [-0.95, 0.4, 0.35], materials.wood);
  localBox([0.72, 0.075, 0.94], [0, 3.56, 1.05], materials.gate, { collide: false });
  localBox([0.5, 0.065, 0.72], [0, 3.5, 1.05], materials.glow, { collide: false, blocker: false });
  for (const localX of [-0.29, 0.29]) {
    localBox([0.035, 0.15, 1.02], [localX, 3.53, 1.05], materials.metal, { collide: false });
  }

  for (let bar = 0; bar < 5; bar += 1) {
    const localX = -1.32 + bar * 0.66;
    localBox([0.07, 0.95, 0.07], [localX, 2.25, -2.93], materials.metal);
  }
  localBox([3.5, 0.08, 0.08], [0, 1.78, -2.93], materials.metal);
  localBox([3.5, 0.08, 0.08], [0, 2.72, -2.93], materials.metal);

  addDoor({ side, centerZ, width: doorWidth, number, floorY, floorIndex });
  interactables.push({
    kind: 'toilet',
    number,
    position: {
      x: side * 7.35,
      y: floorY + 0.86,
      z: centerZ + 1.43,
    },
    prompt: 'E  DÙNG TOILET',
    action: {
      animation: 'toilet',
      yaw: -side * Math.PI / 2,
      position: {
        x: side * 7.35,
        y: floorY + 0.86,
        z: centerZ + 1.43,
      },
      exitPosition: {
        x: side * 7.35,
        y: floorY + 0.86,
        z: centerZ + 1.43,
      },
    },
  });
  return { interactables };
}