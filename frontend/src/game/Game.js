import * as THREE from 'three';
import { CameraRig } from './CameraRig.js';
import { DoorSystem } from './DoorSystem.js';
import { Input } from './Input.js';
import { MultiplayerClient } from './MultiplayerClient.js';
import { Physics } from './Physics.js';
import { createNameTag, RemotePlayer } from './RemotePlayer.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { World } from './World.js';
import mapLayout from '../../../data/prison-map.json';

function getLocationLabel(position) {
  const floorIndex = THREE.MathUtils.clamp(
    Math.round((position.y - 0.86) / mapLayout.floorHeight),
    0,
    mapLayout.floorCount - 1,
  );
  const floorLabel = `TẦNG ${String(floorIndex + 1).padStart(2, '0')}`;
  if (position.z >= mapLayout.elevator.minZ
    && position.z <= mapLayout.elevator.maxZ
    && position.x >= mapLayout.elevator.minX
    && position.x <= mapLayout.elevator.maxX) {
    return `THANG MÁY · ${floorLabel}`;
  }
  if (position.z >= mapLayout.stairs.startZ - 0.5
    && position.z <= mapLayout.stairs.endZ + 1.4
    && position.x >= mapLayout.stairs.minX - 0.2
    && position.x <= mapLayout.stairs.maxX + 0.3) {
    return `CẦU THANG · ${floorLabel}`;
  }
  if (position.z >= 20 && position.y < 2.5) return 'SÂN';
  const cellIndex = mapLayout.corridor.cellCenters.findIndex(
    (center) => Math.abs(position.z - center) <= 1.8,
  );
  if (Math.abs(position.x) > 3.2 && cellIndex >= 0) {
    const roomOnFloor = cellIndex * 2 + (position.x > 0 ? 2 : 1);
    const roomsPerFloor = mapLayout.corridor.cellCenters.length * 2;
    const room = floorIndex * roomsPerFloor + roomOnFloor;
    return `PHÒNG ${String(room).padStart(2, '0')} · ${floorLabel}`;
  }
  return `${floorLabel} · ${mapLayout.floorNames[floorIndex]}`;
}

