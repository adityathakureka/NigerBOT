const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Initial Database Structure
const initialData = {
  teams: [
    { id: 'team-general', name: 'Desktop Workspace', description: 'Main organization team for connected desktops' }
  ],
  channels: [
    { id: 'chan-general', teamId: 'team-general', name: 'general', topic: 'General discussion for all connected desktops', isDefault: true },
    { id: 'chan-announcements', teamId: 'team-general', name: 'announcements', topic: 'Company and team notices', isDefault: false },
    { id: 'chan-dev', teamId: 'team-general', name: 'dev-chat', topic: 'Tech discussion, code snippets & troubleshooting', isDefault: false },
    { id: 'chan-random', teamId: 'team-general', name: 'random', topic: 'Casual coffee-break and watercooler chats', isDefault: false }
  ],
  users: {},
  messages: [
    {
      id: 'msg-welcome',
      channelId: 'chan-general',
      userId: 'system',
      userName: 'Teams Bot',
      userAvatar: '🤖',
      content: '👋 Welcome to **Teams LAN Chat**! Any desktop on your Wi-Fi network can connect to this chat room via your local IP. Feel free to send messages, share files, record voice notes, or start a video call!',
      timestamp: Date.now(),
      reactions: { '👍': ['system'] },
      threads: []
    }
  ]
};

// Load or Initialize DB
let db = initialData;
try {
  if (fs.existsSync(DB_FILE)) {
    const fileContent = fs.readFileSync(DB_FILE, 'utf8');
    db = JSON.parse(fileContent);
    // Ensure all required collections exist
    if (!db.teams) db.teams = initialData.teams;
    if (!db.channels) db.channels = initialData.channels;
    if (!db.users) db.users = {};
    if (!db.messages) db.messages = initialData.messages;
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
} catch (e) {
  console.error('Error loading DB, using defaults:', e);
  db = initialData;
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

// Get Local Network IP addresses
function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip'
};

// Parse multipart/form-data for file uploads without external libraries
function parseMultipart(req, boundary, callback) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const boundaryBuf = Buffer.from('--' + boundary);
    let start = 0;
    const parts = [];

    while (start < buffer.length) {
      const idx = buffer.indexOf(boundaryBuf, start);
      if (idx === -1) break;
      if (start > 0) {
        // We have a part between (start) and (idx - 2) for CRLF
        parts.push(buffer.slice(start, idx - 2));
      }
      start = idx + boundaryBuf.length + 2; // skip boundary and \r\n
    }

    const files = [];
    const fields = {};

    for (const part of parts) {
      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd === -1) continue;
      const headerStr = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);

      const dispMatch = headerStr.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
      if (dispMatch) {
        const fieldName = dispMatch[1];
        const fileName = dispMatch[2];
        if (fileName) {
          const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
          const mime = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
          files.push({ fieldName, fileName, mime, data: body });
        } else {
          fields[fieldName] = body.toString('utf8');
        }
      }
    }
    callback(null, { fields, files });
  });
  req.on('error', err => callback(err));
}

// Password hashing helper using standard node:crypto
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

// Generate simple secure session tokens
function generateToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, expires: Date.now() + 30 * 86400000 })).toString('base64');
  const sig = crypto.createHmac('sha256', 'teams-lan-secret-key').update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', 'teams-lan-secret-key').update(payload).digest('hex');
  if (sig !== expectedSig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (data.expires < Date.now()) return null;
    return data.userId;
  } catch (e) {
    return null;
  }
}

