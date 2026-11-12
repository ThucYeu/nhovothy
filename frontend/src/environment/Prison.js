import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import mapLayout from '../../../data/prison-map.json';
import { buildCell } from './Cell.js';
import { buildCorridor, CELL_CENTERS } from './Corridor.js';
import { buildStairwell } from './Stairwell.js';
import { buildYard } from './Yard.js';
import { Elevator } from './Elevator.js';

function makeConcreteTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 1100; index += 1) {
    const shade = Math.random() > 0.5 ? 255 : 0;
    context.globalAlpha = Math.random() * 0.11;
    context.fillStyle = `rgb(${shade},${shade},${shade})`;
    context.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function makeDoorGeometry(width, side) {
  const bars = [
    [[0.12, 2.55, 0.1], [0, 1.28, 0.04]],
    [[0.12, 2.55, 0.1], [0, 1.28, width - 0.04]],
    [[0.12, 0.12, width], [0, 2.53, width / 2]],
    [[0.12, 0.12, width], [0, 0.08, width / 2]],
    [[0.13, 0.08, width], [0, 1.22, width / 2]],
    ...Array.from({ length: 5 }, (_, index) => [
      [0.055, 2.42, 0.055],
      [0, 1.28, (width / 6) * (index + 1)],
    ]),
    [[0.18, 0.08, 0.04], [-side * 0.11, 1.25, width - 0.18]],
  ];
  const pieces = bars.map(([size, position]) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...position);
    return geometry;
  });
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

function createFloorBuilder(builder, floorY, floorIndex) {
  return {
    ...builder,
    addBox(size, position, material, options) {
      return builder.addBox(
        size,
        [position[0], position[1] + floorY, position[2]],
        material,
        options,
      );
    },
    addMesh(geometry, position, material, options) {
      return builder.addMesh(
        geometry,
        [position[0], position[1] + floorY, position[2]],
        material,
        options,
      );
    },
    addInstance(geometry, position, material, options) {
      return builder.addInstance(
        geometry,
        [position[0], position[1] + floorY, position[2]],
        material,
        options,
      );
    },
    addDoor(door) {
      return builder.addDoor({ ...door, floorY, floorIndex });
    },
  };
}

function addFloorSign(scene, floorIndex, floorY) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 180;
  const context = canvas.getContext('2d');
  const accent = mapLayout.floorAccents[floorIndex];
  context.fillStyle = '#1f2925';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 16, canvas.height);
  context.fillRect(16, 0, canvas.width - 16, 6);
  context.fillRect(16, canvas.height - 6, canvas.width - 16, 6);
  context.fillStyle = '#f3edda';
  context.font = 'bold 42px sans-serif';
  context.fillText(
    `TẦNG ${String(floorIndex + 1).padStart(2, '0')} / ${String(mapLayout.floorCount).padStart(2, '0')}`,
    42,
    66,
  );
  context.font = 'bold 33px sans-serif';
  context.fillStyle = accent;
  context.fillText(mapLayout.floorNames[floorIndex], 42, 130, 560);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: accent,
    emissiveIntensity: 0.28,
    roughness: 0.75,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.78), signMaterial);
  sign.position.set(0, floorY + 2.92, 5.205);
  scene.add(sign);
  return sign;
}

function buildFloorLandmark(builder, floorIndex) {
  const { addBox, materials } = builder;
  const options = { collide: false, blocker: false };
  const x = 2.78;
  const z = 21.75;
  const styles = [
    [[1.1, 0.75, 0.55], materials.wood, [0, 0.5, 0]],
    [[1.05, 0.38, 0.48], materials.wood, [0, 0.31, 0]],
    [[0.72, 1.35, 0.5], materials.metal, [0, 0.68, 0]],
    [[1.2, 0.62, 0.58], materials.concretePanel, [0, 0.38, 0]],
    [[1.05, 0.72, 0.56], materials.wood, [0, 0.44, 0]],
    [[0.55, 1.55, 0.48], materials.gate, [0, 0.78, 0]],
    [[0.92, 1.25, 0.54], materials.metal, [0, 0.63, 0]],
    [[0.7, 1.48, 0.48], materials.gate, [0, 0.74, 0]],
    [[1.3, 0.68, 0.64], materials.wood, [0, 0.42, 0]],
  ];
  const [size, material, position] = styles[floorIndex];
  addBox(size, [x + position[0], position[1], z + position[2]], material, options);
  if ([0, 3, 4, 8].includes(floorIndex)) {
    for (const legX of [-0.42, 0.42]) {
      for (const legZ of [-0.18, 0.18]) {
        addBox([0.08, 0.34, 0.08], [x + legX, 0.17, z + legZ], materials.metal, options);
      }
    }
  }
}

