const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { Server } = require('socket.io');
const { ChatStore } = require('./chat-store');
const prisonMap = require('../data/prison-map.json');

const rootDirectory = path.resolve(__dirname, '..');
const frontendDirectory = path.join(rootDirectory, 'frontend');
const builtDirectory = path.join(frontendDirectory, 'dist');
const dataFile = path.join(rootDirectory, 'data', 'site.json');
const port = Number(process.env.PORT) || 3000;
const defaultAllowedOrigins = process.env.NODE_ENV === 'production'
  ? 'https://toiyeuban.onrender.com,https://prison-life-3d.onrender.com'
  : 'https://toiyeuban.onrender.com,http://localhost:5173,http://localhost:3000';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || defaultAllowedOrigins)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));
const connectSources = new Set(["'self'"]);
for (const origin of allowedOrigins) {
  try {
    const url = new URL(origin);
    connectSources.add(url.origin);
    connectSources.add(`${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`);
  } catch {
    console.warn(`Ignoring invalid ALLOWED_ORIGINS entry: ${origin}`);
  }
}
const roomName = 'prison-main';
const roomCapacity = 50;
const reconnectGraceMs = 12000;
const updateIntervalMs = 50;
const maxIncomingEventsPerSecond = 30;
const cellCenters = prisonMap.corridor.cellCenters;
const allowedAnimations = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'sleep', 'toilet']);
const allowedOffenses = new Set([
  'Trộm cắp',
  'Đánh nhau',
  'Buôn lậu',
  'Phá hoại tài sản',
  'Vượt ngục',
  'Cướp tài sản',
  'Vi phạm nội quy nhà tù',
]);
const players = new Map();
let nextInmateNumber = 1;
const chatStore = process.env.DATABASE_URL ? new ChatStore(process.env.DATABASE_URL) : null;
const storeReady = chatStore
  ? chatStore.initialize()
    .then(() => {
      console.log('PostgreSQL storage is ready.');
      return true;
    })
    .catch((error) => {
      console.error('PostgreSQL initialization failed:', error.message);
      return false;
    })
  : Promise.resolve(false);

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function inmateCode(inmateNumber) {
  return `PR${String(inmateNumber).padStart(3, '0')}`;
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function logSecurityEvent(event, details = {}) {
  console.warn(JSON.stringify({ type: 'security', event, ...details, at: new Date().toISOString() }));
}

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src ${[...connectSources].join(' ')}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
  );
  if (request.headers['x-forwarded-proto'] === 'https') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Phương thức không được hỗ trợ.');
    return;
  }

  const pathname = new URL(request.url, 'http://localhost').pathname;

  try {
    if (pathname === '/healthz') {
      const databaseReady = await storeReady;
      const healthy = !chatStore || databaseReady;
      response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable', chat: databaseReady }));
      return;
    }

    if (pathname === '/api/site') {
      const siteData = await fs.readFile(dataFile, 'utf8');
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(siteData);
      return;
    }

    const legacyFiles = {
      '/style.css': path.join(frontendDirectory, 'style.css'),
      '/script.js': path.join(frontendDirectory, 'script.js'),
    };
    const requestedFile = legacyFiles[pathname]
      || path.resolve(builtDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
    const isLegacyFile = Object.hasOwn(legacyFiles, pathname);
    const isInsideBuild = requestedFile.startsWith(`${builtDirectory}${path.sep}`)
      || requestedFile === path.join(builtDirectory, 'index.html');

    if (!isLegacyFile && !isInsideBuild) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Không được phép truy cập tệp này.');
      return;
    }

    const fileContent = await fs.readFile(requestedFile);
    const contentType = contentTypes[path.extname(requestedFile)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(fileContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Không tìm thấy trang.');
      return;
    }

    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Máy chủ gặp lỗi khi xử lý yêu cầu.');
  }
});

const io = new Server(server, {
  cors: { origin: [...allowedOrigins], methods: ['GET', 'POST'] },
  allowRequest(request, callback) {
    const origin = request.headers.origin;
    const allowed = !origin || allowedOrigins.has(origin);
    if (!allowed) logSecurityEvent('socket_origin_rejected', { origin });
    callback(null, allowed);
  },
  pingInterval: 10000,
  pingTimeout: 8000,
});
let pendingNewAdmissions = 0;

