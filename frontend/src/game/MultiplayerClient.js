import { io } from 'socket.io-client';

const SEND_INTERVAL = 1 / 15;

function readSessionToken() {
  try {
    return sessionStorage.getItem('prison-life-session') || undefined;
  } catch {
    return undefined;
  }
}

function readSavedProfile() {
  try {
    return JSON.parse(sessionStorage.getItem('prison-life-profile') || 'null') || undefined;
  } catch {
    return undefined;
  }
}

export class MultiplayerClient {
  constructor(handlers, serverUrl) {
    this.handlers = handlers;
    this.socket = io(serverUrl, {
      autoConnect: false,
      auth: { sessionToken: readSessionToken(), profile: readSavedProfile() },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 5000,
    });
    this.elapsed = 0;
    this.lastSent = null;
    this.connected = false;
    this.session = null;
    this.pendingConnect = null;

    this.socket.on('connect', () => {
      this.connected = true;
      this.lastSent = null;
      this.handlers.onStatus('connected');
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.handlers.onStatus('reconnecting');
    });
    this.socket.on('connect_error', () => {
      this.connected = false;
      this.handlers.onStatus('reconnecting');
    });
    this.socket.on('session:welcome', (welcome) => {
      this.session = welcome;
      this.rememberSession(welcome.sessionToken);
      this.handlers.onWelcome(welcome);
      if (this.pendingConnect) {
        clearTimeout(this.pendingConnect.timer);
        this.pendingConnect.resolve(welcome);
        this.pendingConnect = null;
      }
    });
    this.socket.on('session:error', (error) => {
      this.handlers.onError(error.message);
      if (this.pendingConnect) {
        clearTimeout(this.pendingConnect.timer);
        this.pendingConnect.reject(new Error(error.message));
        this.pendingConnect = null;
      }
    });
    this.socket.on('player:joined', (player) => this.handlers.onJoined(player));
    this.socket.on('player:reconnected', (player) => this.handlers.onJoined(player));
    this.socket.on('player:state', (player) => this.handlers.onState(player));
    this.socket.on('player:disconnected', (event) => this.handlers.onDisconnected(event));
    this.socket.on('player:left', (event) => this.handlers.onLeft(event.id));
    this.socket.on('players:count', (event) => this.handlers.onCount(event));
    this.socket.on('player:correction', (state) => this.handlers.onCorrection(state));
  }

  rememberSession(token) {
    if (typeof token === 'string') this.socket.auth.sessionToken = token;
    if (!this.session?.player) return;
    const profile = {
      name: this.session.player.name,
      age: this.session.player.age,
      offense: this.session.player.offense,
      reason: this.session.player.reason,
    };
    try {
      if (typeof token === 'string') sessionStorage.setItem('prison-life-session', token);
      sessionStorage.setItem('prison-life-profile', JSON.stringify(profile));
    } catch {
      this.profile = profile;
    }
  }

  connect(profile) {
    if (this.socket.connected && this.session) return Promise.resolve(this.session);
    if (this.pendingConnect) return this.pendingConnect.promise;
    const submittedProfile = profile || readSavedProfile();
    this.socket.auth = {
      sessionToken: readSessionToken(),
      profile: submittedProfile,
    };
    this.handlers.onStatus('connecting');

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingConnect = null;
        reject(new Error('Kết nối máy chủ quá thời gian. Hãy thử lại.'));
      }, 12000);
      this.pendingConnect = { resolve, reject, timer, promise: null };
    });
    this.pendingConnect.promise = promise;
    this.socket.connect();
    return promise;
  }

  update(delta, state) {
    this.elapsed += delta;
    if (!this.connected || this.elapsed < SEND_INTERVAL) return;
    this.elapsed %= SEND_INTERVAL;

    const snapshot = {
      position: {
        x: state.position.x,
        y: state.position.y,
        z: state.position.z,
      },
      yaw: state.yaw,
      animation: state.animation,
    };
    if (this.lastSent) {
      const dx = snapshot.position.x - this.lastSent.position.x;
      const dy = snapshot.position.y - this.lastSent.position.y;
      const dz = snapshot.position.z - this.lastSent.position.z;
      const yawDelta = Math.abs(snapshot.yaw - this.lastSent.yaw);
      if (dx * dx + dy * dy + dz * dz < 0.0009
        && yawDelta < 0.025
        && snapshot.animation === this.lastSent.animation) return;
    }

    this.lastSent = snapshot;
    this.socket.volatile.emit('player:state', snapshot);
  }

  destroy() {
    if (this.pendingConnect) {
      clearTimeout(this.pendingConnect.timer);
      this.pendingConnect.reject(new Error('Kết nối đã đóng.'));
      this.pendingConnect = null;
    }
    this.socket.disconnect();
    this.socket.removeAllListeners();
  }
}