export class Game {
  static async create(canvas, onStateChange, onInspectProfile) {
    let renderer;
    try {
      const touchDevice = window.matchMedia('(pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !touchDevice,
        powerPreference: touchDevice ? 'low-power' : 'high-performance',
      });
    } catch {
      throw new Error('Không thể tạo WebGL context. Hãy bật tăng tốc phần cứng hoặc dùng Chrome/Edge phiên bản mới.');
    }
    const physics = await Physics.create();
    return new Game(canvas, renderer, physics, onStateChange, onInspectProfile);
  }

  constructor(canvas, renderer, physics, onStateChange, onInspectProfile) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.physics = physics;
    this.onStateChange = onStateChange;
    this.onInspectProfile = onInspectProfile;
    this.locationElement = document.querySelector('#zone-name');
    this.locationLabel = '';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    this.playerRaycaster = new THREE.Raycaster();
    this.playerRay = new THREE.Vector2(0, 0);
    this.clock = new THREE.Clock();
    this.input = new Input();
    this.isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.gameShell = canvas.closest('.game-shell');
    this.cursorUnlockedByUser = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouchDevice ? 1 : 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isTouchDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.world = new World(this.scene, physics);
    this.player = new Player(this.scene);
    this.playerController = new PlayerController(physics, this.input, this.player, { x: 0, y: 0.86, z: 18.5 });
    this.cameraRig = new CameraRig(this.camera, canvas, this.world.cameraOccluders);
    this.doorSystem = new DoorSystem(
      this.world.doors,
      this.world.interactables,
      physics,
      document.querySelector('#interaction-hint'),
      this.playerController,
      this.world.elevator,
    );
    this.elevatorControls = document.querySelector('#elevator-controls');
    this.elevatorFloorStatus = document.querySelector('#elevator-floor-status');
    this.elevatorTravelStatus = document.querySelector('#elevator-travel-status');
    this.elevatorControlsOpen = false;
    this.setupElevatorControls();
    this.setupTouchControls();
    this.remotePlayers = new Map();
    this.localPlayerId = null;
    this.localNameTag = null;
    this.onlineCount = 0;
    this.roomCapacity = 50;
    this.multiplayer = new MultiplayerClient({
      onStatus: (status) => this.updateNetworkStatus(status),
      onWelcome: (welcome) => this.handleWelcome(welcome),
      onJoined: (snapshot) => this.upsertRemotePlayer(snapshot),
      onState: (snapshot) => this.handleRemoteState(snapshot),
      onDisconnected: (event) => this.remotePlayers.get(event.id)?.setConnected(false),
      onLeft: (playerId) => this.removeRemotePlayer(playerId),
      onCount: (event) => this.updatePlayerCount(event.count, event.capacity),
      onCorrection: (snapshot) => {
        if (snapshot.id === this.localPlayerId) this.playerController.applyServerState(snapshot);
      },
      onError: (message) => this.updateNetworkStatus('error', message),
    });
    this.state = 'menu';
    this.hasStarted = false;

    this.handleResize = () => {
      const { width, height } = this.gameShell.getBoundingClientRect();
      if (!width || !height) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    };
    this.handleResize();
    this.handlePointerLock = () => {
      if (!this.isTouchDevice
        && !this.cursorUnlockedByUser
        && this.hasStarted
        && this.state === 'playing'
        && document.pointerLockElement !== this.canvas) {
        this.pause();
      }
    };
    this.handleEscape = (event) => {
      if (event.code !== 'Escape' || this.state !== 'playing') return;
      event.preventDefault();
      this.pause();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    };
    this.handleCameraToggle = (event) => {
      if (event.code !== 'KeyL' || event.repeat || this.state !== 'playing') return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select, button'))) return;
      event.preventDefault();
      this.toggleCameraView();
    };
    this.handleCursorToggle = (event) => {
      if (!['ControlLeft', 'ControlRight'].includes(event.code)
        || event.repeat
        || !this.hasStarted
        || this.state !== 'playing') return;
      event.preventDefault();
      if (document.pointerLockElement === this.canvas) {
        this.cursorUnlockedByUser = true;
        document.exitPointerLock();
      } else {
        this.cursorUnlockedByUser = false;
        this.canvas.requestPointerLock?.();
      }
    };
    this.handleCanvasClick = () => {
      if (!this.hasStarted || this.state !== 'playing') return;
      if (!this.isTouchDevice && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock?.();
        return;
      }

      this.playerRaycaster.setFromCamera(this.playerRay, this.camera);
      const candidates = [...this.remotePlayers.values()];
      const hit = this.playerRaycaster.intersectObjects(candidates.map((remote) => remote.player.model), true)[0];
      if (!hit) return;
      const selected = candidates.find((remote) => remote.player.model.getObjectById(hit.object.id));
      if (!selected) return;

      this.pause();
      document.exitPointerLock?.();
      this.onInspectProfile?.(selected.getProfile());
    };
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    document.addEventListener('fullscreenchange', this.handleResize);
    window.addEventListener('keydown', this.handleEscape);
    window.addEventListener('keydown', this.handleCameraToggle);
    window.addEventListener('keydown', this.handleCursorToggle);
    window.addEventListener('keydown', this.handleElevatorKeydown);
    document.addEventListener('pointerlockchange', this.handlePointerLock);
    canvas.addEventListener('click', this.handleCanvasClick);
    this.setState('menu');
    this.animate();
  }

  toggleCameraView() {
    this.cameraRig.firstPerson = !this.cameraRig.firstPerson;
    this.player.model.visible = !this.cameraRig.firstPerson;
  }

  setupElevatorControls() {
    const buttons = this.elevatorControls?.querySelectorAll('[data-floor]') || [];
    for (const button of buttons) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const floorIndex = Number(button.dataset.floor);
        if (this.world.elevator.selectFloor(floorIndex)) {
          this.elevatorFloorStatus.textContent = `ĐANG ĐẾN TẦNG ${floorIndex + 1}`;
        }
      });
    }

    this.handleElevatorKeydown = (event) => {
      if (!this.elevatorControlsOpen || event.repeat) return;
      const match = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (!match) return;
      event.preventDefault();
      const floorIndex = Number(match[1]) - 1;
      if (floorIndex >= mapLayout.floorCount) return;
      if (this.world.elevator.selectFloor(floorIndex)) {
        this.elevatorFloorStatus.textContent = `ĐANG ĐẾN TẦNG ${floorIndex + 1}`;
      }
    };
  }

  updateElevatorControls() {
    const visible = this.state === 'playing'
      && this.world.elevator.hasFloorControls(this.playerController.getPosition());
    const elevator = this.world.elevator;
    this.elevatorControls.hidden = !visible;
    this.elevatorTravelStatus.hidden = this.state !== 'playing' || !elevator.moving;
    if (elevator.moving) {
      const direction = elevator.targetFloor > elevator.currentFloor ? 'ĐANG LÊN' : 'ĐANG XUỐNG';
      this.elevatorTravelStatus.textContent = `${direction} · TẦNG ${elevator.targetFloor + 1}`;
    }
    if (visible && !this.elevatorControlsOpen) {
      this.elevatorControlsOpen = true;
      if (document.pointerLockElement === this.canvas) {
        this.cursorUnlockedByUser = true;
        document.exitPointerLock();
      }
      this.elevatorFloorStatus.textContent = 'CHỌN TẦNG';
    } else if (!visible) {
      this.elevatorControlsOpen = false;
    }
  }

  setupTouchControls() {
    this.touchControls = document.querySelector('#touch-controls');
    if (!this.touchControls) return;
    this.touchControls.hidden = !this.isTouchDevice;

    const joystick = document.querySelector('#touch-joystick');
    const knob = document.querySelector('#touch-joystick-knob');
    let joystickPointer = null;
    const updateJoystick = (event) => {
      const bounds = joystick.getBoundingClientRect();
      const radius = bounds.width * 0.34;
      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      const x = (dx * scale) / radius;
      const y = (dy * scale) / radius;
      this.input.setVirtualMove(x, y);
      knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    };
    const resetJoystick = () => {
      joystickPointer = null;
      this.input.setVirtualMove(0, 0);
      knob.style.transform = 'translate(0, 0)';
    };
    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      joystickPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === joystickPointer) updateJoystick(event);
    });
    joystick.addEventListener('pointerup', (event) => {
      if (event.pointerId === joystickPointer) resetJoystick();
    });
    joystick.addEventListener('pointercancel', resetJoystick);

    const buttonBindings = [
      ['#touch-run', 'ShiftLeft'],
      ['#touch-jump', 'Space'],
      ['#touch-crouch', 'KeyC'],
      ['#touch-interact', 'KeyE'],
    ];
    for (const [selector, code] of buttonBindings) {
      const button = document.querySelector(selector);
      let pointerId = null;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        button.setPointerCapture(pointerId);
        button.classList.add('is-pressed');
        this.input.pressVirtual(code);
      });
      const release = (event) => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        button.classList.remove('is-pressed');
        this.input.releaseVirtual(code);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }

    document.querySelector('#touch-chat').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('game:toggle-chat'));
    });
    document.querySelector('#touch-camera').addEventListener('click', () => {
      if (this.state === 'playing') this.toggleCameraView();
    });
    document.querySelector('#touch-menu').addEventListener('click', () => this.pause());

    let lookPointer = null;
    let previousLook = null;
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.isTouchDevice || event.pointerType !== 'touch' || event.clientX < window.innerWidth * 0.38) return;
      event.preventDefault();
      lookPointer = event.pointerId;
      previousLook = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== lookPointer || !previousLook) return;
      const deltaX = event.clientX - previousLook.x;
      const deltaY = event.clientY - previousLook.y;
      previousLook = { x: event.clientX, y: event.clientY };
      this.cameraRig.rotateBy(deltaX, deltaY, 0.005);
    });
    const stopLook = (event) => {
      if (event.pointerId !== lookPointer) return;
      lookPointer = null;
      previousLook = null;
    };
    this.canvas.addEventListener('pointerup', stopLook);
    this.canvas.addEventListener('pointercancel', stopLook);
  }

  async enterPrison(profile) {
    await this.multiplayer.connect(profile);
    this.play();
  }

  handleWelcome(welcome) {
    this.localPlayerId = welcome.player.id;
    this.playerController.applyServerState(welcome.player);
    this.updatePlayerCount(welcome.count, welcome.capacity);
    const visiblePlayerIds = new Set(welcome.players.map((snapshot) => snapshot.id));
    for (const playerId of this.remotePlayers.keys()) {
      if (!visiblePlayerIds.has(playerId)) this.removeRemotePlayer(playerId);
    }
    if (this.localNameTag) {
      this.localNameTag.removeFromParent();
      this.localNameTag.material.map?.dispose();
      this.localNameTag.material.dispose();
    }
    this.localNameTag = createNameTag(welcome.player.name, welcome.player.inmateCode);
    this.scene.add(this.localNameTag);
    for (const snapshot of welcome.players) this.upsertRemotePlayer(snapshot);
  }

  upsertRemotePlayer(snapshot) {
    if (snapshot.id === this.localPlayerId) return;
    let remote = this.remotePlayers.get(snapshot.id);
    if (!remote) {
      remote = new RemotePlayer(this.scene, snapshot);
      this.remotePlayers.set(snapshot.id, remote);
    } else {
      remote.updateState(snapshot);
    }
  }

  handleRemoteState(snapshot) {
    if (snapshot.id === this.localPlayerId) return;
    this.upsertRemotePlayer(snapshot);
  }

  removeRemotePlayer(playerId) {
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.destroy();
    this.remotePlayers.delete(playerId);
  }

  updatePlayerCount(count, capacity = this.roomCapacity) {
    this.onlineCount = count;
    this.roomCapacity = capacity;
    const countElement = document.querySelector('#online-count');
    if (countElement) countElement.textContent = `${count}/${capacity}`;
  }

  updateNetworkStatus(status, message) {
    const statusElement = document.querySelector('#network-label');
    const indicator = document.querySelector('#network-indicator');
    if (!statusElement || !indicator) return;
    const labels = {
      connecting: 'ĐANG KẾT NỐI',
      connected: 'TRỰC TUYẾN',
      reconnecting: 'ĐANG KẾT NỐI LẠI',
      error: message || 'PHIÊN ĐẦY',
    };
    statusElement.textContent = labels[status] || labels.connecting;
    indicator.dataset.state = status;
  }

  setState(state) {
    this.state = state;
    this.input.enabled = state === 'playing';
    if (this.touchControls) this.touchControls.hidden = !this.isTouchDevice || state !== 'playing';
    if (state !== 'playing') this.input.clear();
    this.onStateChange(state);
  }

  play() {
    this.hasStarted = true;
    this.setState('playing');
    if (!this.isTouchDevice) {
      this.cursorUnlockedByUser = false;
      this.canvas.requestPointerLock?.();
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
  }

  returnToMenu() {
    this.hasStarted = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    if (document.fullscreenElement === this.gameShell) document.exitFullscreen?.();
    this.setState('menu');
  }

  animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') {
      const elevator = this.world.elevator;
      const elevatorWasMoving = elevator.moving;
      const elevatorDeltaY = elevator.update(
        delta,
        this.playerController.getPosition(),
      );
      const elevatorRiding = elevator.riderInside && (elevatorWasMoving || elevator.moving);
      this.playerController.update(
        delta,
        this.cameraRig.yaw,
        elevatorDeltaY,
        elevatorRiding,
      );
      this.doorSystem.update(delta, this.playerController.getPosition(), this.input);
      this.updateElevatorControls();
    } else {
      this.playerController.updateIdle(delta);
      this.updateElevatorControls();
    }
    const animation = this.playerController.interaction?.animation
      || (this.state === 'playing' ? this.playerController.animation : 'idle');
    this.multiplayer.update(delta, {
      position: this.playerController.getPosition(),
      yaw: this.playerController.yaw,
      animation,
    });
    for (const remote of this.remotePlayers.values()) remote.update(delta);
    if (this.localNameTag) {
      const position = this.playerController.getPosition();
      this.localNameTag.position.set(position.x, position.y + 2.12, position.z);
      this.localNameTag.visible = this.state !== 'menu';
      const locationLabel = getLocationLabel(position);
      if (locationLabel !== this.locationLabel && this.locationElement) {
        this.locationLabel = locationLabel;
        this.locationElement.textContent = locationLabel;
      }
    }
    this.cameraRig.update(this.playerController.getPosition(), delta);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    document.removeEventListener('fullscreenchange', this.handleResize);
    window.removeEventListener('keydown', this.handleEscape);
    window.removeEventListener('keydown', this.handleCameraToggle);
    window.removeEventListener('keydown', this.handleCursorToggle);
    window.removeEventListener('keydown', this.handleElevatorKeydown);
    document.removeEventListener('pointerlockchange', this.handlePointerLock);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    if (document.fullscreenElement === this.gameShell) document.exitFullscreen?.();
    this.multiplayer.destroy();
    for (const remote of this.remotePlayers.values()) remote.destroy();
    this.remotePlayers.clear();
    if (this.localNameTag) {
      this.localNameTag.material.map?.dispose();
      this.localNameTag.material.dispose();
      this.localNameTag.removeFromParent();
    }
    this.player.destroy();
    this.renderer.dispose();
    this.physics.destroy();
  }
}