function releaseAdmissionReservation(socket) {
  if (!socket.data.admissionReserved) return;
  pendingNewAdmissions = Math.max(0, pendingNewAdmissions - 1);
  socket.data.admissionReserved = false;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    inmateCode: player.inmateCode,
    age: player.profile.age,
    offense: player.profile.offense,
    reason: player.profile.reason,
    position: player.position,
    yaw: player.yaw,
    animation: player.animation,
    area: player.area,
    appearance: player.appearance,
    connected: player.connected,
  };
}

const blockedWords = (process.env.CHAT_BLOCKED_WORDS || '')
  .split(',')
  .map((word) => word.trim())
  .filter(Boolean)
  .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const blockedWordPattern = blockedWords.length
  ? new RegExp(blockedWords.join('|'), 'giu')
  : null;

function sanitizeChatContent(value) {
  if (typeof value !== 'string') return null;
  const content = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!content || Array.from(content).length > 500) return null;
  return blockedWordPattern ? content.replace(blockedWordPattern, '***') : content;
}

function acknowledge(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function connectedPlayerFor(socket) {
  const player = players.get(socket.data.playerId);
  return player?.connected && player.socketId === socket.id ? player : null;
}

function consumeChatRateLimit(player) {
  const now = Date.now();
  player.chatSentAt = (player.chatSentAt || []).filter((timestamp) => now - timestamp < 10000);
  if (player.chatSentAt.length >= 6) return false;
  player.chatSentAt.push(now);
  return true;
}

async function sendChatMessage(socket, payload) {
  const sender = connectedPlayerFor(socket);
  if (!sender) return { ok: false, error: 'Phiên người chơi không hợp lệ.' };
  if (!chatStore) return { ok: false, error: 'Chat chưa sẵn sàng vì chưa cấu hình PostgreSQL.' };
  if (!payload || !['global', 'near', 'private'].includes(payload.type)) {
    return { ok: false, error: 'Loại chat không hợp lệ.' };
  }
  const content = sanitizeChatContent(payload.content);
  if (!content) return { ok: false, error: 'Tin nhắn trống hoặc dài quá 500 ký tự.' };

  let receiver = null;
  let recipients;
  if (payload.type === 'private') {
    if (typeof payload.receiverId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.receiverId)) {
      return { ok: false, error: 'Người nhận không hợp lệ.' };
    }
    receiver = players.get(payload.receiverId);
    if (!receiver?.connected || receiver.id === sender.id) {
      return { ok: false, error: 'Người nhận hiện không trực tuyến.' };
    }
    if (sender.blockedIds?.has(receiver.id) || receiver.blockedIds?.has(sender.id)) {
      return { ok: false, error: 'Không thể gửi tin nhắn cho người chơi này.' };
    }
    recipients = [sender, receiver];
  } else {
    recipients = [...players.values()].filter((candidate) => {
      if (!candidate.connected) return false;
      if (candidate.id === sender.id) return true;
      if (candidate.blockedIds?.has(sender.id)) return false;
      if (payload.type === 'near') {
        const distance = Math.hypot(
          candidate.position.x - sender.position.x,
          candidate.position.y - sender.position.y,
          candidate.position.z - sender.position.z,
        );
        return distance <= 15;
      }
      return true;
    });
  }

  if (!consumeChatRateLimit(sender)) {
    logSecurityEvent('chat_rate_limited', { playerId: sender.id });
    return { ok: false, error: 'Bạn đang gửi tin nhắn quá nhanh.' };
  }

  const message = await chatStore.insertMessage({
    id: randomUUID(),
    senderId: sender.id,
    receiverId: receiver?.id || null,
    roomId: roomName,
    type: payload.type,
    content,
    recipients: payload.type === 'near' ? recipients.map((player) => player.id) : [],
  });
  const publicMessage = {
    ...message,
    senderId: sender.id,
    senderName: sender.name,
    senderInmateCode: sender.inmateCode,
    receiverId: receiver?.id || null,
    type: payload.type,
    status: 'sent',
  };
  for (const recipient of recipients) {
    io.to(recipient.socketId).emit('chat:message', publicMessage);
  }
  return { ok: true, message: publicMessage };
}

