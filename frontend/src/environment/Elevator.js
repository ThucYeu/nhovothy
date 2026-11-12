import * as THREE from 'three';
import mapLayout from '../../../data/prison-map.json';

const CABIN_SIZE = 2.52;
const CABIN_HALF = CABIN_SIZE / 2;
const DOOR_WIDTH = 2.44;
const DOOR_HEIGHT = 2.8;
const DOOR_Z = mapLayout.elevator.minZ - 0.05;
const CALL_BUTTON_Z = mapLayout.elevator.minZ - 0.95;
const DOOR_SPEED = 2.1;
const ACCELERATION = 1.15;
const MAX_SPEED = mapLayout.elevator.speed;
const ENTRY_CLOSE_DELAY = 0.9;
const EXIT_CLOSE_DELAY = 1.6;

export class Elevator {
  constructor(scene, physics, materials, cameraOccluders) {
    this.scene = scene;
    this.physics = physics;
    this.materials = materials;
    this.cameraOccluders = cameraOccluders;
    this.centerX = mapLayout.elevator.centerX;
    this.centerZ = mapLayout.elevator.centerZ;
    this.currentY = 0;
    this.currentFloor = 0;
    this.targetFloor = 0;
    this.targetY = 0;
    this.velocity = 0;
    this.moving = false;
    this.doorProgress = 0;
    this.doorsOpen = false;
    this.doorTargetOpen = false;
    this.phase = 'idle';
    this.riderInside = false;
    this.arrivalAwaitingExit = false;
    this.doorTimer = 0;
    const elevatorBody = physics.createElevatorBody(this.centerX, this.centerZ);
    this.body = elevatorBody.body;
    this.cabinDoorColliders = elevatorBody.doorColliders;
    this.car = new THREE.Group();
    this.car.position.set(this.centerX, 0, this.centerZ);
    scene.add(this.car);
    this.addCabin();
    this.floors = [];
    this.interactables = [];
    this.addFloorDoors();
    this.updateDoors();
  }

  addCabin() {
    const addCarBox = (size, position, material, blocksCamera = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.car.add(mesh);
      if (blocksCamera) this.cameraOccluders.push(mesh);
      return mesh;
    };

    addCarBox([CABIN_SIZE, 0.24, CABIN_SIZE], [0, 0.12, 0], this.materials.gate);
    addCarBox([0.12, 2.76, CABIN_SIZE], [-CABIN_HALF + 0.06, 1.5, 0], this.materials.metal);
    addCarBox([0.12, 2.76, CABIN_SIZE], [CABIN_HALF - 0.06, 1.5, 0], this.materials.metal);
    addCarBox([CABIN_SIZE - 0.24, 2.76, 0.12], [0, 1.5, CABIN_HALF - 0.06], this.materials.metal);
    addCarBox([CABIN_SIZE, 0.12, CABIN_SIZE], [0, 2.94, 0], this.materials.gate);

    this.cabinDoorPanels = [];
    for (const side of [-1, 1]) {
      const panel = addCarBox(
        [DOOR_WIDTH / 2, DOOR_HEIGHT, 0.08],
        [side * DOOR_WIDTH / 4, DOOR_HEIGHT / 2 + 0.1, -CABIN_HALF + 0.04],
        this.materials.gate,
      );
      this.cabinDoorPanels.push({ panel, side });
    }

    const buttonPanel = new THREE.PointLight('#ffe2a5', 0.7, 2.2);
    buttonPanel.position.set(CABIN_HALF - 0.2, 1.5, 0.78);
    this.car.add(buttonPanel);
  }

  addFloorDoors() {
    for (let floorIndex = 0; floorIndex < mapLayout.floorCount; floorIndex += 1) {
      const floorY = floorIndex * mapLayout.floorHeight;
      const group = new THREE.Group();
      group.position.set(this.centerX, floorY, DOOR_Z);
      const panels = [];

      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(DOOR_WIDTH / 2, DOOR_HEIGHT, 0.08),
          this.materials.gate,
        );
        panel.position.set(side * DOOR_WIDTH / 4, DOOR_HEIGHT / 2 + 0.1, 0);
        panel.castShadow = true;
        panel.receiveShadow = true;
        group.add(panel);
        this.cameraOccluders.push(panel);
        panels.push({ panel, side });
      }
      this.scene.add(group);

