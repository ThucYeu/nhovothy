import * as THREE from 'three';
import { Player } from '../player/Player.js';

export function createNameTag(name, inmateCode) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(9, 14, 12, 0.84)';
  context.fillRect(8, 8, 496, 80);
  context.fillStyle = '#d3ef75';
  context.fillRect(8, 8, 5, 80);
  context.fillStyle = '#f0eee7';
  context.font = '700 31px sans-serif';
  context.textBaseline = 'middle';
  context.fillText(name, 28, 37, 350);
  context.fillStyle = '#aeb8af';
  context.font = '600 19px sans-serif';
  context.fillText(inmateCode, 28, 65, 360);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.45, 0.28, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export class RemotePlayer {
  constructor(scene, snapshot) {
    this.scene = scene;
    this.player = new Player(scene);
    this.position = new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    this.targetPosition = this.position.clone();
    this.yaw = snapshot.yaw || 0;
    this.targetYaw = this.yaw;
    this.animation = snapshot.animation || 'idle';
    this.connected = snapshot.connected !== false;
    this.profile = this.toProfile(snapshot);
    this.nameTag = createNameTag(snapshot.name, snapshot.inmateCode);
    scene.add(this.nameTag);
    this.setConnected(this.connected);
  }

  updateState(snapshot) {
    this.targetPosition.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    this.targetYaw = snapshot.yaw;
    this.animation = snapshot.animation || 'idle';
    const nextProfile = this.toProfile(snapshot);
    if (nextProfile.name !== this.profile.name || nextProfile.inmateCode !== this.profile.inmateCode) {
      this.nameTag.removeFromParent();
      this.nameTag.material.map?.dispose();
      this.nameTag.material.dispose();
      this.nameTag = createNameTag(nextProfile.name, nextProfile.inmateCode);
      this.scene.add(this.nameTag);
    }
    this.profile = nextProfile;
    this.setConnected(snapshot.connected !== false);
  }

  toProfile(snapshot) {
    return {
      id: snapshot.id,
      name: snapshot.name,
      inmateCode: snapshot.inmateCode,
      age: snapshot.age,
      offense: snapshot.offense,
      reason: snapshot.reason,
      area: snapshot.area,
      connected: snapshot.connected !== false,
    };
  }

  getProfile() {
    return this.profile;
  }

  setConnected(connected) {
    this.connected = connected;
    this.nameTag.material.opacity = connected ? 1 : 0.55;
  }

  update(delta) {
    const smoothing = 1 - Math.exp(-13 * delta);
    this.position.lerp(this.targetPosition, smoothing);
    const yawDelta = THREE.MathUtils.euclideanModulo(this.targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this.yaw += yawDelta * smoothing;
    this.player.update(delta, this.position, this.yaw, this.animation, false);
    this.nameTag.position.set(this.position.x, this.position.y + 2.12, this.position.z);
  }

  destroy() {
    this.player.destroy();
    this.nameTag.material.map?.dispose();
    this.nameTag.material.dispose();
    this.nameTag.removeFromParent();
  }
}