async function getChatHistory(socket, payload) {
  const player = connectedPlayerFor(socket);
  if (!player) return { ok: false, error: 'Phiên người chơi không hợp lệ.' };
  if (!chatStore) return { ok: false, error: 'Chat chưa sẵn sàng vì chưa cấu hình PostgreSQL.' };
  if (!payload || !['global', 'near', 'private'].includes(payload.type)) {
    return { ok: false, error: 'Loại lịch sử không hợp lệ.' };
  }
  const peerId = payload.type === 'private' ? payload.peerId : null;
  if (payload.type === 'private'
    && (typeof peerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(peerId) || peerId === player.id)) {
    return { ok: false, error: 'Người chơi không hợp lệ.' };
  }
  const before = payload.before ? new Date(payload.before) : null;
  if (payload.before && !Number.isFinite(before.getTime())) {
    return { ok: false, error: 'Mốc lịch sử không hợp lệ.' };
  }
  const limit = Number.isInteger(payload.limit) ? Math.min(Math.max(payload.limit, 1), 50) : 30;
  const messages = await chatStore.getHistory({
    playerId: player.id,
    peerId,
    roomId: roomName,
    type: payload.type,
    before,
    limit,
  });
  return { ok: true, messages };
}

function sanitizeProfile(profile) {
  const rawName = typeof profile?.name === 'string' ? profile.name : '';
  const name = rawName.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 28);
  const ageValue = Number(profile?.age);
  const age = Number.isInteger(ageValue) && ageValue >= 18 && ageValue <= 99 ? ageValue : 25;
  const rawOffense = typeof profile?.offense === 'string'
    ? profile.offense.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60)
    : '';
  const offense = allowedOffenses.has(rawOffense) ? rawOffense : rawOffense || 'Vi phạm nội quy nhà tù';
  const rawReason = typeof profile?.reason === 'string' ? profile.reason : '';
  const reason = rawReason.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 140);
  return {
    name: name || 'Tù nhân mới',
    age,
    offense,
    reason: reason || 'Hồ sơ nhập vai ban đầu.',
  };
}

function activePlayerCount() {
  let count = 0;
  for (const player of players.values()) {
    if (player.connected) count += 1;
  }
  return count;
}

function allocateSpawn() {
  for (const room of prisonMap.spawn.roomOrder) {
    const centerIndex = Math.floor((room - 1) / 2);
    const side = room % 2 === 0 ? 1 : -1;
    for (const [offsetX, offsetZ] of prisonMap.spawn.offsets) {
      const spawn = {
        x: side * 8.15 + offsetX,
        y: 0.86,
        z: cellCenters[centerIndex] + offsetZ,
      };
      const occupied = [...players.values()].some((player) => (
        Math.hypot(player.position.x - spawn.x, player.position.z - spawn.z) < 1.15
        && Math.abs(player.position.y - spawn.y) < 1.4
      ));
      if (!occupied) return spawn;
    }
  }
  return {
    x: 8.15 + prisonMap.spawn.offsets[0][0],
    y: 0.86,
    z: cellCenters[1] + prisonMap.spawn.offsets[0][1],
  };
}

function getArea(position) {
  const floorIndex = floorIndexFor(position);
  if (floorIndex === 0 && position.z >= prisonMap.corridor.endZ) return 'yard';
  let zone = 'stairwell';
  if (position.z < prisonMap.corridor.endZ && Math.abs(position.x) <= 3.2) {
    zone = 'corridor';
  } else if (position.z < prisonMap.corridor.endZ) {
    zone = 'cell-block';
  } else if (position.x >= prisonMap.elevator.minX && position.x <= prisonMap.elevator.maxX
    && position.z >= prisonMap.elevator.minZ && position.z <= prisonMap.elevator.maxZ) {
    zone = 'elevator';
  } else if (position.z < prisonMap.elevator.minZ - 0.2) {
    zone = 'landing';
  }
  return `floor-${String(floorIndex + 1).padStart(2, '0')}:${zone}`;
}

function floorIndexFor(position) {
  return Math.min(
    Math.max(Math.round((position.y - 0.86) / prisonMap.floorHeight), 0),
    prisonMap.floorCount - 1,
  );
}

