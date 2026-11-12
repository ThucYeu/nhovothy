export class Physics {
  static async create() {
    const { default: RAPIER } = await import('@dimforge/rapier3d');
    return new Physics(RAPIER);
  }

  constructor(RAPIER) {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.controller = this.world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.enableAutostep(0.32, 0.2, true);
    this.controller.enableSnapToGround(0.25);
  }

  addFixedBox(center, size) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    const collider = this.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setFriction(0.9);
    return { body, collider: this.world.createCollider(collider, body) };
  }

  addFixedRamp(center, size, rotationX) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    const collider = this.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setRotation({
        x: Math.sin(rotationX / 2),
        y: 0,
        z: 0,
        w: Math.cos(rotationX / 2),
      })
      .setFriction(0.9);
    return { body, collider: this.world.createCollider(collider, body) };
  }

  createElevatorBody(centerX, centerZ) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(centerX, 0, centerZ),
    );
    const cabinColliders = [
      [[1.26, 0.12, 1.26], [0, 0.12, 0]],
      [[0.06, 1.38, 1.26], [-1.2, 1.5, 0]],
      [[0.06, 1.38, 1.26], [1.2, 1.5, 0]],
      [[2.34, 1.38, 0.06], [0, 1.5, 1.2]],
      [[1.26, 0.06, 1.26], [0, 2.94, 0]],
    ];
    for (const [[halfX, halfY, halfZ], [x, y, z]] of cabinColliders) {
      const collider = this.RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
        .setTranslation(x, y, z)
        .setFriction(0.9);
      this.world.createCollider(collider, body);
    }
    const doorColliders = [-1, 1].map((side) => {
      const collider = this.RAPIER.ColliderDesc.cuboid(0.61, 1.4, 0.04)
        .setTranslation(side * 0.61, 1.5, -1.22)
        .setFriction(0.9);
      return this.world.createCollider(collider, body);
    });
    return { body, doorColliders };
  }

  removeFixedBox(handle) {
    if (handle) this.world.removeRigidBody(handle.body);
  }

  createCharacter(position) {
    const body = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y, position.z)
        .lockRotations(),
    );
    const collider = this.world.createCollider(
      this.RAPIER.ColliderDesc.capsule(0.55, 0.3).setFriction(0),
      body,
    );
    return { body, collider };
  }

  moveCharacter(body, collider, desiredTranslation, delta) {
    this.controller.computeColliderMovement(collider, desiredTranslation);
    const movement = this.controller.computedMovement();
    const position = body.translation();
    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
    this.world.timestep = delta;
    this.world.step();
    return this.controller.computedGrounded();
  }

  destroy() {
    this.controller.free();
    this.world.free();
  }
}