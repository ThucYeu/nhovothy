import * as THREE from 'three';

export class PlayerController {
  constructor(physics, input, player, spawn) {
    this.physics = physics;
    this.input = input;
    this.player = player;
    this.spawn = spawn;
    ({ body: this.body, collider: this.collider } = physics.createCharacter(spawn));
    this.verticalVelocity = 0;
    this.grounded = false;
    this.crouching = false;
    this.yaw = 0;
    this.animation = 'idle';
    this.interaction = null;
    this.moveVector = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.position = new THREE.Vector3();
  }

  update(delta, cameraYaw, elevatorDeltaY = 0, elevatorRiding = false) {
    if (this.interaction) {
      this.updateInteraction(delta);
      return;
    }

    const forwardInput = Number(this.input.isDown('KeyW')) - Number(this.input.isDown('KeyS'));
    const sideInput = Number(this.input.isDown('KeyD')) - Number(this.input.isDown('KeyA'));
    this.crouching = this.input.isDown('KeyC');

    this.forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    this.right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    this.moveVector.copy(this.forward).multiplyScalar(forwardInput)
      .addScaledVector(this.right, sideInput);

    const hasInput = this.moveVector.lengthSq() > 0;
    if (hasInput) this.moveVector.normalize();

    const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = this.crouching ? 1.6 : sprinting ? 6 : 3.2;
    if (this.input.consumePress('Space') && this.grounded && !this.crouching) {
      this.verticalVelocity = 6.8;
      this.grounded = false;
    }
    let elevatorRideY = null;
    if (elevatorRiding) {
      const position = this.body.translation();
      elevatorRideY = position.y + elevatorDeltaY;
      this.body.setTranslation({
        x: position.x,
        y: elevatorRideY,
        z: position.z,
      }, true);
      this.verticalVelocity = 0;
      this.grounded = true;
    } else {
      this.verticalVelocity = this.grounded && this.verticalVelocity < 0
        ? -1.2
        : this.verticalVelocity - 18 * delta;
    }

    const grounded = this.physics.moveCharacter(this.body, this.collider, {
      x: this.moveVector.x * speed * delta,
      y: elevatorRiding ? 0 : this.verticalVelocity * delta + elevatorDeltaY,
      z: this.moveVector.z * speed * delta,
    }, delta);
    if (elevatorRiding) {
      const position = this.body.translation();
      this.body.setTranslation({
        x: position.x,
        y: elevatorRideY,
        z: position.z,
      }, true);
      this.verticalVelocity = 0;
      this.grounded = true;
    } else {
      if (grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;
      this.grounded = grounded;
    }

    if (hasInput) {
      const targetYaw = Math.atan2(-this.moveVector.x, -this.moveVector.z);
      const yawDelta = THREE.MathUtils.euclideanModulo(targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += yawDelta * (1 - Math.exp(-12 * delta));
    }

    if (!this.grounded) this.animation = this.verticalVelocity > 0.2 ? 'jump' : 'fall';
    else if (this.crouching) this.animation = 'crouch';
    else if (hasInput && sprinting) this.animation = 'run';
    else if (hasInput) this.animation = 'walk';
    else this.animation = 'idle';

    const position = this.body.translation();
    this.position.set(position.x, position.y, position.z);
    this.player.update(delta, this.position, this.yaw, this.animation, this.crouching);
  }

  updateIdle(delta) {
    if (this.interaction) {
      this.updateInteraction(delta);
      return;
    }
    const position = this.body.translation();
    this.position.set(position.x, position.y, position.z);
    this.player.update(delta, this.position, this.yaw, 'idle', false);
  }

  startInteraction(action) {
    if (this.interaction) return false;
    const position = this.body.translation();
    this.interaction = {
      ...action,
      returnPosition: { x: position.x, y: position.y, z: position.z },
      returnYaw: this.yaw,
    };
    this.collider.setEnabled(false);
    this.body.setTranslation(action.position, true);
    this.yaw = action.yaw;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.updateInteraction(0);
    return true;
  }

  endInteraction() {
    if (!this.interaction) return false;
    const { returnPosition, returnYaw, exitPosition } = this.interaction;
    this.collider.setEnabled(true);
    this.body.setTranslation(exitPosition || returnPosition, true);
    this.yaw = returnYaw;
    this.verticalVelocity = 0;
    this.grounded = false;
    this.interaction = null;
    const position = this.body.translation();
    this.position.set(position.x, position.y, position.z);
    return true;
  }

  updateInteraction(delta) {
    const position = this.body.translation();
    this.position.set(position.x, position.y, position.z);
    this.player.update(delta, this.position, this.yaw, this.interaction.animation, false);
  }

  getPosition() {
    return this.position;
  }

  applyServerState(state) {
    if (this.interaction) this.endInteraction();
    this.collider.setEnabled(true);
    this.body.setTranslation(state.position, true);
    this.yaw = state.yaw;
    this.verticalVelocity = 0;
    const position = this.body.translation();
    this.position.set(position.x, position.y, position.z);
  }
}