function areaRoom(area) {
  return `${roomName}:${area}`;
}

function validPosition(value) {
  const maximumY = (prisonMap.floorCount - 1) * prisonMap.floorHeight + 2.2;
  return value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z)
    && Math.abs(value.x) <= 13.3
    && value.y >= 0.15
    && value.y <= maximumY
    && value.z >= 5.5
    && value.z <= 39.3
    && isWalkablePosition(value);
}

function isElevatorPosition(position) {
  const { elevator } = prisonMap;
  return position.x >= elevator.minX - 0.6
    && position.x <= elevator.maxX + 0.6
    && position.z >= elevator.minZ - 0.55
    && position.z <= elevator.maxZ + 0.55;
}

function isWalkablePosition(position) {
  const { floorHeight, floorCount, corridor, stairs, elevator } = prisonMap;
  const floorIndex = floorIndexFor(position);
  const floorY = floorIndex * floorHeight;
  const supportedOnFloor = Math.abs(position.y - (floorY + 0.86)) <= 1.35;

  if (position.z >= elevator.minZ - 0.55 && position.z <= elevator.maxZ + 0.55
    && position.x >= elevator.minX - 0.6 && position.x <= elevator.maxX + 0.6) {
    return true;
  }

  const stairBaseFloor = Math.min(
    Math.max(Math.floor((position.y - 0.86) / floorHeight), 0),
    floorCount - 2,
  );
  const stairBaseY = stairBaseFloor * floorHeight;
  if (position.x >= stairs.minX + 0.3 && position.x <= stairs.maxX - 0.3
    && position.z >= stairs.startZ - 0.35 && position.z <= stairs.endZ + 0.4
    && position.y >= stairBaseY + 0.55
    && position.y <= stairBaseY + floorHeight + 1.2) {
    return true;
  }

  if (position.z >= corridor.startZ && position.z < corridor.endZ
    && Math.abs(position.x) <= 3.2) {
    return supportedOnFloor;
  }

  const cellCenter = cellCenters.find((center) => Math.abs(position.z - center) <= 1.8);
  if (cellCenter !== undefined && Math.abs(position.x) <= 9.5) {
    if (Math.abs(position.x) < 6
      && Math.abs(position.z - cellCenter) > 0.85) return false;
    return supportedOnFloor;
  }

  if (position.z >= corridor.endZ && position.z < elevator.minZ - 0.2
    && Math.abs(position.x) <= corridor.halfWidth) {
    return supportedOnFloor;
  }

  return floorIndex === 0
    && position.z >= corridor.endZ
    && Math.abs(position.x) <= 13.3
    && supportedOnFloor;
}

function cellIndex(position) {
  if (Math.abs(position.x) < 6 || Math.abs(position.x) > 9.5) return null;
  const index = cellCenters.findIndex((center) => Math.abs(position.z - center) <= 1.8);
  if (index < 0) return null;
  return index;
}

function closeToPosition(position, target, tolerance = 0.36) {
  return Math.hypot(
    position.x - target.x,
    position.y - target.y,
    position.z - target.z,
  ) <= tolerance;
}

function cellInteractionPoints(cell, floorIndex) {
  const center = cellCenters[cell];
  const floorY = floorIndex * prisonMap.floorHeight;
  const beds = [];
  const toilets = [];
  for (const side of [-1, 1]) {
    for (const level of [0.42, 1.62]) {
      const upper = level > 1;
      beds.push({
        bed: { x: side * 8.15, y: floorY + level + 0.32, z: center - 0.95 },
        exit: { x: side * 6.65, y: floorY + 0.86, z: center + (upper ? -0.45 : -1.35) },
      });
    }
    toilets.push({ x: side * 7.35, y: floorY + 0.86, z: center + 1.43 });
  }
  return { beds, toilets };
}

