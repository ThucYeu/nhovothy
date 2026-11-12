import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function makeFabricTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 173;
  for (let index = 0; index < size * size; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const weave = ((index % size) % 4 === 0 || Math.floor(index / size) % 4 === 0) ? 8 : 0;
    const value = 205 + ((seed >>> 24) % 31) - weave;
    const offset = index * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

function addBone(name, parent, position, bones, boneMap) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(...position);
  parent.add(bone);
  bones.push(bone);
  boneMap[name] = bone;
  return bone;
}

function createLoftGeometry(profile, segments = 28) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let ring = 0; ring < profile.length; ring += 1) {
    const shape = profile[ring];
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * shape.radiusX,
        shape.y,
        Math.sin(angle) * shape.radiusZ + (shape.offsetZ || 0),
      );
      uvs.push(segment / segments, shape.y * 2);
    }
  }

  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const lower = ring * segments + segment;
      const upper = (ring + 1) * segments + segment;
      const upperNext = (ring + 1) * segments + next;
      const lowerNext = ring * segments + next;
      indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, profile[0].y, profile[0].offsetZ || 0);
  uvs.push(0.5, profile[0].y * 2);
  const topCenter = positions.length / 3;
  positions.push(0, profile[profile.length - 1].y, profile[profile.length - 1].offsetZ || 0);
  uvs.push(0.5, profile[profile.length - 1].y * 2);

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(bottomCenter, segment, next);
    const top = (profile.length - 1) * segments;
    indices.push(topCenter, top + next, top + segment);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addSkinWeights(geometry, primaryIndex, secondaryIndex, blend = () => 1) {
  const positions = geometry.getAttribute('position');
  const indices = [];
  const weights = [];
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const primaryWeight = THREE.MathUtils.clamp(blend(positions.getY(vertex)), 0, 1);
    indices.push(primaryIndex, secondaryIndex, 0, 0);
    weights.push(primaryWeight, 1 - primaryWeight, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function makeMesh(parent, geometry, material, name, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeRoundedBox(parent, size, material, name, position, radius = 0.025) {
  const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius);
  return makeMesh(parent, geometry, material, name, position);
}

function addCurve(parent, points, material, name, radius = 0.004) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const geometry = new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 6, false);
  return makeMesh(parent, geometry, material, name);
}

function makeBoneCapsule(parent, boneName, name, length, radius, material) {
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 6, 14);
  return makeMesh(parent, geometry, material, name, [0, -length / 2, 0]);
}

function makeTaperedLimb(parent, boneName, name, length, topRadius, bottomRadius, material) {
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 18, 5, false);
  const mesh = makeMesh(parent, geometry, material, name, [0, -length / 2, 0]);
  mesh.geometry.computeVertexNormals();
  return mesh;
}

function createBoneHierarchy(rig) {
  const bones = [];
  const boneMap = {};
  const hips = addBone('Hips', rig, [0, 0.88, 0], bones, boneMap);
  const spine = addBone('Spine', hips, [0, 0.08, 0], bones, boneMap);
  const neck = addBone('Neck', spine, [0, 0.48, 0], bones, boneMap);
  addBone('Head', neck, [0, 0.14, 0], bones, boneMap);

  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    const shoulder = addBone(`${side}Shoulder`, spine, [sign * 0.32, 0.4, 0], bones, boneMap);
    const arm = addBone(`${side}Arm`, shoulder, [0, -0.045, 0], bones, boneMap);
    const elbow = addBone(`${side}Elbow`, arm, [0, -0.29, 0], bones, boneMap);
    const forearm = addBone(`${side}Forearm`, elbow, [0, -0.025, 0], bones, boneMap);
    addBone(`${side}Hand`, forearm, [0, -0.255, -0.006], bones, boneMap);

    const leg = addBone(`${side}Leg`, hips, [sign * 0.15, -0.03, 0], bones, boneMap);
    const knee = addBone(`${side}Knee`, leg, [0, -0.4, 0], bones, boneMap);
    const calf = addBone(`${side}Calf`, knee, [0, -0.02, 0], bones, boneMap);
    addBone(`${side}Foot`, calf, [0, -0.36, 0.015], bones, boneMap);
  }

  return { bones, boneMap };
}