export function buildPrison(scene, physics) {
  const concreteTexture = makeConcreteTexture('#7b807b');
  const floorTexture = makeConcreteTexture('#565c59');
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture, color: '#c4c0b5', roughness: 0.96 }),
    concretePanel: new THREE.MeshStandardMaterial({ color: '#918c80', roughness: 0.92 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: '#a4a198', roughness: 0.96 }),
    stairTread: new THREE.MeshStandardMaterial({ color: '#68716d', metalness: 0.38, roughness: 0.64 }),
    stairRiser: new THREE.MeshStandardMaterial({ color: '#353d3a', metalness: 0.2, roughness: 0.86 }),
    stairEdge: new THREE.MeshStandardMaterial({
      color: '#d3a15e',
      emissive: '#6b4820',
      emissiveIntensity: 0.32,
      metalness: 0.28,
      roughness: 0.58,
    }),
    yardFloor: new THREE.MeshStandardMaterial({ map: floorTexture, color: '#858a82', roughness: 0.97 }),
    metal: new THREE.MeshStandardMaterial({ color: '#626b67', metalness: 0.72, roughness: 0.42 }),
    gate: new THREE.MeshStandardMaterial({ color: '#3e4844', metalness: 0.72, roughness: 0.48 }),
    bedding: new THREE.MeshStandardMaterial({ color: '#737c77', roughness: 0.9 }),
    sheet: new THREE.MeshStandardMaterial({ color: '#b3ad9c', roughness: 1 }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#bab9ad', roughness: 0.4 }),
    toiletWater: new THREE.MeshStandardMaterial({ color: '#71817a', roughness: 0.24, metalness: 0.04 }),
    wood: new THREE.MeshStandardMaterial({ color: '#6f5842', roughness: 0.9 }),
    light: new THREE.MeshStandardMaterial({ color: '#cbbd91', metalness: 0.25, roughness: 0.45 }),
    glow: new THREE.MeshStandardMaterial({ color: '#ffe2a5', emissive: '#e2a958', emissiveIntensity: 1.6, roughness: 0.55 }),
    windowGlass: new THREE.MeshStandardMaterial({ color: '#52636a', emissive: '#27363a', emissiveIntensity: 0.35, roughness: 0.3 }),
  };
  const occluders = [];
  const doors = [];
  const interactables = [];
  const boxBatches = new Map();
  const meshBatches = new Map();
  const doorGeometries = new Map();

  const addBox = (size, position, material, options = {}) => {
    const [width, height, depth] = size;
    if (options.visible !== false) {
      const key = [
        width,
        height,
        depth,
        material.uuid,
        options.blocker === false ? 0 : 1,
      ].join(':');
      let batch = boxBatches.get(key);
      if (!batch) {
        batch = { size, material, blocker: options.blocker !== false, positions: [] };
        boxBatches.set(key, batch);
      }
      batch.positions.push(position);
    }
    if (options.collide !== false) {
      physics.addFixedBox(
        { x: position[0], y: position[1], z: position[2] },
        { x: width, y: height, z: depth },
      );
    }
    return null;
  };

  const addMesh = (geometry, position, material, options = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (options.blocker !== false) occluders.push(mesh);
    return mesh;
  };

  const addInstance = (geometry, position, material, options = {}) => {
    const blocker = options.blocker !== false;
    const key = `${geometry.uuid}:${material.uuid}:${blocker ? 1 : 0}`;
    let batch = meshBatches.get(key);
    if (!batch) {
      batch = { geometry, material, blocker, transforms: [] };
      meshBatches.set(key, batch);
    }
    batch.transforms.push({
      position,
      rotationY: options.rotationY || 0,
      scale: options.scale || [1, 1, 1],
    });
    return null;
  };

  const addDoor = ({ side, centerZ, width, number, floorY = 0, floorIndex = 0 }) => {
    const group = new THREE.Group();
    group.name = `CellDoor${number}`;
    group.position.set(side * 3.5, floorY, centerZ - width / 2);
    const doorMaterial = materials.gate;
    const geometryKey = `${width}:${side}`;
    if (!doorGeometries.has(geometryKey)) {
      doorGeometries.set(geometryKey, makeDoorGeometry(width, side));
    }
    const leaf = new THREE.Mesh(doorGeometries.get(geometryKey), doorMaterial);
    leaf.name = 'CellDoorBars';
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
    occluders.push(leaf);
    scene.add(group);
    const collider = physics.addFixedBox(
      { x: side * 3.5, y: floorY + 1.32, z: centerZ },
      { x: 0.2, y: 2.64, z: width },
    );
    const door = {
      group,
      center: new THREE.Vector3(side * 3.5, floorY + 1.2, centerZ),
      side,
      number,
      floorIndex,
      floorY,
      width,
      open: false,
      progress: 0,
      collider,
      material: doorMaterial,
    };
    doors.push(door);
    return door;
  };

  const addPointLight = (color, intensity, distance, position) => {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(...position);
    scene.add(light);
  };
  const addRamp = (center, size, rotationX) => physics.addFixedRamp(center, size, rotationX);
  const builder = { addBox, addMesh, addInstance, addDoor, addPointLight, addRamp, materials };
  buildYard(builder);
  buildStairwell(builder);

  const shaftHeight = mapLayout.floorCount * mapLayout.floorHeight;
  const shaftWidth = mapLayout.elevator.maxX - mapLayout.elevator.minX + 0.3;
  const shaftDepth = mapLayout.elevator.maxZ - mapLayout.elevator.minZ + 0.3;
  addBox(
    [0.2, shaftHeight, shaftDepth],
    [mapLayout.elevator.minX - 0.13, shaftHeight / 2, mapLayout.elevator.centerZ],
    materials.concrete,
  );
  addBox(
    [0.2, shaftHeight, shaftDepth],
    [mapLayout.elevator.maxX + 0.13, shaftHeight / 2, mapLayout.elevator.centerZ],
    materials.concrete,
  );
  addBox(
    [shaftWidth, shaftHeight, 0.2],
    [mapLayout.elevator.centerX, shaftHeight / 2, mapLayout.elevator.maxZ + 0.15],
    materials.concrete,
  );

  for (let floorIndex = 0; floorIndex < mapLayout.floorCount; floorIndex += 1) {
    const floorY = floorIndex * mapLayout.floorHeight;
    const levelBuilder = createFloorBuilder(builder, floorY, floorIndex);
    buildCorridor(levelBuilder);
    if (floorIndex > 0) {
      addBox(
        [2 * mapLayout.corridor.halfWidth, 0.36, mapLayout.elevator.minZ - mapLayout.corridor.endZ],
        [
          0,
          floorY - 0.18,
          (mapLayout.elevator.minZ + mapLayout.corridor.endZ) / 2,
        ],
        materials.floor,
      );
    }
    let roomNumber = 1;
    for (const centerZ of CELL_CENTERS) {
      for (const side of [-1, 1]) {
        const number = floorIndex * CELL_CENTERS.length * 2 + roomNumber;
        const cell = buildCell(levelBuilder, side, centerZ, number, floorY, floorIndex);
        interactables.push(...cell.interactables);
        roomNumber += 1;
      }
    }

    const accent = new THREE.MeshStandardMaterial({
      color: mapLayout.floorAccents[floorIndex],
      emissive: mapLayout.floorAccents[floorIndex],
      emissiveIntensity: 0.34,
      roughness: 0.72,
    });
    for (const side of [-1, 1]) {
      addBox([0.08, 0.08, 10.4], [side * 3.27, floorY + 3.02, 12.5], accent, {
        collide: false,
        blocker: false,
      });
    }
    buildFloorLandmark(levelBuilder, floorIndex);
    addFloorSign(scene, floorIndex, floorY);
    const fillLight = new THREE.PointLight(mapLayout.floorAccents[floorIndex], 4.2, 15, 1.8);
    fillLight.position.set(0, floorY + 3.1, 12.5);
    scene.add(fillLight);
  }

  const elevator = new Elevator(scene, physics, materials, occluders);
  const batches = new THREE.Object3D();
  for (const { size, material, blocker, positions } of boxBatches.values()) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(...size),
      material,
      positions.length,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    positions.forEach((position, index) => {
      batches.position.set(...position);
      batches.updateMatrix();
      mesh.setMatrixAt(index, batches.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    if (blocker && material !== materials.glow) occluders.push(mesh);
  }
  for (const { geometry, material, blocker, transforms } of meshBatches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    transforms.forEach(({ position, rotationY, scale }, index) => {
      batches.position.set(...position);
      batches.rotation.set(0, rotationY, 0);
      batches.scale.set(...scale);
      batches.updateMatrix();
      mesh.setMatrixAt(index, batches.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    if (blocker && material !== materials.glow) occluders.push(mesh);
  }

  return { cameraOccluders: occluders, doors, interactables, elevator };
}
