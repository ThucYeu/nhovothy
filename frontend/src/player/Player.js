import * as THREE from 'three';
import { createCharacterModel } from './CharacterModel.js';
import { PlayerAnimation } from './PlayerAnimation.js';

export class Player {
  constructor(scene) {
    this.model = new THREE.Group();
    this.model.name = 'PrisonerPlayer';
    const character = createCharacterModel();
    this.rig = character.rig;
    this.skeleton = character.skeleton;
    this.boneMap = character.boneMap;
    this.model.add(this.rig);
    scene.add(this.model);
    this.animation = new PlayerAnimation(this.rig);
  }

  update(delta, position, yaw, animation, crouching) {
    this.model.position.set(position.x, position.y - 0.85, position.z);
    this.model.rotation.y = yaw;
    this.model.scale.setScalar(1);
    this.animation.update(delta, crouching ? 'crouch' : animation);
  }

  destroy() {
    this.animation.destroy();
    const geometries = new Set();
    const materials = new Set();
    this.model.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.skeleton.dispose();
    this.model.removeFromParent();
  }
}