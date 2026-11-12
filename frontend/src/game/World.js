import * as THREE from 'three';
import { buildPrison } from '../environment/Prison.js';

export class World {
  constructor(scene, physics) {
    this.scene = scene;
    scene.background = new THREE.Color('#777f7c');
    scene.fog = new THREE.Fog('#777f7c', 34, 78);

    const ambient = new THREE.HemisphereLight('#d9e0db', '#34342f', 1.9);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight('#f0d8af', 2.15);
    sun.position.set(-16, 24, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -24;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00015;
    scene.add(sun);

    for (const [position, color, intensity, distance] of [
      [[0, 3.1, -1.5], '#ffd39a', 14, 11],
      [[0, 3.05, 8], '#f0dcb0', 11, 12],
      [[0, 3.05, 13], '#f0dcb0', 9, 12],
      [[0, 3.05, 18], '#f0dcb0', 9, 12],
      [[0, 5.5, 28], '#c2d5bf', 15, 25],
    ]) {
      const light = new THREE.PointLight(color, intensity, distance, 1.7);
      light.position.set(...position);
      scene.add(light);
    }

    const prison = buildPrison(scene, physics);
    this.cameraOccluders = prison.cameraOccluders;
    this.doors = prison.doors;
    this.interactables = prison.interactables;
    this.elevator = prison.elevator;
  }
}