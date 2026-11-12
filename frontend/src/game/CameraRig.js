import * as THREE from 'three';

export class CameraRig {
  constructor(camera, canvas, occluders) {
    this.camera = camera;
    this.canvas = canvas;
    this.occluders = occluders;
    this.yaw = 0;
    this.pitch = 0.3;
    this.distance = 5.2;
    this.firstPerson = false;
    this.raycaster = new THREE.Raycaster();
    this.direction = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.mouseSensitivity = 0.0024;

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.rotateBy(event.movementX, event.movementY, this.mouseSensitivity);
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.006, 2.8, 8.5);
    }, { passive: false });
  }

  rotateBy(deltaX, deltaY, sensitivity = this.mouseSensitivity) {
    this.yaw -= deltaX * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * sensitivity, -0.35, 1.12);
  }

  update(playerPosition, delta) {
    this.target.set(
      playerPosition.x,
      playerPosition.y + (this.firstPerson ? 1.53 : 0.95),
      playerPosition.z,
    );
    const horizontal = Math.cos(this.pitch);
    this.direction.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * horizontal,
    ).normalize();
    this.lookTarget.copy(this.target);

    if (this.firstPerson) {
      this.desiredPosition.copy(this.target);
      this.lookTarget.addScaledVector(this.direction, -10);
    } else {
      this.desiredPosition.copy(this.target).addScaledVector(this.direction, this.distance);
      this.raycaster.set(this.target, this.direction);
      this.raycaster.far = this.distance;
      const hit = this.raycaster.intersectObjects(this.occluders, false)[0];
      if (hit) {
        this.desiredPosition.copy(this.target)
          .addScaledVector(this.direction, Math.max(1.1, hit.distance - 0.32));
      }
    }

    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-9 * delta));
    this.camera.lookAt(this.lookTarget);
  }
}