function createSegmentGlyph(parent, glyph, x, y, z, material) {
  const segments = {
    C: ['a', 'd', 'e', 'f'],
    0: ['a', 'b', 'c', 'd', 'e', 'f'],
    4: ['b', 'c', 'f', 'g'],
    2: ['a', 'b', 'd', 'e', 'g'],
  }[glyph] || [];
  const placements = {
    a: [0, 0.022, 0.026, 0.005],
    g: [0, 0, 0.026, 0.005],
    d: [0, -0.022, 0.026, 0.005],
    f: [-0.013, 0.011, 0.005, 0.019],
    b: [0.013, 0.011, 0.005, 0.019],
    e: [-0.013, -0.011, 0.005, 0.019],
    c: [0.013, -0.011, 0.005, 0.019],
  };
  for (const segment of segments) {
    const [offsetX, offsetY, width, height] = placements[segment];
    makeRoundedBox(parent, [width, height, 0.003], material, `BadgeGlyph${glyph}${segment}`, [x + offsetX, y + offsetY, z], 0.002);
  }
}

function buildFace(head, materials) {
  const faceGeometry = createLoftGeometry([
    { y: -0.2, radiusX: 0.065, radiusZ: 0.08 },
    { y: -0.17, radiusX: 0.095, radiusZ: 0.11 },
    { y: -0.1, radiusX: 0.132, radiusZ: 0.128 },
    { y: 0.015, radiusX: 0.15, radiusZ: 0.135 },
    { y: 0.12, radiusX: 0.136, radiusZ: 0.12 },
    { y: 0.19, radiusX: 0.08, radiusZ: 0.078 },
    { y: 0.205, radiusX: 0.025, radiusZ: 0.025 },
  ], 32);
  makeMesh(head, faceGeometry, materials.skin, 'FaceShape');

  for (const sign of [-1, 1]) {
    const ear = makeMesh(head, new THREE.SphereGeometry(0.052, 16, 12), materials.skin, `Ear${sign}`, [sign * 0.143, -0.015, 0]);
    ear.scale.set(0.57, 0.9, 0.42);
    const innerEar = makeMesh(head, new THREE.SphereGeometry(0.025, 12, 8), materials.skinShade, `InnerEar${sign}`, [sign * 0.156, -0.012, -0.014]);
    innerEar.scale.set(0.48, 0.72, 0.35);

    const eyeWhite = makeMesh(head, new THREE.SphereGeometry(1, 18, 12), materials.eyeWhite, `EyeWhite${sign}`, [sign * 0.061, 0.035, -0.117]);
    eyeWhite.scale.set(0.04, 0.026, 0.018);
    const iris = makeMesh(head, new THREE.SphereGeometry(1, 16, 10), materials.iris, `Iris${sign}`, [sign * 0.061, 0.034, -0.133]);
    iris.scale.set(0.016, 0.017, 0.008);
    const pupil = makeMesh(head, new THREE.SphereGeometry(1, 12, 8), materials.pupil, `Pupil${sign}`, [sign * 0.061, 0.034, -0.139]);
    pupil.scale.set(0.0075, 0.011, 0.004);
    makeMesh(head, new THREE.SphereGeometry(0.0045, 8, 6), materials.eyeWhite, `EyeGlint${sign}`, [sign * 0.057, 0.04, -0.143]);

    addCurve(head, [
      [sign * 0.104, 0.083, -0.12],
      [sign * 0.064, 0.096, -0.143],
      [sign * 0.025, 0.086, -0.133],
    ], materials.hair, `Brow${sign}`, 0.009);
    addCurve(head, [
      [sign * 0.11, 0.045, -0.123],
      [sign * 0.061, 0.014, -0.14],
      [sign * 0.022, 0.045, -0.133],
    ], materials.skinShade, `LowerLid${sign}`, 0.0035);
  }

  const noseBridge = makeMesh(head, new THREE.SphereGeometry(1, 16, 12), materials.skin, 'NoseBridge', [0, -0.006, -0.13]);
  noseBridge.scale.set(0.035, 0.062, 0.045);
  const noseTip = makeMesh(head, new THREE.SphereGeometry(1, 16, 12), materials.skin, 'NoseTip', [0, -0.046, -0.151]);
  noseTip.scale.set(0.044, 0.027, 0.032);
  for (const sign of [-1, 1]) {
    makeMesh(head, new THREE.SphereGeometry(0.007, 8, 6), materials.skinShade, `Nostril${sign}`, [sign * 0.022, -0.058, -0.173]);
  }
  addCurve(head, [[-0.034, -0.105, -0.126], [0, -0.113, -0.139], [0.034, -0.105, -0.126]], materials.lip, 'UpperLip', 0.005);
  addCurve(head, [[-0.029, -0.12, -0.127], [0, -0.124, -0.136], [0.029, -0.12, -0.127]], materials.skinShade, 'LowerLip', 0.0035);
  addCurve(head, [[-0.108, -0.1, -0.096], [-0.088, -0.15, -0.105], [0, -0.181, -0.09], [0.088, -0.15, -0.105], [0.108, -0.1, -0.096]], materials.stubble, 'JawStubble', 0.005);
  addCurve(head, [[-0.054, -0.076, -0.132], [-0.027, -0.069, -0.143], [0, -0.075, -0.145], [0.027, -0.069, -0.143], [0.054, -0.076, -0.132]], materials.stubble, 'ShortMustache', 0.004);

  const hairCap = makeMesh(head, new THREE.SphereGeometry(0.183, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.59), materials.hair, 'HairScalp', [0, 0.035, 0.015]);
  hairCap.scale.set(0.98, 1, 0.9);
  const sweptLock = makeMesh(head, new THREE.SphereGeometry(1, 20, 14), materials.hair, 'SweptHairLock', [-0.025, 0.16, -0.047]);
  sweptLock.scale.set(0.13, 0.063, 0.091);
  sweptLock.rotation.z = -0.16;
  sweptLock.rotation.y = -0.2;
  const sideLock = makeMesh(head, new THREE.SphereGeometry(1, 16, 12), materials.hairLight, 'SideHairLock', [0.075, 0.14, -0.005]);
  sideLock.scale.set(0.078, 0.045, 0.09);
  sideLock.rotation.z = 0.28;
  for (const sign of [-1, 1]) {
    const sideburn = makeMesh(head, new THREE.SphereGeometry(1, 14, 10), materials.hair, `Sideburn${sign}`, [sign * 0.137, -0.018, 0.018]);
    sideburn.scale.set(0.025, 0.075, 0.048);
  }
  addCurve(head, [[-0.12, 0.18, -0.025], [-0.055, 0.207, -0.067], [0.025, 0.205, -0.065], [0.096, 0.175, -0.02]], materials.hairLight, 'HairSweepHighlight', 0.004);
}