function isCellInteractionMove(current, position, animation) {
  const targetCell = cellIndex(position);
  if (targetCell === null) return false;
  const floorIndex = floorIndexFor(position);
  const { beds, toilets } = cellInteractionPoints(targetCell, floorIndex);

  if (animation === 'sleep') {
    if (current.animation === 'sleep') return beds.some(({ bed }) => closeToPosition(position, bed));
    return beds.some(({ bed, exit }) => (
      closeToPosition(position, bed) && closeToPosition(current.position, exit, 1.9)
    ));
  }

  if (current.animation === 'sleep') {
    return beds.some(({ bed, exit }) => (
      closeToPosition(current.position, bed) && closeToPosition(position, exit)
    ));
  }

  if (animation === 'toilet') {
    return toilets.some((toilet) => (
      closeToPosition(position, toilet) && closeToPosition(current.position, toilet, 2)
    ));
  }

  if (current.animation === 'toilet') {
    return toilets.some((toilet) => (
      closeToPosition(current.position, toilet) && closeToPosition(position, toilet)
    ));
  }
  return false;
}

function emitCount() {
  io.to(roomName).emit('players:count', { count: activePlayerCount(), capacity: roomCapacity });
}

function emitChatRoster() {
  const onlinePlayers = [...players.values()]
    .filter((player) => player.connected)
    .map((player) => ({
      id: player.id,
      name: player.name,
      inmateCode: player.inmateCode,
      connected: true,
      area: player.area,
    }));
  io.to(roomName).emit('chat:roster', onlinePlayers);
}

function removePlayer(player) {
  if (!players.has(player.id) || player.connected) return;
  if (player.cleanupTimer) clearTimeout(player.cleanupTimer);
  players.delete(player.id);
  io.to(areaRoom(player.area)).emit('player:left', { id: player.id });
  emitCount();
  emitChatRoster();
}

io.on('connection', (socket) => {
  void handleSocketConnection(socket)
    .catch((error) => {
      console.error('Socket session setup failed:', error);
      const player = players.get(socket.data.playerId);
      if (player && player.socketId === socket.id) {
        player.connected = false;
        player.cleanupTimer = setTimeout(() => removePlayer(player), reconnectGraceMs);
      }
      socket.emit('session:error', { message: 'Không thể khởi tạo phiên người chơi.' });
      socket.disconnect(true);
    })
    .finally(() => releaseAdmissionReservation(socket));
});