      this.floors.push({
        floorIndex,
        floorY,
        group,
        panels,
        collider: this.physics.addFixedBox(
          { x: this.centerX, y: floorY + DOOR_HEIGHT / 2 + 0.1, z: DOOR_Z },
          { x: DOOR_WIDTH, y: DOOR_HEIGHT, z: 0.12 },
        ),
      });
      this.interactables.push({
        kind: 'elevator-call',
        floorIndex,
        position: { x: this.centerX, y: floorY + 0.86, z: CALL_BUTTON_Z },
      });
    }
  }

  isPlayerInside(position) {
    return Math.abs(position.x - this.centerX) < CABIN_HALF - 0.3
      && Math.abs(position.z - this.centerZ) < CABIN_HALF - 0.3
      && position.y >= this.currentY + 0.15
      && position.y <= this.currentY + 3.2;
  }

  isPlayerOnPlatform(position) {
    return this.riderInside
      && Math.abs(position.x - this.centerX) < CABIN_HALF - 0.3
      && Math.abs(position.z - this.centerZ) < CABIN_HALF - 0.3
      && position.y >= this.currentY - 0.5
      && position.y <= this.currentY + 3.4;
  }

  callFloor(floorIndex) {
    if (this.moving || floorIndex < 0 || floorIndex >= mapLayout.floorCount) return false;
    if (floorIndex === this.currentFloor) {
      this.targetFloor = floorIndex;
      this.targetY = this.currentY;
      this.doorTargetOpen = true;
      this.phase = this.doorsOpen ? 'idle' : 'opening';
      this.doorTimer = 0;
      return true;
    }
    this.riderInside = false;
    this.arrivalAwaitingExit = false;
    this.doorTimer = 0;
    this.targetFloor = floorIndex;
    this.targetY = floorIndex * mapLayout.floorHeight;
    this.doorTargetOpen = false;
    this.doorsOpen = false;

    this.phase = 'closing';
    return true;
  }

  selectFloor(floorIndex) {
    if (this.moving || this.phase !== 'idle' || !this.riderInside
      || floorIndex < 0 || floorIndex >= mapLayout.floorCount) return false;
    if (floorIndex === this.currentFloor) {
      this.doorTargetOpen = true;
      this.phase = this.doorsOpen ? 'idle' : 'opening';
      this.arrivalAwaitingExit = true;
      return true;
    }
    this.targetFloor = floorIndex;
    this.targetY = floorIndex * mapLayout.floorHeight;
    this.doorTargetOpen = false;
    this.doorTimer = 0;
    this.phase = 'closing';
    return true;
  }

  hasFloorControls(position) {
    return this.riderInside
      && !this.moving
      && this.phase === 'idle'
      && this.isPlayerInside(position);
  }

  update(delta, playerPosition) {
    const wasRiding = this.isPlayerOnPlatform(playerPosition);
    const previousY = this.currentY;
    const inside = this.isPlayerInside(playerPosition);

    if (!this.moving && this.doorProgress >= 0.98 && this.doorTargetOpen
      && inside && !this.arrivalAwaitingExit) {
      this.riderInside = true;
      this.doorTimer += delta;
      if (this.doorTimer >= ENTRY_CLOSE_DELAY) {
        this.doorTargetOpen = false;
        this.phase = 'closing';
        this.doorTimer = 0;
      }
    } else if (!inside && this.riderInside && !this.moving && this.doorProgress >= 0.98) {
      this.doorTimer += delta;
      if (this.doorTimer >= EXIT_CLOSE_DELAY) {
        this.riderInside = false;
        this.arrivalAwaitingExit = false;
        this.doorTargetOpen = false;
        this.phase = 'closing';
        this.doorTimer = 0;
      }
    } else if (inside || !this.riderInside || this.arrivalAwaitingExit) {
      this.doorTimer = 0;
    }

    if (this.phase === 'closing' || this.phase === 'opening') {
      const direction = this.doorTargetOpen ? 1 : -1;
      this.doorProgress = THREE.MathUtils.clamp(
        this.doorProgress + direction * delta * DOOR_SPEED,
        0,
        1,
      );
      if (this.doorProgress >= 1 && this.doorTargetOpen) {
        this.doorsOpen = true;
        this.phase = 'idle';
        this.doorTimer = 0;
      } else if (this.doorProgress <= 0 && !this.doorTargetOpen) {
        this.doorsOpen = false;
        this.doorTimer = 0;
        if (this.targetFloor !== this.currentFloor) {
          this.moving = true;
          this.phase = 'moving';
        } else if (this.riderInside) {
          this.phase = 'idle';
        } else {
          this.phase = 'idle';
        }
      }
    } else if (this.moving) {
      this.moveBetweenFloors(delta);
    }

    this.body.setTranslation({
      x: this.centerX,
      y: this.currentY,
      z: this.centerZ,
    }, true);
    this.car.position.y = this.currentY;
    this.updateDoors();
    return wasRiding ? this.currentY - previousY : 0;
  }

  moveBetweenFloors(delta) {
    const distance = this.targetY - this.currentY;
    const direction = Math.sign(distance);
    const remaining = Math.abs(distance);
    const desiredSpeed = Math.min(MAX_SPEED, Math.sqrt(2 * ACCELERATION * remaining));
    this.velocity = Math.min(desiredSpeed, this.velocity + ACCELERATION * delta);
    const travel = Math.min(remaining, this.velocity * delta);
    this.currentY += direction * travel;

    if (travel >= remaining - 0.001) {
      this.currentY = this.targetY;
      this.currentFloor = this.targetFloor;
      this.velocity = 0;
      this.moving = false;
      this.doorTargetOpen = true;
      this.phase = 'opening';
      this.arrivalAwaitingExit = this.riderInside;
    }
  }

  updateDoors() {
    const isOpenAtFloor = (floorIndex) => (
      floorIndex === this.currentFloor && this.doorProgress >= 0.92
    );
    for (const floor of this.floors) {
      const progress = floor.floorIndex === this.currentFloor ? this.doorProgress : 0;
      for (const { panel, side } of floor.panels) {
        panel.position.x = side * (DOOR_WIDTH / 4 + progress * DOOR_WIDTH / 4);
      }
      floor.collider.collider.setEnabled(!isOpenAtFloor(floor.floorIndex));
    }
    for (const { panel, side } of this.cabinDoorPanels) {
      panel.position.x = side * (DOOR_WIDTH / 4 + this.doorProgress * DOOR_WIDTH / 4);
    }
    for (const collider of this.cabinDoorColliders) {
      collider.setEnabled(this.doorProgress < 0.92);
    }
  }
}