function buildHand(hand, sign, materials) {
  const palm = makeMesh(hand, new THREE.SphereGeometry(1, 18, 14), materials.skin, 'Palm', [0, -0.055, -0.004]);
  palm.scale.set(0.078, 0.09, 0.047);
  const fingers = [
    { x: -0.048, length: 0.085 },
    { x: -0.016, length: 0.105 },
    { x: 0.017, length: 0.099 },
    { x: 0.049, length: 0.08 },
  ];
  fingers.forEach((finger, index) => {
    const geometry = new THREE.CapsuleGeometry(0.012, finger.length - 0.024, 4, 8);
    const mesh = makeMesh(hand, geometry, materials.skin, `Finger${index + 1}`, [finger.x, -0.135 - (finger.length - 0.085) / 2, -0.007]);
    mesh.rotation.z = sign * (index - 1.5) * 0.035;
    makeRoundedBox(hand, [0.011, 0.012, 0.003], materials.nail, `Nail${index + 1}`, [finger.x, -0.135 - finger.length + 0.006, -0.018], 0.004);
  });
  const thumb = makeMesh(hand, new THREE.CapsuleGeometry(0.015, 0.072, 4, 8), materials.skin, 'Thumb', [sign * 0.078, -0.073, 0.002]);
  thumb.rotation.z = -sign * 0.67;
  thumb.rotation.x = -0.12;
}