async function handleSocketConnection(socket) {
  let eventWindowStartedAt = Date.now();
  let eventCount = 0;
  let rateLimitViolations = 0;
  let lastSecurityLogAt = 0;
  socket.use(([event], next) => {
    const now = Date.now();
    if (now - eventWindowStartedAt >= 1000) {
      eventWindowStartedAt = now;
      eventCount = 0;
      rateLimitViolations = 0;
    }
    eventCount += 1;
    if (eventCount <= maxIncomingEventsPerSecond) return next();

    rateLimitViolations += 1;
    if (rateLimitViolations === 1) {
      logSecurityEvent('socket_event_rate_limited', { socketId: socket.id, event });
    }
    if (rateLimitViolations >= 5) socket.disconnect(true);
    return next(new Error('Gửi sự kiện quá nhanh.'));
  });

  if (chatStore && !(await storeReady)) {
    socket.emit('session:error', { message: 'Dịch vụ dữ liệu đang tạm thời không sẵn sàng.' });
    socket.disconnect(true);
    return;
  }

  const requestedToken = socket.handshake.auth?.sessionToken;
  const validToken = typeof requestedToken === 'string'
    && /^[A-Za-z0-9_-]{32,128}$/.test(requestedToken);
  const requestedTokenHash = validToken ? hashSessionToken(requestedToken) : null;
  const hasSubmittedProfile = socket.handshake.auth?.profile && typeof socket.handshake.auth.profile === 'object';
  const requestedProfile = sanitizeProfile(socket.handshake.auth?.profile);
  let tokenOwner = requestedTokenHash
    ? [...players.values()].find((candidate) => candidate.sessionTokenHash === requestedTokenHash)
    : null;
  if (tokenOwner?.sessionExpiresAt && tokenOwner.sessionExpiresAt <= Date.now()) {
    logSecurityEvent('expired_session_rejected', { playerId: tokenOwner.id });
    if (tokenOwner.cleanupTimer) clearTimeout(tokenOwner.cleanupTimer);
    if (tokenOwner.connected) io.sockets.sockets.get(tokenOwner.socketId)?.disconnect(true);
    players.delete(tokenOwner.id);
    io.to(areaRoom(tokenOwner.area)).emit('player:left', { id: tokenOwner.id });
    emitCount();
    emitChatRoster();
    tokenOwner = null;
  }
  if (tokenOwner?.connected) {
    logSecurityEvent('active_session_replay_rejected', { playerId: tokenOwner.id, socketId: socket.id });
    socket.emit('session:error', { message: 'Phiên này đang được sử dụng ở một kết nối khác.' });
    socket.disconnect(true);
    return;
  }
  const storedPlayer = !tokenOwner && requestedTokenHash && chatStore
    ? await chatStore.findPlayerBySessionTokenHash(requestedTokenHash)
    : null;
  let player = tokenOwner || null;

  const isReconnect = Boolean(player || storedPlayer);
  if (!isReconnect) {
    if (players.size + pendingNewAdmissions >= roomCapacity) {
      socket.emit('session:error', { message: `Phiên nhà tù đã đủ ${roomCapacity} người.` });
      socket.disconnect(true);
      return;
    }
    pendingNewAdmissions += 1;
    socket.data.admissionReserved = true;
  }

  if (storedPlayer) {
    player = {
      id: storedPlayer.id,
      sessionTokenHash: requestedTokenHash,
      socketId: socket.id,
      name: storedPlayer.name,
      inmateCode: inmateCode(storedPlayer.inmateNumber),
      profile: {
        age: storedPlayer.age,
        offense: storedPlayer.offense,
        reason: storedPlayer.reason,
      },
      position: allocateSpawn(),
      yaw: 0,
      animation: 'idle',
      area: 'yard',
      appearance: { uniform: 'burnt-orange', hair: 'short-dark' },
      role: storedPlayer.role,
      connected: false,
      lastAcceptedAt: Date.now(),
      lastSocketUpdateAt: 0,
      cleanupTimer: null,
    };
    players.set(player.id, player);
  }

  if (player) {
    if (player.cleanupTimer) clearTimeout(player.cleanupTimer);
    player.cleanupTimer = null;
    player.connected = true;
    player.socketId = socket.id;
    player.lastAcceptedAt = Date.now();
    if (hasSubmittedProfile && !chatStore) {
      player.profile = requestedProfile;
      player.name = requestedProfile.name;
    }
  } else {
    const id = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionTokenHash = hashSessionToken(sessionToken);
    const persistedPlayer = chatStore
      ? await chatStore.createGuestPlayer({
        id,
        sessionTokenHash,
        sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        profile: requestedProfile,
      })
      : null;
    const assignedId = persistedPlayer?.id || id;
    const assignedNumber = persistedPlayer?.inmateNumber || nextInmateNumber;
    player = {
      id: assignedId,
      sessionTokenHash,
      sessionToken,
      sessionExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      socketId: socket.id,
      name: requestedProfile.name,
      inmateCode: inmateCode(assignedNumber),
      profile: requestedProfile,
      position: allocateSpawn(),
      yaw: 0,
      animation: 'idle',
      area: 'yard',
      appearance: { uniform: 'burnt-orange', hair: 'short-dark' },
      role: persistedPlayer?.role || 'player',
      connected: true,
      lastAcceptedAt: Date.now(),
      lastSocketUpdateAt: 0,
      cleanupTimer: null,
    };
    if (!persistedPlayer) nextInmateNumber += 1;
    players.set(assignedId, player);
    releaseAdmissionReservation(socket);
  }

  player.area = getArea(player.position);
  socket.data.playerId = player.id;
  player.blockedIds = new Set(chatStore ? await chatStore.getBlockedIds(player.id) : []);
  player.chatSentAt = player.chatSentAt || [];
  socket.join(roomName);
  socket.join(areaRoom(player.area));
  socket.emit('session:welcome', {
    player: publicPlayer(player),
    sessionToken: player.sessionToken || requestedToken,
    blockedPlayerIds: [...player.blockedIds],
    players: [...players.values()]
      .filter((candidate) => candidate.id !== player.id && candidate.area === player.area)
      .map(publicPlayer),
    count: activePlayerCount(),
    capacity: roomCapacity,
    reconnectGraceMs,
    reconnected: isReconnect,
  });
  socket.emit('chat:status', { available: Boolean(chatStore) });

  if (isReconnect) {
    socket.to(areaRoom(player.area)).emit('player:reconnected', publicPlayer(player));
    socket.to(areaRoom(player.area)).emit('player:state', publicPlayer(player));
  } else {
    socket.to(areaRoom(player.area)).emit('player:joined', publicPlayer(player));
  }
  emitCount();
  emitChatRoster();

  socket.on('chat:players', (callback) => {
    const current = connectedPlayerFor(socket);
    if (!current) return acknowledge(callback, { ok: false, error: 'Phiên người chơi không hợp lệ.' });
    const online = [...players.values()]
      .filter((candidate) => candidate.connected)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        inmateCode: candidate.inmateCode,
        connected: true,
        area: candidate.area,
      }));
    acknowledge(callback, { ok: true, players: online });
  });

  socket.on('chat:send', (payload, callback) => {
    void sendChatMessage(socket, payload)
      .then((result) => acknowledge(callback, result))
      .catch((error) => {
        console.error('Chat send failed:', error.message);
        acknowledge(callback, { ok: false, error: 'Không thể gửi tin nhắn lúc này.' });
      });
  });

  socket.on('chat:history', (payload, callback) => {
    void getChatHistory(socket, payload)
      .then((result) => acknowledge(callback, result))
      .catch((error) => {
        console.error('Chat history failed:', error.message);
        acknowledge(callback, { ok: false, error: 'Không thể tải lịch sử chat lúc này.' });
      });
  });

  socket.on('chat:block', (payload, callback) => {
    const current = connectedPlayerFor(socket);
    const targetId = payload?.playerId;
    const blocked = payload?.blocked;
    if (!current || !chatStore || typeof targetId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(targetId) || targetId === current.id || typeof blocked !== 'boolean') {
      return acknowledge(callback, { ok: false, error: 'Yêu cầu chặn người chơi không hợp lệ.' });
    }
    void chatStore.setBlocked(current.id, targetId, blocked)
      .then(() => {
        if (blocked) current.blockedIds.add(targetId);
        else current.blockedIds.delete(targetId);
        acknowledge(callback, { ok: true });
      })
      .catch((error) => {
        console.error('Chat block update failed:', error.message);
        acknowledge(callback, { ok: false, error: 'Không thể cập nhật danh sách chặn.' });
      });
  });

  socket.on('chat:report', (payload, callback) => {
    const current = connectedPlayerFor(socket);
    if (!current || !chatStore || typeof payload?.messageId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(payload.messageId)) {
      return acknowledge(callback, { ok: false, error: 'Yêu cầu báo cáo không hợp lệ.' });
    }
    void chatStore.reportMessage(current.id, payload.messageId)
      .then((reported) => acknowledge(callback, {
        ok: reported,
        error: reported ? undefined : 'Không tìm thấy tin nhắn có thể báo cáo.',
      }))
      .catch((error) => {
        console.error('Chat report failed:', error.message);
        acknowledge(callback, { ok: false, error: 'Không thể gửi báo cáo lúc này.' });
      });
  });

  socket.on('chat:delete-own', (payload, callback) => {
    const current = connectedPlayerFor(socket);
    const messageId = payload?.messageId;
    if (!current || !chatStore || typeof messageId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(messageId)) {
      return acknowledge(callback, { ok: false, error: 'Yêu cầu xóa tin nhắn không hợp lệ.' });
    }
    void chatStore.deleteOwnMessage(current.id, messageId)
      .then(async (message) => {
        if (!message) return acknowledge(callback, { ok: false, error: 'Chỉ có thể xóa tin nhắn của bạn.' });
        let recipientIds;
        if (message.type === 'global') {
          recipientIds = [...players.values()].filter((player) => player.connected).map((player) => player.id);
        } else if (message.type === 'private') {
          recipientIds = [message.senderId, message.receiverId];
        } else {
          recipientIds = await chatStore.getNearRecipients(message.id);
        }
        for (const recipientId of new Set(recipientIds)) {
          const recipient = players.get(recipientId);
          if (recipient?.connected) {
            io.to(recipient.socketId).emit('chat:message-deleted', { id: message.id });
          }
        }
        acknowledge(callback, { ok: true });
      })
      .catch((error) => {
        console.error('Chat message deletion failed:', error.message);
        acknowledge(callback, { ok: false, error: 'Không thể xóa tin nhắn lúc này.' });
      });
  });

  socket.on('player:state', (payload) => {
    const current = players.get(socket.data.playerId);
    if (!current || !current.connected || current.socketId !== socket.id || !payload || typeof payload !== 'object') return;

    const now = Date.now();
    if (now - current.lastSocketUpdateAt < updateIntervalMs) return;
    current.lastSocketUpdateAt = now;

    if (!validPosition(payload.position) || !Number.isFinite(payload.yaw)) {
      if (now - lastSecurityLogAt >= 5000) {
        logSecurityEvent('invalid_player_state', { playerId: current.id, socketId: socket.id });
        lastSecurityLogAt = now;
      }
      socket.emit('player:correction', publicPlayer(current));
      return;
    }

    const animation = allowedAnimations.has(payload.animation) ? payload.animation : 'idle';
    const elapsed = Math.min(Math.max((now - current.lastAcceptedAt) / 1000, 0), 0.5);
    const dx = payload.position.x - current.position.x;
    const dz = payload.position.z - current.position.z;
    const horizontalDistance = Math.hypot(dx, dz);
    const interactionMove = isCellInteractionMove(current, payload.position, animation);
    const elevatorRide = isElevatorPosition(current.position)
      && isElevatorPosition(payload.position);
    const invalidInteractionState = ['sleep', 'toilet'].includes(animation)
      && !interactionMove;
    const speedLimit = animation === 'run' || animation === 'jump' || animation === 'fall'
      ? 6.15
      : animation === 'crouch' ? 1.75 : 3.35;
    const maxDistance = interactionMove ? 2.6 : Math.max(0.42, speedLimit * elapsed + 0.28);
    const maxVerticalDistance = interactionMove
      ? 1.8
      : elevatorRide
        ? Math.max(prisonMap.elevator.speed * elapsed + 0.25, 0.6)
        : Math.max(0.75, 8.5 * elapsed + 0.25);

    if (invalidInteractionState
      || (['sleep', 'toilet'].includes(current.animation)
        && !['sleep', 'toilet'].includes(animation)
        && !interactionMove)
      || horizontalDistance > maxDistance
      || Math.abs(payload.position.y - current.position.y) > maxVerticalDistance) {
      if (now - lastSecurityLogAt >= 5000) {
        logSecurityEvent('player_movement_rejected', {
          playerId: current.id,
          horizontalDistance: Number(horizontalDistance.toFixed(2)),
          elapsed: Number(elapsed.toFixed(2)),
        });
        lastSecurityLogAt = now;
      }
      socket.emit('player:correction', publicPlayer(current));
      return;
    }

    const yaw = ((payload.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const previousArea = current.area;
    const area = getArea(payload.position);
    const changed = horizontalDistance > 0.015
      || Math.abs(payload.position.y - current.position.y) > 0.015
      || Math.abs(yaw - current.yaw) > 0.015
      || animation !== current.animation
      || area !== current.area;

    if (!changed) return;
    current.position = {
      x: payload.position.x,
      y: payload.position.y,
      z: payload.position.z,
    };
    current.yaw = yaw;
    current.animation = animation;
    current.area = area;
    current.lastAcceptedAt = now;
    if (previousArea !== area) {
      socket.leave(areaRoom(previousArea));
      socket.join(areaRoom(area));
      socket.to(areaRoom(previousArea)).emit('player:left', { id: current.id });
      socket.to(areaRoom(area)).emit('player:joined', publicPlayer(current));
      emitChatRoster();
    } else {
      socket.to(areaRoom(area)).volatile.emit('player:state', publicPlayer(current));
    }
  });

  socket.on('disconnect', () => {
    const current = players.get(socket.data.playerId);
    if (!current || current.socketId !== socket.id) return;
    current.connected = false;
    current.cleanupTimer = setTimeout(() => removePlayer(current), reconnectGraceMs);
    io.to(areaRoom(current.area)).emit('player:disconnected', { id: current.id, graceMs: reconnectGraceMs });
    emitCount();
    emitChatRoster();
  });
}

server.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});