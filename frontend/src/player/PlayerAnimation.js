import * as THREE from 'three';

const strideTimes = [0, 0.25, 0.5, 0.75, 1];

function makeTrack(target, property, times, values) {
  return new THREE.NumberKeyframeTrack(`${target}.${property}`, times, values);
}

function makeStrideClip(name, duration, swing, kneeLift, running = false) {
  const leftSwing = [0, swing, 0, -swing, 0];
  const rightSwing = leftSwing.map((value) => -value);
  const leftKnee = [0, kneeLift, 0, kneeLift * 0.28, 0];
  const rightKnee = [0, kneeLift * 0.28, 0, kneeLift, 0];
  const armSwing = running ? 0.72 : 0.48;
  return new THREE.AnimationClip(name, duration, [
    makeTrack('LeftLeg', 'rotation[x]', strideTimes, leftSwing),
    makeTrack('RightLeg', 'rotation[x]', strideTimes, rightSwing),
    makeTrack('LeftKnee', 'rotation[x]', strideTimes, leftKnee),
    makeTrack('RightKnee', 'rotation[x]', strideTimes, rightKnee),
    makeTrack('LeftArm', 'rotation[x]', strideTimes, rightSwing.map((value) => value * armSwing)),
    makeTrack('RightArm', 'rotation[x]', strideTimes, leftSwing.map((value) => value * armSwing)),
    makeTrack('LeftElbow', 'rotation[x]', strideTimes, [0, 0.12, 0.04, 0.18, 0]),
    makeTrack('RightElbow', 'rotation[x]', strideTimes, [0, 0.18, 0.04, 0.12, 0]),
    makeTrack('Spine', 'rotation[x]', strideTimes, [0, -0.025, 0, 0.025, 0]),
    makeTrack('Hips', 'position[y]', strideTimes, [0.88, 0.895, 0.88, 0.895, 0.88]),
  ]);
}

function makeIdleClip() {
  const times = [0, 0.5, 1];
  return new THREE.AnimationClip('Idle', 2, [
    makeTrack('Hips', 'position[y]', times, [0.88, 0.888, 0.88]),
    makeTrack('Spine', 'rotation[x]', times, [0, -0.012, 0]),
    makeTrack('Neck', 'rotation[x]', times, [0, 0.008, 0]),
    makeTrack('LeftShoulder', 'rotation[z]', times, [0, -0.012, 0]),
    makeTrack('RightShoulder', 'rotation[z]', times, [0, 0.012, 0]),
  ]);
}

function makeCrouchClip() {
  const times = [0, 0.35, 1];
  return new THREE.AnimationClip('Crouch', 1.4, [
    makeTrack('Hips', 'position[y]', times, [0.88, 0.65, 0.65]),
    makeTrack('LeftLeg', 'rotation[x]', times, [0, 0.25, 0.25]),
    makeTrack('RightLeg', 'rotation[x]', times, [0, 0.25, 0.25]),
    makeTrack('LeftKnee', 'rotation[x]', times, [0, 0.92, 0.92]),
    makeTrack('RightKnee', 'rotation[x]', times, [0, 0.92, 0.92]),
    makeTrack('Spine', 'rotation[x]', times, [0, 0.12, 0.12]),
    makeTrack('LeftArm', 'rotation[x]', times, [0, -0.18, -0.18]),
    makeTrack('RightArm', 'rotation[x]', times, [0, -0.18, -0.18]),
  ]);
}

function makeSleepClip() {
  const times = [0, 0.3, 1];
  return new THREE.AnimationClip('Sleep', 2, [
    makeTrack('Hips', 'rotation[x]', times, [0, Math.PI / 2, Math.PI / 2]),
    makeTrack('LeftArm', 'rotation[z]', times, [0, 0.22, 0.22]),
    makeTrack('RightArm', 'rotation[z]', times, [0, -0.22, -0.22]),
    makeTrack('LeftKnee', 'rotation[x]', times, [0, 0.08, 0.08]),
    makeTrack('RightKnee', 'rotation[x]', times, [0, 0.08, 0.08]),
    makeTrack('Spine', 'rotation[x]', times, [0, 0.035, 0.035]),
  ]);
}

function makeToiletClip() {
  const times = [0, 0.32, 1];
  return new THREE.AnimationClip('Toilet', 1.5, [
    makeTrack('Hips', 'position[y]', times, [0.88, 0.56, 0.56]),
    makeTrack('LeftLeg', 'rotation[x]', times, [0, 0.22, 0.22]),
    makeTrack('RightLeg', 'rotation[x]', times, [0, 0.22, 0.22]),
    makeTrack('LeftKnee', 'rotation[x]', times, [0, 1.05, 1.05]),
    makeTrack('RightKnee', 'rotation[x]', times, [0, 1.05, 1.05]),
    makeTrack('Spine', 'rotation[x]', times, [0, 0.16, 0.16]),
    makeTrack('LeftArm', 'rotation[x]', times, [0, -0.24, -0.24]),
    makeTrack('RightArm', 'rotation[x]', times, [0, -0.24, -0.24]),
    makeTrack('LeftElbow', 'rotation[x]', times, [0, -0.42, -0.42]),
    makeTrack('RightElbow', 'rotation[x]', times, [0, -0.42, -0.42]),
  ]);
}

function makeJumpClip() {
  const times = [0, 0.28, 0.65];
  return new THREE.AnimationClip('Jump', 0.65, [
    makeTrack('LeftArm', 'rotation[z]', times, [0, 0.45, 0.18]),
    makeTrack('RightArm', 'rotation[z]', times, [0, -0.45, -0.18]),
    makeTrack('LeftKnee', 'rotation[x]', times, [0, 0.38, 0.15]),
    makeTrack('RightKnee', 'rotation[x]', times, [0, 0.38, 0.15]),
    makeTrack('Spine', 'rotation[x]', times, [0, -0.07, 0]),
  ]);
}

function makeFallClip() {
  const times = [0, 0.5, 1];
  return new THREE.AnimationClip('Fall', 1.1, [
    makeTrack('LeftArm', 'rotation[z]', times, [0, 0.28, 0.28]),
    makeTrack('RightArm', 'rotation[z]', times, [0, -0.28, -0.28]),
    makeTrack('LeftKnee', 'rotation[x]', times, [0, 0.14, 0.14]),
    makeTrack('RightKnee', 'rotation[x]', times, [0, 0.14, 0.14]),
  ]);
}

export class PlayerAnimation {
  constructor(rig) {
    this.mixer = new THREE.AnimationMixer(rig);
    this.actions = new Map();
    const clips = [
      ['idle', makeIdleClip()],
      ['walk', makeStrideClip('Walk', 0.84, 0.52, 0.34)],
      ['run', makeStrideClip('Run', 0.56, 0.82, 0.62, true)],
      ['sleep', makeSleepClip()],
      ['toilet', makeToiletClip()],
      ['jump', makeJumpClip()],
      ['fall', makeFallClip()],
      ['crouch', makeCrouchClip()],
    ];
    for (const [name, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    this.activeAction = null;
    this.set('idle');
  }

  set(name) {
    const nextAction = this.actions.get(name) || this.actions.get('idle');
    if (this.activeAction === nextAction) return;
    this.activeAction?.fadeOut(0.18);
    nextAction.reset().setEffectiveWeight(1).setEffectiveTimeScale(name === 'run' ? 1.1 : 1).fadeIn(0.18).play();
    this.activeAction = nextAction;
  }

  update(delta, name) {
    this.set(name);
    this.mixer.update(delta);
  }

  destroy() {
    this.mixer.stopAllAction();
  }
}