function addShoe(foot, sign, materials) {
  makeRoundedBox(foot, [0.25, 0.046, 0.39], materials.sole, 'RubberSole', [0, -0.083, -0.078], 0.018);
  makeRoundedBox(foot, [0.235, 0.13, 0.36], materials.shoe, 'PrisonBoot', [0, -0.035, -0.075], 0.047);
  makeRoundedBox(foot, [0.14, 0.025, 0.17], materials.shoeHighlight, 'Tongue', [0, 0.034, -0.085], 0.009);
  for (let row = 0; row < 3; row += 1) {
    const z = -0.11 + row * 0.045;
    addCurve(foot, [[-0.047, 0.047, z], [0, 0.056, z - 0.012], [0.047, 0.047, z]], materials.laces, `Lace${row}`, 0.004);
  }
  const heelTab = makeRoundedBox(foot, [0.05, 0.045, 0.012], materials.shoeHighlight, 'HeelTab', [sign * 0.092, -0.015, 0.075], 0.006);
  heelTab.rotation.z = sign * 0.1;
}

export function createCharacterModel() {
  const rig = new THREE.Group();
  rig.name = 'PrisonerRig';
  const { bones, boneMap } = createBoneHierarchy(rig);
  const fabricTexture = makeFabricTexture();
  const materials = {
    uniform: new THREE.MeshStandardMaterial({ color: '#cf7548', map: fabricTexture, roughness: 0.94, metalness: 0 }),
    uniformDark: new THREE.MeshStandardMaterial({ color: '#a85837', map: fabricTexture, roughness: 0.96, metalness: 0 }),
    seam: new THREE.MeshStandardMaterial({ color: '#a95638', roughness: 0.96 }),
    seamLight: new THREE.MeshStandardMaterial({ color: '#e39a6f', roughness: 0.9 }),
    badge: new THREE.MeshStandardMaterial({ color: '#d8d1bd', roughness: 0.85 }),
    badgeInk: new THREE.MeshStandardMaterial({ color: '#303c38', roughness: 0.85 }),
    logo: new THREE.MeshStandardMaterial({ color: '#42564c', roughness: 0.85 }),
    skin: new THREE.MeshPhysicalMaterial({ color: '#b98366', roughness: 0.73, metalness: 0, sheen: 0.18, sheenColor: '#bd8b70', sheenRoughness: 0.86 }),
    skinShade: new THREE.MeshStandardMaterial({ color: '#875d4b', roughness: 0.86 }),
    stubble: new THREE.MeshStandardMaterial({ color: '#59463b', roughness: 0.96 }),
    undershirt: new THREE.MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.98, map: fabricTexture }),
    lip: new THREE.MeshStandardMaterial({ color: '#714b41', roughness: 0.76 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: '#dfd9ca', roughness: 0.42 }),
    iris: new THREE.MeshStandardMaterial({ color: '#644734', roughness: 0.32 }),
    pupil: new THREE.MeshStandardMaterial({ color: '#171716', roughness: 0.24 }),
    hair: new THREE.MeshStandardMaterial({ color: '#322b27', roughness: 0.88, metalness: 0 }),
    hairLight: new THREE.MeshStandardMaterial({ color: '#504137', roughness: 0.82 }),
    nail: new THREE.MeshStandardMaterial({ color: '#d2ad97', roughness: 0.72 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#30312e', roughness: 0.78, metalness: 0.03 }),
    sole: new THREE.MeshStandardMaterial({ color: '#191c1b', roughness: 0.94 }),
    shoeHighlight: new THREE.MeshStandardMaterial({ color: '#464643', roughness: 0.72 }),
    laces: new THREE.MeshStandardMaterial({ color: '#a9a28f', roughness: 0.85 }),
  };

  const hipIndex = bones.indexOf(boneMap.Hips);
  const spineIndex = bones.indexOf(boneMap.Spine);
  const torsoGeometry = createLoftGeometry([
    { y: 0.85, radiusX: 0.2, radiusZ: 0.12 },
    { y: 0.91, radiusX: 0.24, radiusZ: 0.14 },
    { y: 1.02, radiusX: 0.28, radiusZ: 0.155 },
    { y: 1.19, radiusX: 0.305, radiusZ: 0.165 },
    { y: 1.34, radiusX: 0.34, radiusZ: 0.15 },
    { y: 1.44, radiusX: 0.33, radiusZ: 0.135 },
    { y: 1.51, radiusX: 0.245, radiusZ: 0.115 },
  ]);
  addSkinWeights(torsoGeometry, spineIndex, hipIndex, (height) => (height - 0.85) / 0.19);
  const torso = new THREE.SkinnedMesh(torsoGeometry, materials.uniform);
  torso.name = 'TailoredJumpsuitTorso';
  torso.castShadow = true;
  torso.receiveShadow = true;
  rig.add(torso);

  const pelvisGeometry = createLoftGeometry([
    { y: 0.72, radiusX: 0.17, radiusZ: 0.11 },
    { y: 0.77, radiusX: 0.22, radiusZ: 0.13 },
    { y: 0.88, radiusX: 0.245, radiusZ: 0.135 },
    { y: 0.96, radiusX: 0.225, radiusZ: 0.125 },
    { y: 0.99, radiusX: 0.18, radiusZ: 0.11 },
  ]);
  addSkinWeights(pelvisGeometry, hipIndex, spineIndex, () => 1);
  const pelvis = new THREE.SkinnedMesh(pelvisGeometry, materials.uniform);
  pelvis.name = 'JumpsuitHips';
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  rig.add(pelvis);

  rig.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  torso.bind(skeleton);
  pelvis.bind(skeleton);

  const spine = boneMap.Spine;
  const neck = boneMap.Neck;
  const head = boneMap.Head;
  const neckMesh = makeMesh(neck, new THREE.CapsuleGeometry(0.078, 0.105, 6, 16), materials.skin, 'NeckForm', [0, -0.018, 0]);
  neckMesh.castShadow = true;
  buildFace(head, materials);

  addCurve(spine, [[-0.16, 0.49, -0.108], [-0.09, 0.55, -0.11], [0, 0.51, -0.12], [0.09, 0.55, -0.11], [0.16, 0.49, -0.108]], materials.uniformDark, 'OpenCollar', 0.018);
  addCurve(spine, [[-0.15, 0.49, -0.13], [-0.11, 0.43, -0.155], [-0.06, 0.39, -0.17], [0, 0.38, -0.173], [0.06, 0.39, -0.17], [0.11, 0.43, -0.155], [0.15, 0.49, -0.13]], materials.undershirt, 'UndershirtNeckline', 0.018);
  addCurve(spine, [[-0.145, 0.49, -0.13], [-0.21, 0.47, -0.115], [-0.27, 0.43, -0.09]], materials.undershirt, 'LeftTankStrap', 0.018);
  addCurve(spine, [[0.145, 0.49, -0.13], [0.21, 0.47, -0.115], [0.27, 0.43, -0.09]], materials.undershirt, 'RightTankStrap', 0.018);
  makeRoundedBox(spine, [0.026, 0.36, 0.012], materials.uniformDark, 'ZipperTape', [0, 0.26, -0.16], 0.007);
  addCurve(spine, [[0, 0.43, -0.169], [0, 0.27, -0.176], [0, 0.1, -0.169]], materials.badge, 'ZipperTeeth', 0.0035);
  makeRoundedBox(spine, [0.055, 0.04, 0.018], materials.badgeInk, 'ZipperPull', [0.008, 0.38, -0.178], 0.009);

  for (const sign of [-1, 1]) {
    const pocketX = sign * 0.205;
    makeRoundedBox(spine, [0.145, 0.135, 0.024], materials.uniformDark, `ChestPocket${sign}`, [pocketX, 0.34, -0.15], 0.018);
    makeRoundedBox(spine, [0.151, 0.046, 0.026], materials.uniform, `PocketFlap${sign}`, [pocketX, 0.39, -0.165], 0.012);
    makeRoundedBox(spine, [0.018, 0.018, 0.008], materials.badgeInk, `PocketButton${sign}`, [pocketX, 0.37, -0.182], 0.008);
    addCurve(spine, [
      [sign * 0.06, 0.44, -0.139],
      [sign * 0.17, 0.47, -0.14],
      [sign * 0.28, 0.44, -0.12],
    ], materials.seam, `ShoulderSeam${sign}`, 0.004);
  }

  makeRoundedBox(spine, [0.265, 0.115, 0.025], materials.badge, 'PrisonNumberPatch', [-0.17, 0.19, -0.158], 0.012);
  addCurve(spine, [[-0.292, 0.139, -0.174], [-0.17, 0.139, -0.176], [-0.048, 0.139, -0.174]], materials.badgeInk, 'BadgeBorder', 0.0025);
  for (const [index, glyph] of ['C', '0', '4', '2'].entries()) {
    createSegmentGlyph(spine, glyph, -0.264 + index * 0.064, 0.187, -0.176, materials.badgeInk);
  }
  const logo = makeMesh(spine, new THREE.SphereGeometry(0.052, 16, 12), materials.logo, 'PrisonShield', [0.185, 0.16, -0.151]);
  logo.scale.set(0.84, 1, 0.22);
  for (let stripe = 0; stripe < 3; stripe += 1) {
    makeRoundedBox(spine, [0.014, 0.048, 0.006], materials.badge, `PrisonBarsLogo${stripe}`, [0.165 + stripe * 0.02, 0.16, -0.168], 0.004);
  }

  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    const shoulder = boneMap[`${side}Shoulder`];
    const arm = boneMap[`${side}Arm`];
    const elbow = boneMap[`${side}Elbow`];
    const forearm = boneMap[`${side}Forearm`];
    const hand = boneMap[`${side}Hand`];
    const leg = boneMap[`${side}Leg`];
    const knee = boneMap[`${side}Knee`];
    const calf = boneMap[`${side}Calf`];
    const foot = boneMap[`${side}Foot`];

    const shoulderForm = makeMesh(shoulder, new THREE.SphereGeometry(1, 18, 14), materials.uniform, `${side}Deltoid`, [0, -0.025, 0]);
    shoulderForm.scale.set(0.142, 0.153, 0.13);
    makeTaperedLimb(arm, `${side}Arm`, `${side}UpperSleeve`, 0.31, 0.105, 0.079, materials.uniform);
    const upperFold = addCurve(arm, [[-0.064, -0.21, -0.057], [0, -0.225, -0.083], [0.064, -0.21, -0.057]], materials.seam, `${side}SleeveFold`, 0.004);
    upperFold.rotation.x = sign * 0.05;

    const elbowJoint = makeMesh(elbow, new THREE.SphereGeometry(0.079, 16, 12), materials.uniform, `${side}ElbowJoint`);
    elbowJoint.scale.set(0.88, 0.92, 0.9);
    makeTaperedLimb(forearm, `${side}Forearm`, `${side}ForearmSleeve`, 0.26, 0.078, 0.061, materials.uniform);
    const cuff = makeMesh(forearm, new THREE.TorusGeometry(0.064, 0.012, 8, 18), materials.uniformDark, `${side}Cuff`, [0, -0.232, 0]);
    cuff.rotation.x = Math.PI / 2;
    const cuffSeam = makeMesh(forearm, new THREE.TorusGeometry(0.063, 0.0035, 6, 18), materials.seamLight, `${side}CuffStitch`, [0, -0.215, 0]);
    cuffSeam.rotation.x = Math.PI / 2;
    buildHand(hand, sign, materials);

    makeTaperedLimb(leg, `${side}Leg`, `${side}TrouserThigh`, 0.41, 0.132, 0.096, materials.uniform);
    const cargoPocket = makeRoundedBox(leg, [0.11, 0.14, 0.035], materials.uniformDark, `${side}CargoPocket`, [sign * 0.091, -0.2, -0.092], 0.016);
    cargoPocket.rotation.z = sign * -0.04;
    makeRoundedBox(leg, [0.116, 0.035, 0.039], materials.uniform, `${side}CargoFlap`, [sign * 0.091, -0.143, -0.108], 0.009);
    addCurve(leg, [[sign * 0.05, -0.06, -0.118], [sign * 0.07, -0.2, -0.1], [sign * 0.045, -0.34, -0.092]], materials.seam, `${side}TrouserSeam`, 0.0035);
    const kneeForm = makeMesh(knee, new THREE.SphereGeometry(0.103, 16, 12), materials.uniform, `${side}KneeShape`);
    kneeForm.scale.set(0.95, 0.9, 0.91);
    addCurve(knee, [[-0.063, -0.015, -0.06], [0, -0.03, -0.096], [0.063, -0.015, -0.06]], materials.seamLight, `${side}KneeFold`, 0.004);
    makeTaperedLimb(calf, `${side}Calf`, `${side}TrouserCalf`, 0.36, 0.096, 0.067, materials.uniform);
    const ankleCuff = makeMesh(calf, new THREE.TorusGeometry(0.072, 0.011, 8, 16), materials.uniformDark, `${side}AnkleCuff`, [0, -0.325, 0]);
    ankleCuff.rotation.x = Math.PI / 2;
    addShoe(foot, sign, materials);
  }

  rig.updateMatrixWorld(true);
  return { rig, skeleton, bones, boneMap, materials };
}