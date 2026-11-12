import * as THREE from 'three';

export class DoorSystem {
  constructor(doors, interactables, physics, hint, playerController, elevator) {
    this.doors = doors;
    this.interactables = interactables;
    this.physics = physics;
    this.hint = hint;
    this.playerController = playerController;
    this.elevator = elevator;
    this.nearestDoor = null;
    this.nearestInteractable = null;
    this.position = new THREE.Vector3();
  }

  update(delta, playerPosition, input) {
    for (const door of this.doors) {
      const direction = door.open ? 1 : -1;
      door.progress = THREE.MathUtils.clamp(door.progress + direction * delta * 2.8, 0, 1);
      door.group.rotation.y = door.side * (Math.PI / 2) * door.progress;

      if (door.open && door.collider && door.progress > 0.08) {
        this.physics.removeFixedBox(door.collider);
        door.collider = null;
      } else if (!door.open && !door.collider && door.progress < 0.92) {
        door.collider = this.physics.addFixedBox(
          { x: door.side * 3.5, y: door.floorY + 1.32, z: door.center.z },
          { x: 0.2, y: 2.64, z: door.width },
        );
      }
    }

    if (this.playerController.interaction) {
      this.nearestDoor = null;
      this.nearestInteractable = null;
      this.hint.hidden = false;
      this.hint.textContent = this.playerController.interaction.animation === 'sleep'
        ? 'E  DẬY KHỎI GIƯỜNG'
        : 'E  XONG';
      if (input.consumePress('KeyE')) this.playerController.endInteraction();
      return;
    }

    let nearest = null;
    let nearestDistance = Infinity;
    for (const door of this.doors) {
      this.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
      const distance = this.position.distanceTo(door.center);
      if (distance < 3.9 && distance < nearestDistance) {
        nearest = { kind: 'door', target: door, distance };
        nearestDistance = distance;
      }
    }
    for (const interactable of this.interactables) {
      this.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
      const target = new THREE.Vector3(
        interactable.position.x,
        interactable.position.y,
        interactable.position.z,
      );
      const distance = this.position.distanceTo(target);
      if (distance < 1.9 && distance < nearestDistance) {
        nearest = { kind: 'prop', target: interactable, distance };
        nearestDistance = distance;
      }
    }
    for (const interactable of this.elevator.interactables) {
      this.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
      const target = new THREE.Vector3(
        interactable.position.x,
        interactable.position.y,
        interactable.position.z,
      );
      const distance = this.position.distanceTo(target);
      if (distance < 1.9 && distance < nearestDistance) {
        nearest = { kind: 'elevator-call', target: interactable, distance };
        nearestDistance = distance;
      }
    }

    this.nearestDoor = nearest?.kind === 'door' ? nearest.target : null;
    this.nearestInteractable = nearest?.kind === 'prop' ? nearest.target : null;
    this.hint.hidden = !nearest;
    if (nearest) {
      if (nearest.kind === 'door') {
        this.hint.textContent = `E  ${nearest.target.open ? 'ĐÓNG' : 'MỞ'} CỬA · TẦNG ${nearest.target.floorIndex + 1} · PHÒNG ${String(nearest.target.number).padStart(2, '0')}`;
        if (input.consumePress('KeyE')) nearest.target.open = !nearest.target.open;
      } else if (nearest.kind === 'prop') {
        this.hint.textContent = nearest.target.prompt;
        if (input.consumePress('KeyE')) this.playerController.startInteraction(nearest.target.action);
      } else {
        const destination = nearest.target.floorIndex + 1;
        this.hint.textContent = this.elevator.moving
          ? 'THANG MÁY ĐANG DI CHUYỂN'
          : `E  MỞ CỬA · VÀO CABIN ĐỂ CHỌN TẦNG 1–9 · TẦNG ${destination}`;
        if (input.consumePress('KeyE')) this.elevator.callFloor(nearest.target.floorIndex);
      }
    }
  }
}