// HTTP Server
const server = http.createServer((req, res) => {
  // CORS Headers for LAN flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    // 0. Authentication Endpoints
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { username, password, name, avatar } = JSON.parse(body);
          if (!username || !password || !name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Username, password, and display name are required' }));
          }

          const cleanUsername = username.trim().toLowerCase();
          // Check if username already exists
          const existing = Object.values(db.users).find(u => u.username && u.username.toLowerCase() === cleanUsername);
          if (existing) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Username already taken. Please log in or choose another.' }));
          }

          const userId = 'user-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
          const user = {
            id: userId,
            username: cleanUsername,
            name: name.trim(),
            avatar: avatar || '💻',
            passwordHash: hashPassword(password),
            status: 'online',
            createdAt: Date.now(),
            lastSeen: Date.now()
          };

          db.users[userId] = user;
          saveDb();

          const token = generateToken(userId);
          const safeUser = { id: user.id, username: user.username, name: user.name, avatar: user.avatar, status: user.status };
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token, user: safeUser }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { username, password } = JSON.parse(body);
          if (!username || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Username and password are required' }));
          }

          const cleanUsername = username.trim().toLowerCase();
          const user = Object.values(db.users).find(u => u.username && u.username.toLowerCase() === cleanUsername);
          if (!user || !verifyPassword(password, user.passwordHash)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid username or password' }));
          }

          user.status = 'online';
          user.lastSeen = Date.now();
          saveDb();

          const token = generateToken(user.id);
          const safeUser = { id: user.id, username: user.username, name: user.name, avatar: user.avatar, status: user.status };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token, user: safeUser }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace('Bearer ', '').trim();
      const userId = verifyToken(token);
      if (!userId || !db.users[userId]) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      const u = db.users[userId];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: { id: u.id, username: u.username, name: u.name, avatar: u.avatar, status: u.status } }));
      return;
    }
    // 1. Network Info Endpoint
    if (pathname === '/api/info' && req.method === 'GET') {
      const ips = getLocalNetworkAddresses();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        port: PORT,
        localIPs: ips,
        lanUrls: ips.map(ip => `http://${ip}:${PORT}`),
        activeUsersCount: Object.keys(clients).length,
        hostname: os.hostname()
      }));
      return;
    }

    // 2. Initial Data Sync
    if (pathname === '/api/sync' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        teams: db.teams,
        channels: db.channels,
        users: db.users,
        messages: db.messages.slice(-200) // latest 200 messages
      }));
      return;
    }

    // 3. Create Channel
    if (pathname === '/api/channels' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Channel name is required' }));
          }
          const cleanName = data.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30);
          const channel = {
            id: 'chan-' + Date.now(),
            teamId: data.teamId || 'team-general',
            name: cleanName,
            topic: data.topic || 'General conversation',
            isDefault: false
          };
          db.channels.push(channel);
          saveDb();
          broadcast({ type: 'channel_created', channel });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(channel));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // 4. File Upload (Images, Voice Notes, Documents)
    if (pathname === '/api/upload' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
        if (!boundaryMatch) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No multipart boundary' }));
        }
        const boundary = boundaryMatch[1].trim();
        parseMultipart(req, boundary, (err, { files }) => {
          if (err || !files || files.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Upload failed or no file attached' }));
          }
          const file = files[0];
          const ext = path.extname(file.fileName) || (file.mime.includes('audio') ? '.webm' : '.bin');
          const safeName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
          const targetPath = path.join(UPLOAD_DIR, safeName);
          fs.writeFileSync(targetPath, file.data);

          const fileUrl = `/uploads/${safeName}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            url: fileUrl,
            fileName: file.fileName,
            fileSize: file.data.length,
            fileType: file.mime
          }));
        });
        return;
      } else {
        // Raw binary upload (e.g. direct voice note audio/webm)
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const ext = req.headers['x-file-ext'] || '.webm';
          const originalName = req.headers['x-file-name'] || 'voice-note.webm';
          const safeName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
          const targetPath = path.join(UPLOAD_DIR, safeName);
          fs.writeFileSync(targetPath, buffer);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            url: `/uploads/${safeName}`,
            fileName: originalName,
            fileSize: buffer.length,
            fileType: req.headers['content-type'] || 'audio/webm'
          }));
        });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
    return;
  }

  // Static File Serving from /public
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA behavior or 404
      if (!path.extname(safePath)) {
        const indexHtml = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(indexHtml)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return fs.createReadStream(indexHtml).pipe(res);
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ==========================================
// PURE NODE.JS WEBSOCKET SERVER (RFC 6455)
// ==========================================
const clients = new Map(); // socket -> { userId, userName, userAvatar, status, currentRoom, ip }

server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request');
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.end('HTTP/1.1 400 Bad Request');
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ];

  socket.write(headers.join('\r\n'));

  // Frame decoding state
  let buffer = Buffer.alloc(0);
  const clientInfo = {
    socket,
    userId: null,
    userName: 'Anonymous Desktop',
    userAvatar: '💻',
    status: 'online',
    currentRoom: 'chan-general',
    ip: req.socket.remoteAddress
  };
  clients.set(socket, clientInfo);

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const byte1 = buffer[0];
      const byte2 = buffer[1];

      const fin = (byte1 & 0x80) !== 0;
      const opcode = byte1 & 0x0f;
      const isMasked = (byte2 & 0x80) !== 0;
      let payloadLen = byte2 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < offset + 2) break;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) break;
        // High 32-bits ignored for normal sizes
        payloadLen = buffer.readUInt32BE(offset + 4);
        offset += 8;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) break;

      const payload = buffer.slice(offset, offset + payloadLen);
      buffer = buffer.slice(offset + payloadLen);

      // Unmask
      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Handle Opcodes
      if (opcode === 0x08) {
        // Close frame
        socket.end();
        break;
      } else if (opcode === 0x09) {
        // Ping -> Pong
        sendRawFrame(socket, 0x0a, payload);
      } else if (opcode === 0x01) {
        // Text frame
        try {
          const str = payload.toString('utf8');
          const msg = JSON.parse(str);
          handleClientMessage(socket, clientInfo, msg);
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      }
    }
  });

  socket.on('close', () => {
    handleClientDisconnect(socket);
  });

  socket.on('error', err => {
    console.error('Socket error:', err.message);
    handleClientDisconnect(socket);
  });
});

// Encode & Send WebSocket Frame
function sendRawFrame(socket, opcode, payloadBuffer) {
  if (!socket.writable) return;
  const len = payloadBuffer.length;
  let header;

  if (len <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }

  socket.write(Buffer.concat([header, payloadBuffer]));
}

function sendWs(socket, data) {
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  sendRawFrame(socket, 0x01, payload);
}

function broadcast(data, excludeSocket = null) {
  for (const [s] of clients) {
    if (s !== excludeSocket) {
      sendWs(s, data);
    }
  }
}

function broadcastOnlineUsers() {
  const userMap = {};
  for (const [_, client] of clients) {
    if (client.userId) {
      userMap[client.userId] = {
        id: client.userId,
        name: client.userName,
        avatar: client.userAvatar,
        status: client.status,
        currentRoom: client.currentRoom,
        ip: client.ip
      };
    }
  }
  broadcast({ type: 'presence_update', users: userMap });
}

// WebSocket Message Dispatcher
function handleClientMessage(socket, client, msg) {
  switch (msg.type) {
    // 1. Handshake / Identify User
    case 'identify': {
      client.userId = msg.userId || 'user-' + Date.now();
      client.userName = msg.userName || 'Desktop User';
      client.userAvatar = msg.userAvatar || '💻';
      client.status = msg.status || 'online';
      client.currentRoom = msg.currentRoom || 'chan-general';

      // Save or update in DB
      db.users[client.userId] = {
        id: client.userId,
        name: client.userName,
        avatar: client.userAvatar,
        status: client.status,
        lastSeen: Date.now()
      };
      saveDb();

      // Welcome acknowledgment
      sendWs(socket, {
        type: 'identified',
        userId: client.userId,
        channels: db.channels,
        teams: db.teams
      });

      broadcastOnlineUsers();

      // Broadcast login popup alert to all other desktops
      broadcast({
        type: 'user_login_alert',
        user: {
          id: client.userId,
          name: client.userName,
          avatar: client.userAvatar,
          ip: client.ip
        }
      }, socket);
      break;
    }

    // 2. Status Change (Available, Busy, Away)
    case 'set_status': {
      client.status = msg.status || 'online';
      if (db.users[client.userId]) {
        db.users[client.userId].status = client.status;
        saveDb();
      }
      broadcastOnlineUsers();
      break;
    }

    // 3. Send Message (Channel or Direct Message)
    case 'send_message': {
      if (!msg.content && !msg.attachment && !msg.voiceNote) return;

      const newMsg = {
        id: 'msg-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex'),
        channelId: msg.channelId || null,
        recipientId: msg.recipientId || null, // for 1:1 direct messages
        userId: client.userId,
        userName: client.userName,
        userAvatar: client.userAvatar,
        content: msg.content || '',
        attachment: msg.attachment || null, // { url, fileName, fileSize, fileType }
        voiceNote: msg.voiceNote || null, // { url, duration }
        timestamp: Date.now(),
        reactions: {},
        threads: []
      };

      db.messages.push(newMsg);
      // Keep recent 2000 messages
      if (db.messages.length > 2000) db.messages.shift();
      saveDb();

      if (newMsg.recipientId) {
        // Direct message: send to recipient and back to sender
        for (const [s, c] of clients) {
          if (c.userId === newMsg.recipientId || c.userId === client.userId) {
            sendWs(s, { type: 'new_message', message: newMsg });
          }
        }
      } else {
        // Channel message: broadcast to all
        broadcast({ type: 'new_message', message: newMsg });
      }
      break;
    }

    // 4. Thread Reply
    case 'thread_reply': {
      const parent = db.messages.find(m => m.id === msg.parentId);
      if (!parent) return;

      const reply = {
        id: 'reply-' + Date.now(),
        userId: client.userId,
        userName: client.userName,
        userAvatar: client.userAvatar,
        content: msg.content,
        timestamp: Date.now()
      };

      if (!parent.threads) parent.threads = [];
      parent.threads.push(reply);
      saveDb();

      broadcast({
        type: 'thread_reply_added',
        parentId: parent.id,
        reply,
        threadsCount: parent.threads.length
      });
      break;
    }

    // 5. Toggle Emoji Reaction
    case 'react': {
      const target = db.messages.find(m => m.id === msg.messageId);
      if (!target) return;

      if (!target.reactions) target.reactions = {};
      const emoji = msg.emoji;
      if (!target.reactions[emoji]) target.reactions[emoji] = [];

      const idx = target.reactions[emoji].indexOf(client.userId);
      if (idx === -1) {
        target.reactions[emoji].push(client.userId);
      } else {
        target.reactions[emoji].splice(idx, 1);
        if (target.reactions[emoji].length === 0) {
          delete target.reactions[emoji];
        }
      }
      saveDb();

      broadcast({
        type: 'reaction_updated',
        messageId: target.id,
        reactions: target.reactions
      });
      break;
    }

    // 6. Typing Indicators
    case 'typing': {
      broadcast({
        type: 'user_typing',
        userId: client.userId,
        userName: client.userName,
        channelId: msg.channelId,
        recipientId: msg.recipientId,
        isTyping: !!msg.isTyping
      }, socket);
      break;
    }

    // 7. WebRTC Audio / Video Call Signaling
    // Supports 1:1 and room calls across desktops on the Wi-Fi!
    case 'call_offer':
    case 'call_answer':
    case 'call_ice_candidate':
    case 'call_hangup':
    case 'call_reject': {
      const targetUserId = msg.targetUserId;
      const targetRoomId = msg.targetRoomId;

      if (targetUserId) {
        // Direct call signaling to specific user
        for (const [s, c] of clients) {
          if (c.userId === targetUserId) {
            sendWs(s, {
              type: msg.type,
              fromUserId: client.userId,
              fromUserName: client.userName,
              fromUserAvatar: client.userAvatar,
              sdp: msg.sdp,
              candidate: msg.candidate,
              callType: msg.callType || 'video'
            });
          }
        }
      } else if (targetRoomId) {
        // Room/Channel call signaling to other participants
        for (const [s, c] of clients) {
          if (s !== socket) {
            sendWs(s, {
              type: msg.type,
              targetRoomId,
              fromUserId: client.userId,
              fromUserName: client.userName,
              fromUserAvatar: client.userAvatar,
              sdp: msg.sdp,
              candidate: msg.candidate,
              callType: msg.callType || 'video'
            });
          }
        }
      }
      break;
    }
  }
}

function handleClientDisconnect(socket) {
  const client = clients.get(socket);
  if (client) {
    if (client.userId && db.users[client.userId]) {
      db.users[client.userId].status = 'offline';
      db.users[client.userId].lastSeen = Date.now();
      saveDb();
    }
    clients.delete(socket);
    broadcastOnlineUsers();
  }
}

// Start Server on 0.0.0.0 (all LAN interfaces)
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalNetworkAddresses();
  console.log('\n========================================================');
  console.log('🚀 TEAMS LAN CHAT SERVER RUNNING');
  console.log('========================================================');
  console.log(`Local Access:   http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`Wi-Fi / LAN IP: http://${ip}:${PORT}`);
  });
  console.log('========================================================');
  console.log('Open this link on any desktop computer on your Wi-Fi!');
  console.log('========================================================\n');
});
