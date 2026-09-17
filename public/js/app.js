/* =========================================================
   TEAMS LAN CHAT - CLIENT APPLICATION LOGIC
   ========================================================= */

(function () {
  'use strict';

  // State Management
  const state = {
    currentUser: null,
    currentRoomType: 'channel', // 'channel' or 'dm'
    activeChannelId: 'chan-general',
    activeDmUserId: null,
    activeThreadParentId: null,
    channels: [],
    users: {},
    messages: [],
    pendingAttachment: null,
    ws: null,
    reconnectTimer: null,
    typingTimer: null,
    isTyping: false,
    audioRecorder: null,
    recordedAudioChunks: [],
    recordingTimerInterval: null,
    recordingStartTime: null,
    // WebRTC Call State
    peerConnection: null,
    localStream: null,
    activeCallTarget: null,
    isCallActive: false,
    callTimerInterval: null,
    callStartTime: null
  };

  const AVATAR_PRESETS = ['💻', '🚀', '🤖', '🐱', '🦊', '⚡', '☕', '🎮', '🎨', '🔬', '🎧', '💼'];

  // DOM Elements
  const el = {
    // Rail
    railTabTeams: document.getElementById('railTabTeams'),
    railTabChat: document.getElementById('railTabChat'),
    railTabCalls: document.getElementById('railTabCalls'),
    railLanShare: document.getElementById('railLanShare'),
    railUserBtn: document.getElementById('railUserBtn'),
    railUserAvatar: document.getElementById('railUserAvatar'),
    railStatusDot: document.getElementById('railStatusDot'),

    // Sidebar
    sidebarUserAvatar: document.getElementById('sidebarUserAvatar'),
    sidebarStatusDot: document.getElementById('sidebarStatusDot'),
    sidebarUserName: document.getElementById('sidebarUserName'),
    sidebarStatusText: document.getElementById('sidebarStatusText'),
    statusDropdownToggle: document.getElementById('statusDropdownToggle'),
    statusMenu: document.getElementById('statusMenu'),
    editProfileBtn: document.getElementById('editProfileBtn'),
    lanIpAddress: document.getElementById('lanIpAddress'),
    btnCopyIp: document.getElementById('btnCopyIp'),
    searchInput: document.getElementById('searchInput'),
    channelList: document.getElementById('channelList'),
    dmList: document.getElementById('dmList'),
    btnAddChannel: document.getElementById('btnAddChannel'),
    onlineUsersCount: document.getElementById('onlineUsersCount'),

    // Chat Main
    chatHeader: document.getElementById('chatHeader'),
    headerIcon: document.getElementById('headerIcon'),
    headerTitle: document.getElementById('headerTitle'),
    headerTopic: document.getElementById('headerTopic'),
    btnMeetNow: document.getElementById('btnMeetNow'),
    btnAudioCall: document.getElementById('btnAudioCall'),
    messageStream: document.getElementById('messageStream'),
    messagesLoading: document.getElementById('messagesLoading'),
    typingBar: document.getElementById('typingBar'),
    typingText: document.getElementById('typingText'),

    // Composer
    messageInput: document.getElementById('messageInput'),
    btnSendMessage: document.getElementById('btnSendMessage'),
    btnAttachFile: document.getElementById('btnAttachFile'),
    filePicker: document.getElementById('filePicker'),
    btnVoiceNote: document.getElementById('btnVoiceNote'),
    attachmentPreviewBar: document.getElementById('attachmentPreviewBar'),
    previewFileName: document.getElementById('previewFileName'),
    btnRemoveAttach: document.getElementById('btnRemoveAttach'),
    voiceRecordingBar: document.getElementById('voiceRecordingBar'),
    recTimer: document.getElementById('recTimer'),
    btnCancelRec: document.getElementById('btnCancelRec'),
    btnSendRec: document.getElementById('btnSendRec'),
    toolBold: document.getElementById('toolBold'),
    toolItalic: document.getElementById('toolItalic'),
    toolCode: document.getElementById('toolCode'),
    toolLink: document.getElementById('toolLink'),
    toolEmoji: document.getElementById('toolEmoji'),

    // Thread Panel
    threadPanel: document.getElementById('threadPanel'),
    btnCloseThread: document.getElementById('btnCloseThread'),
    threadParentMsg: document.getElementById('threadParentMsg'),
    threadRepliesList: document.getElementById('threadRepliesList'),
    threadInput: document.getElementById('threadInput'),
    btnSendThreadReply: document.getElementById('btnSendThreadReply'),

    // Modals & Auth
    modalChannel: document.getElementById('modalChannel'),
    formCreateChannel: document.getElementById('formCreateChannel'),
    newChanName: document.getElementById('newChanName'),
    newChanTopic: document.getElementById('newChanTopic'),
    btnCloseModalChannel: document.getElementById('btnCloseModalChannel'),
    btnCancelModalChannel: document.getElementById('btnCancelModalChannel'),

    modalAuth: document.getElementById('modalAuth'),
    tabBtnLogin: document.getElementById('tabBtnLogin'),
    tabBtnRegister: document.getElementById('tabBtnRegister'),
    formLogin: document.getElementById('formLogin'),
    formRegister: document.getElementById('formRegister'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    regName: document.getElementById('regName'),
    regUsername: document.getElementById('regUsername'),
    regPassword: document.getElementById('regPassword'),
    authErrorMsg: document.getElementById('authErrorMsg'),
    linkGoToRegister: document.getElementById('linkGoToRegister'),
    linkGoToLogin: document.getElementById('linkGoToLogin'),
    avatarPickerGrid: document.getElementById('avatarPickerGrid'),

    // Dropdown extras & Popups
    btnToggleDesktopNotify: document.getElementById('btnToggleDesktopNotify'),
    textDesktopNotify: document.getElementById('textDesktopNotify'),
    btnLogout: document.getElementById('btnLogout'),
    popupContainer: document.getElementById('popupContainer'),

    // Calls
    callOverlay: document.getElementById('callOverlay'),
    callRoomName: document.getElementById('callRoomName'),
    callDuration: document.getElementById('callDuration'),
    remoteVideo: document.getElementById('remoteVideo'),
    localVideo: document.getElementById('localVideo'),
    remotePlaceholder: document.getElementById('remotePlaceholder'),
    remoteAvatar: document.getElementById('remoteAvatar'),
    remoteUserName: document.getElementById('remoteUserName'),
    localPlaceholder: document.getElementById('localPlaceholder'),
    btnToggleMic: document.getElementById('btnToggleMic'),
    btnToggleCam: document.getElementById('btnToggleCam'),
    btnShareScreen: document.getElementById('btnShareScreen'),
    btnEndCall: document.getElementById('btnEndCall'),

    incomingCallToast: document.getElementById('incomingCallToast'),
    incomingAvatar: document.getElementById('incomingAvatar'),
    incomingCallerName: document.getElementById('incomingCallerName'),
    btnAcceptCall: document.getElementById('btnAcceptCall'),
    btnDeclineCall: document.getElementById('btnDeclineCall'),

    toastMessage: document.getElementById('toastMessage')
  };

  // ==========================================
  // AUDIO SYNTHESIZER (Web Audio API)
  // ==========================================
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) { }
  }

  function playRingTone() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(480, now + 0.1);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) { }
  }

  // ==========================================
  // INITIALIZATION & USER SETUP
  // ==========================================
  function init() {
    loadUser();
    setupAvatarPicker();
    setupEventListeners();
    fetchNetworkInfo();
    fetchInitialSync();
    connectWebSocket();
  }

  function loadUser() {
    const saved = localStorage.getItem('teams_user');
    if (saved) {
      try {
        state.currentUser = JSON.parse(saved);
        updateUserUI();
      } catch (e) {
        promptUserSetup();
      }
    } else {
      promptUserSetup();
    }
  }

  function promptUserSetup() {
    el.modalProfile.classList.remove('hidden');
    el.userNameInput.value = state.currentUser ? state.currentUser.name : '';
  }

  function setupAvatarPicker() {
    el.avatarPickerGrid.innerHTML = '';
    let selectedAvatar = (state.currentUser && state.currentUser.avatar) || AVATAR_PRESETS[0];

    AVATAR_PRESETS.forEach(avatar => {
      const div = document.createElement('div');
      div.className = 'avatar-choice' + (avatar === selectedAvatar ? ' selected' : '');
      div.textContent = avatar;
      div.onclick = () => {
        document.querySelectorAll('.avatar-choice').forEach(d => d.classList.remove('selected'));
        div.classList.add('selected');
        selectedAvatar = avatar;
      };
      el.avatarPickerGrid.appendChild(div);
    });

    el.formProfile.onsubmit = (e) => {
      e.preventDefault();
      const name = el.userNameInput.value.trim();
      if (!name) return;

      const sel = document.querySelector('.avatar-choice.selected');
      const avatar = sel ? sel.textContent : '💻';

      if (!state.currentUser) {
        state.currentUser = {
          id: 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          name,
          avatar,
          status: 'online'
        };
      } else {
        state.currentUser.name = name;
        state.currentUser.avatar = avatar;
      }

      localStorage.setItem('teams_user', JSON.stringify(state.currentUser));
      updateUserUI();
      el.modalProfile.classList.add('hidden');

      // Identify on WebSocket
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        sendWs({
          type: 'identify',
          userId: state.currentUser.id,
          userName: state.currentUser.name,
          userAvatar: state.currentUser.avatar,
          status: state.currentUser.status
        });
      }
    };
  }

  function updateUserUI() {
    if (!state.currentUser) return;
    el.sidebarUserAvatar.textContent = state.currentUser.avatar;
    el.railUserAvatar.textContent = state.currentUser.avatar;
    el.sidebarUserName.textContent = state.currentUser.name;
    setStatusUI(state.currentUser.status || 'online');
  }

  function setStatusUI(status) {
    const map = { online: 'Available', busy: 'Busy', away: 'Away' };
    el.sidebarStatusText.textContent = map[status] || 'Available';

    const classes = ['status-online', 'status-busy', 'status-away', 'status-offline'];
    classes.forEach(c => {
      el.sidebarStatusDot.classList.remove(c);
      el.railStatusDot.classList.remove(c);
    });

    const targetClass = 'status-' + status;
    el.sidebarStatusDot.classList.add(targetClass);
    el.railStatusDot.classList.add(targetClass);
  }

  // ==========================================
  // SERVER NETWORK INFO & SYNC
  // ==========================================
  async function fetchNetworkInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const info = await res.json();
        if (info.lanUrls && info.lanUrls.length > 0) {
          el.lanIpAddress.textContent = info.lanUrls[0];
        } else {
          el.lanIpAddress.textContent = `http://${location.hostname}:${info.port || 3000}`;
        }
      }
    } catch (e) {
      el.lanIpAddress.textContent = `http://${location.host}`;
    }
  }

  async function fetchInitialSync() {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        state.channels = data.channels || [];
        state.users = data.users || {};
        state.messages = data.messages || [];
        renderChannels();
        renderDms();
        renderMessages();
      }
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      el.messagesLoading.classList.add('hidden');
    }
  }

  // ==========================================
  // WEBSOCKET REAL-TIME CONNECTION
  // ==========================================
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      console.log('Connected to Teams LAN server');
      if (state.currentUser) {
        sendWs({
          type: 'identify',
          userId: state.currentUser.id,
          userName: state.currentUser.name,
          userAvatar: state.currentUser.avatar,
          status: state.currentUser.status || 'online',
          currentRoom: state.activeChannelId
        });
      }
    };

    state.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingWs(msg);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    state.ws.onclose = () => {
      console.warn('WebSocket disconnected, retrying in 2.5s...');
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 2500);
    };

    state.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  function sendWs(data) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(data));
    }
  }

  function handleIncomingWs(msg) {
    switch (msg.type) {
      case 'identified':
        if (msg.channels) {
          state.channels = msg.channels;
          renderChannels();
        }
        break;

      case 'presence_update':
        state.users = msg.users || {};
        renderDms();
        break;

      case 'channel_created':
        state.channels.push(msg.channel);
        renderChannels();
        showToast(`New channel created: #${msg.channel.name}`);
        break;

      case 'new_message': {
        state.messages.push(msg.message);
        const m = msg.message;
        const isCurrentChannel = state.currentRoomType === 'channel' && m.channelId === state.activeChannelId;
        const isCurrentDm = state.currentRoomType === 'dm' &&
          ((m.userId === state.activeDmUserId && m.recipientId === state.currentUser.id) ||
           (m.userId === state.currentUser.id && m.recipientId === state.activeDmUserId));

        if (isCurrentChannel || isCurrentDm) {
          appendMessageCard(m);
          scrollToBottom();
        }

        if (m.userId !== state.currentUser.id) {
          playChime();
        }
        break;
      }

      case 'thread_reply_added': {
        const parent = state.messages.find(m => m.id === msg.parentId);
        if (parent) {
          if (!parent.threads) parent.threads = [];
          parent.threads.push(msg.reply);
          updateMessageThreadSummary(parent.id, parent.threads.length);
          if (state.activeThreadParentId === parent.id) {
            appendThreadReply(msg.reply);
          }
        }
        break;
      }

      case 'reaction_updated': {
        const target = state.messages.find(m => m.id === msg.messageId);
        if (target) {
          target.reactions = msg.reactions;
          updateMessageReactionsUI(target.id, target.reactions);
        }
        break;
      }

      case 'user_typing': {
        if (msg.userId === state.currentUser.id) return;
        const relevant = (state.currentRoomType === 'channel' && msg.channelId === state.activeChannelId) ||
                         (state.currentRoomType === 'dm' && msg.recipientId === state.currentUser.id);
        if (relevant && msg.isTyping) {
          el.typingText.textContent = `${msg.userName} is typing...`;
          el.typingBar.classList.remove('hidden');
        } else {
          el.typingBar.classList.add('hidden');
        }
        break;
      }

      // WebRTC Call Signaling
      case 'call_offer':
        handleIncomingCallOffer(msg);
        break;
      case 'call_answer':
        handleCallAnswer(msg);
        break;
      case 'call_ice_candidate':
        handleCallCandidate(msg);
        break;
      case 'call_hangup':
      case 'call_reject':
        handleCallEnded(msg);
        break;
    }
  }

  // ==========================================
  // UI RENDERING: CHANNELS & DMS
  // ==========================================
  function renderChannels() {
    el.channelList.innerHTML = '';
    state.channels.forEach(chan => {
      const div = document.createElement('div');
      div.className = 'channel-item' + (state.currentRoomType === 'channel' && state.activeChannelId === chan.id ? ' active' : '');
      div.innerHTML = `
        <span class="channel-hash">#</span>
        <span class="channel-name">${escapeHtml(chan.name)}</span>
      `;
      div.onclick = () => switchChannel(chan);
      el.channelList.appendChild(div);
    });
  }

  function renderDms() {
    el.dmList.innerHTML = '';
    const otherUsers = Object.values(state.users).filter(u => u.id !== state.currentUser.id);
    el.onlineUsersCount.textContent = `${otherUsers.filter(u => u.status === 'online').length} online`;

    if (otherUsers.length === 0) {
      el.dmList.innerHTML = `<div style="padding:8px 10px; font-size:12px; color:var(--text-muted);">No other desktops online</div>`;
      return;
    }

    otherUsers.forEach(user => {
      const div = document.createElement('div');
      div.className = 'dm-item' + (state.currentRoomType === 'dm' && state.activeDmUserId === user.id ? ' active' : '');
      div.innerHTML = `
        <div class="dm-avatar-wrap">
          <span class="dm-avatar">${user.avatar || '💻'}</span>
          <span class="dm-status-dot status-${user.status || 'offline'}"></span>
        </div>
        <span class="dm-name">${escapeHtml(user.name)}</span>
      `;
      div.onclick = () => switchDm(user);
      el.dmList.appendChild(div);
    });
  }

  function switchChannel(channel) {
    state.currentRoomType = 'channel';
    state.activeChannelId = channel.id;
    state.activeDmUserId = null;

    el.headerIcon.textContent = '#';
    el.headerTitle.textContent = channel.name;
    el.headerTopic.textContent = channel.topic || 'General conversation';
    el.messageInput.placeholder = `Type a message to #${channel.name} (Shift+Enter for new line)...`;

    renderChannels();
    renderDms();
    renderMessages();
    closeThreadPanel();
  }

  function switchDm(user) {
    state.currentRoomType = 'dm';
    state.activeDmUserId = user.id;
    state.activeChannelId = null;

    el.headerIcon.textContent = user.avatar || '👤';
    el.headerTitle.textContent = user.name;
    el.headerTopic.textContent = `Direct 1:1 conversation with ${user.name}`;
    el.messageInput.placeholder = `Message ${user.name}...`;

    renderChannels();
    renderDms();
    renderMessages();
    closeThreadPanel();
  }

  // ==========================================
  // MESSAGE STREAM RENDERING
  // ==========================================
  function renderMessages() {
    el.messageStream.innerHTML = '';
    const relevant = state.messages.filter(m => {
      if (state.currentRoomType === 'channel') {
        return m.channelId === state.activeChannelId;
      } else {
        return (m.userId === state.currentUser.id && m.recipientId === state.activeDmUserId) ||
               (m.userId === state.activeDmUserId && m.recipientId === state.currentUser.id);
      }
    });

    if (relevant.length === 0) {
      el.messageStream.innerHTML = `
        <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:36px; margin-bottom:12px;">💬</div>
          <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:4px;">This is the beginning of the conversation</div>
          <div style="font-size:13px;">Say hello to get things started!</div>
        </div>
      `;
      return;
    }

    relevant.forEach(m => appendMessageCard(m));
    scrollToBottom();
  }

  function appendMessageCard(m) {
    const card = document.createElement('div');
    card.className = 'message-card';
    card.id = `card-${m.id}`;

    const dateStr = formatTimestamp(m.timestamp);

    let attachmentHtml = '';
    if (m.attachment) {
      if (m.attachment.fileType && m.attachment.fileType.startsWith('image/')) {
        attachmentHtml = `<img class="msg-attachment-img" src="${m.attachment.url}" alt="${escapeHtml(m.attachment.fileName)}" onclick="window.open('${m.attachment.url}')" />`;
      } else {
        attachmentHtml = `
          <a class="msg-file-chip" href="${m.attachment.url}" download="${escapeHtml(m.attachment.fileName)}" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <span>${escapeHtml(m.attachment.fileName)}</span>
            <span style="font-size:11px; color:var(--text-muted);">(${formatBytes(m.attachment.fileSize)})</span>
          </a>
        `;
      }
    }

    let voiceNoteHtml = '';
    if (m.voiceNote) {
      voiceNoteHtml = `
        <div class="voice-player">
          <button class="btn-play-voice" onclick="window.playAudio('${m.voiceNote.url}', this)">▶</button>
          <div class="voice-wave-visual">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="voice-duration">Voice Note</span>
        </div>
      `;
    }

    const threadsCount = (m.threads && m.threads.length) || 0;
    const threadSummaryHtml = threadsCount > 0
      ? `<div class="thread-replies-summary" onclick="window.openThread('${m.id}')">💬 ${threadsCount} ${threadsCount === 1 ? 'reply' : 'replies'}</div>`
      : '';

    card.innerHTML = `
      <div class="msg-avatar">${m.userAvatar || '💻'}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-author">${escapeHtml(m.userName)}</span>
          <span class="msg-time">${dateStr}</span>
        </div>
        <div class="msg-content">${formatMarkdown(m.content)}</div>
        ${attachmentHtml}
        ${voiceNoteHtml}
        <div class="msg-reactions" id="reactions-${m.id}"></div>
        ${threadSummaryHtml}
      </div>

      <div class="message-hover-actions">
        <button class="hover-act-btn" onclick="window.toggleReaction('${m.id}', '👍')">👍</button>
        <button class="hover-act-btn" onclick="window.toggleReaction('${m.id}', '❤️')">❤️</button>
        <button class="hover-act-btn" onclick="window.toggleReaction('${m.id}', '😂')">😂</button>
        <button class="hover-act-btn" onclick="window.toggleReaction('${m.id}', '🔥')">🔥</button>
        <button class="hover-act-btn" onclick="window.openThread('${m.id}')" title="Reply in thread">💬</button>
      </div>
    `;

    el.messageStream.appendChild(card);
    updateMessageReactionsUI(m.id, m.reactions);
  }

  function updateMessageReactionsUI(msgId, reactions) {
    const container = document.getElementById(`reactions-${msgId}`);
    if (!container) return;
    container.innerHTML = '';
    if (!reactions) return;

    for (const [emoji, userList] of Object.entries(reactions)) {
      if (userList && userList.length > 0) {
        const hasReacted = userList.includes(state.currentUser.id);
        const pill = document.createElement('div');
        pill.className = 'reaction-pill' + (hasReacted ? ' user-reacted' : '');
        pill.innerHTML = `<span>${emoji}</span><span>${userList.length}</span>`;
        pill.onclick = () => window.toggleReaction(msgId, emoji);
        container.appendChild(pill);
      }
    }
  }

  function updateMessageThreadSummary(msgId, count) {
    const card = document.getElementById(`card-${msgId}`);
    if (!card) return;
    let summary = card.querySelector('.thread-replies-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'thread-replies-summary';
      summary.onclick = () => window.openThread(msgId);
      card.querySelector('.msg-body').appendChild(summary);
    }
    summary.textContent = `💬 ${count} ${count === 1 ? 'reply' : 'replies'}`;
  }

  // ==========================================
  // THREAD REPLIES PANEL (MS Teams Style)
  // ==========================================
  window.openThread = function (msgId) {
    state.activeThreadParentId = msgId;
    const parent = state.messages.find(m => m.id === msgId);
    if (!parent) return;

    el.threadPanel.classList.remove('hidden');
    el.threadParentMsg.innerHTML = `
      <div class="message-card" style="padding:0; background:transparent;">
        <div class="msg-avatar">${parent.userAvatar || '💻'}</div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-author">${escapeHtml(parent.userName)}</span>
            <span class="msg-time">${formatTimestamp(parent.timestamp)}</span>
          </div>
          <div class="msg-content">${formatMarkdown(parent.content)}</div>
        </div>
      </div>
    `;

    el.threadRepliesList.innerHTML = '';
    if (parent.threads && parent.threads.length > 0) {
      parent.threads.forEach(reply => appendThreadReply(reply));
    }
    el.threadInput.focus();
  };

  function appendThreadReply(reply) {
    const div = document.createElement('div');
    div.className = 'message-card';
    div.style.padding = '6px 0';
    div.innerHTML = `
      <div class="msg-avatar" style="width:30px; height:30px; font-size:15px;">${reply.userAvatar || '💻'}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-author" style="font-size:13px;">${escapeHtml(reply.userName)}</span>
          <span class="msg-time">${formatTimestamp(reply.timestamp)}</span>
        </div>
        <div class="msg-content" style="font-size:13px;">${formatMarkdown(reply.content)}</div>
      </div>
    `;
    el.threadRepliesList.appendChild(div);
  }

  function closeThreadPanel() {
    el.threadPanel.classList.add('hidden');
    state.activeThreadParentId = null;
  }

  // ==========================================
  // SEND MESSAGE & ACTIONS
  // ==========================================
  async function sendMessage() {
    const text = el.messageInput.value.trim();
    if (!text && !state.pendingAttachment) return;

    const payload = {
      type: 'send_message',
      content: text,
      channelId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
      recipientId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
      attachment: state.pendingAttachment
    };

    sendWs(payload);

    el.messageInput.value = '';
    el.messageInput.style.height = 'auto';
    clearAttachment();
    stopTyping();
  }

  function sendThreadReply() {
    const text = el.threadInput.value.trim();
    if (!text || !state.activeThreadParentId) return;

    sendWs({
      type: 'thread_reply',
      parentId: state.activeThreadParentId,
      content: text
    });

    el.threadInput.value = '';
  }

  window.toggleReaction = function (messageId, emoji) {
    sendWs({
      type: 'react',
      messageId,
      emoji
    });
  };

  // ==========================================
  // ATTACHMENTS & VOICE NOTES
  // ==========================================
  async function handleFileUpload(file) {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    showToast(`Uploading ${file.name}...`);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        state.pendingAttachment = data;
        el.previewFileName.textContent = `${data.fileName} (${formatBytes(data.fileSize)})`;
        el.attachmentPreviewBar.classList.remove('hidden');
        showToast('File ready to send!');
      } else {
        showToast('Upload failed');
      }
    } catch (e) {
      console.error(e);
      showToast('Error uploading file');
    }
  }

  function clearAttachment() {
    state.pendingAttachment = null;
    el.attachmentPreviewBar.classList.add('hidden');
    el.filePicker.value = '';
  }

  // WhatsApp-style Voice Note Recording
  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.recordedAudioChunks = [];
      state.audioRecorder = new MediaRecorder(stream);

      state.audioRecorder.ondataavailable = e => {
        if (e.data.size > 0) state.recordedAudioChunks.push(e.data);
      };

      state.audioRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };

      state.audioRecorder.start();
      state.recordingStartTime = Date.now();
      el.voiceRecordingBar.classList.remove('hidden');

      state.recordingTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - state.recordingStartTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        el.recTimer.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }, 500);

    } catch (e) {
      console.error(e);
      showToast('Microphone access denied or unavailable');
    }
  }

  function cancelVoiceRecording() {
    if (state.audioRecorder && state.audioRecorder.state !== 'inactive') {
      state.audioRecorder.stop();
    }
    clearInterval(state.recordingTimerInterval);
    el.voiceRecordingBar.classList.add('hidden');
    state.recordedAudioChunks = [];
  }

  async function sendVoiceRecording() {
    if (!state.audioRecorder) return;
    state.audioRecorder.onstop = async () => {
      const audioBlob = new Blob(state.recordedAudioChunks, { type: 'audio/webm' });
      clearInterval(state.recordingTimerInterval);
      el.voiceRecordingBar.classList.add('hidden');

      showToast('Sending voice note...');
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'audio/webm',
            'X-File-Ext': '.webm',
            'X-File-Name': `voice-${Date.now()}.webm`
          },
          body: audioBlob
        });

        if (res.ok) {
          const uploadRes = await res.json();
          sendWs({
            type: 'send_message',
            content: '',
            channelId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
            recipientId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
            voiceNote: { url: uploadRes.url }
          });
        }
      } catch (e) {
        showToast('Failed to send voice note');
      }
    };
    state.audioRecorder.stop();
  }

  window.playAudio = function (url, btn) {
    const audio = new Audio(url);
    btn.textContent = '⏸';
    audio.play();
    audio.onended = () => {
      btn.textContent = '▶';
    };
    audio.onerror = () => {
      btn.textContent = '▶';
      showToast('Cannot play audio');
    };
  };

  // ==========================================
  // WEBRTC CALLS (Video & Audio across LAN)
  // ==========================================
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  async function startMeeting(callType = 'video') {
    state.isCallActive = true;
    el.callOverlay.classList.remove('hidden');
    el.callRoomName.textContent = state.currentRoomType === 'channel'
      ? `Meeting in #${el.headerTitle.textContent}`
      : `Call with ${el.headerTitle.textContent}`;

    startCallTimer();

    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true
      });
      el.localVideo.srcObject = state.localStream;
      el.localPlaceholder.classList.add('hidden');

      initPeerConnection();
      state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
      });

      const offer = await state.peerConnection.createOffer();
      await state.peerConnection.setLocalDescription(offer);

      sendWs({
        type: 'call_offer',
        targetRoomId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
        targetUserId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
        sdp: offer,
        callType
      });

    } catch (e) {
      console.error('Call media error:', e);
      showToast('Camera/Mic permission needed for calls');
    }
  }

  function initPeerConnection() {
    if (state.peerConnection) return;
    state.peerConnection = new RTCPeerConnection(rtcConfig);

    state.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({
          type: 'call_ice_candidate',
          targetRoomId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
          targetUserId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
          candidate: event.candidate
        });
      }
    };

    state.peerConnection.ontrack = (event) => {
      el.remoteVideo.srcObject = event.streams[0];
      el.remotePlaceholder.classList.add('hidden');
    };
  }

  async function handleIncomingCallOffer(msg) {
    playRingTone();
    el.incomingCallerName.textContent = msg.fromUserName;
    el.incomingAvatar.textContent = msg.fromUserAvatar || '💻';
    el.incomingCallToast.classList.remove('hidden');

    el.btnAcceptCall.onclick = async () => {
      el.incomingCallToast.classList.add('hidden');
      state.isCallActive = true;
      el.callOverlay.classList.remove('hidden');
      startCallTimer();

      try {
        state.localStream = await navigator.mediaDevices.getUserMedia({
          video: msg.callType === 'video',
          audio: true
        });
        el.localVideo.srcObject = state.localStream;
        el.localPlaceholder.classList.add('hidden');

        initPeerConnection();
        state.localStream.getTracks().forEach(track => {
          state.peerConnection.addTrack(track, state.localStream);
        });

        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);

        sendWs({
          type: 'call_answer',
          targetUserId: msg.fromUserId,
          sdp: answer
        });
      } catch (e) {
        console.error(e);
        endCall();
      }
    };

    el.btnDeclineCall.onclick = () => {
      el.incomingCallToast.classList.add('hidden');
      sendWs({
        type: 'call_reject',
        targetUserId: msg.fromUserId
      });
    };
  }

  async function handleCallAnswer(msg) {
    if (state.peerConnection) {
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }
  }

  async function handleCallCandidate(msg) {
    if (state.peerConnection && msg.candidate) {
      try {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (e) { }
    }
  }

  function handleCallEnded() {
    endCall(false);
    showToast('Call ended');
  }

  function endCall(notify = true) {
    if (notify) {
      sendWs({
        type: 'call_hangup',
        targetRoomId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
        targetUserId: state.currentRoomType === 'dm' ? state.activeDmUserId : null
      });
    }

    if (state.localStream) {
      state.localStream.getTracks().forEach(t => t.stop());
      state.localStream = null;
    }
    if (state.peerConnection) {
      state.peerConnection.close();
      state.peerConnection = null;
    }

    el.callOverlay.classList.add('hidden');
    el.incomingCallToast.classList.add('hidden');
    clearInterval(state.callTimerInterval);
    state.isCallActive = false;
  }

  function startCallTimer() {
    state.callStartTime = Date.now();
    clearInterval(state.callTimerInterval);
    state.callTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - state.callStartTime) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.callDuration.textContent = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================
  function setupEventListeners() {
    // Copy LAN IP Button
    el.btnCopyIp.onclick = () => {
      const url = el.lanIpAddress.textContent;
      navigator.clipboard.writeText(url).then(() => {
        showToast(`Copied LAN link: ${url}`);
      });
    };

    // Send Message Trigger
    el.btnSendMessage.onclick = sendMessage;
    el.messageInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      } else {
        handleTypingTrigger();
      }
    };

    // Send Thread Reply
    el.btnSendThreadReply.onclick = sendThreadReply;
    el.threadInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendThreadReply();
      }
    };
    el.btnCloseThread.onclick = closeThreadPanel;

    // File Attachment
    el.btnAttachFile.onclick = () => el.filePicker.click();
    el.filePicker.onchange = (e) => {
      if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    };
    el.btnRemoveAttach.onclick = clearAttachment;

    // Drag and Drop Upload
    window.ondragover = (e) => e.preventDefault();
    window.ondrop = (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    };

    // Voice Note
    el.btnVoiceNote.onclick = startVoiceRecording;
    el.btnCancelRec.onclick = cancelVoiceRecording;
    el.btnSendRec.onclick = sendVoiceRecording;

    // Formatting Toolbar
    el.toolBold.onclick = () => insertWrap('**', '**');
    el.toolItalic.onclick = () => insertWrap('*', '*');
    el.toolCode.onclick = () => insertWrap('```\n', '\n```');
    el.toolLink.onclick = () => insertWrap('[', '](https://)');
    el.toolEmoji.onclick = () => {
      insertWrap('😊', '');
    };

    // Call Buttons
    el.btnMeetNow.onclick = () => startMeeting('video');
    el.btnAudioCall.onclick = () => startMeeting('audio');
    el.btnEndCall.onclick = () => endCall(true);

    el.btnToggleMic.onclick = () => {
      if (state.localStream) {
        const audio = state.localStream.getAudioTracks()[0];
        if (audio) {
          audio.enabled = !audio.enabled;
          el.btnToggleMic.style.color = audio.enabled ? '#fff' : '#ef4444';
          showToast(audio.enabled ? 'Microphone unmuted' : 'Microphone muted');
        }
      }
    };

    el.btnToggleCam.onclick = () => {
      if (state.localStream) {
        const video = state.localStream.getVideoTracks()[0];
        if (video) {
          video.enabled = !video.enabled;
          el.localPlaceholder.classList.toggle('hidden', video.enabled);
          showToast(video.enabled ? 'Camera turned on' : 'Camera turned off');
        }
      }
    };

    el.btnShareScreen.onclick = async () => {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (state.peerConnection) {
          const sender = state.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        }
        el.localVideo.srcObject = screenStream;
        screenTrack.onended = () => {
          if (state.localStream) {
            const camTrack = state.localStream.getVideoTracks()[0];
            const sender = state.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender && camTrack) sender.replaceTrack(camTrack);
            el.localVideo.srcObject = state.localStream;
          }
        };
      } catch (e) { }
    };

    // Channel Creation Modal
    el.btnAddChannel.onclick = () => el.modalChannel.classList.remove('hidden');
    el.btnCloseModalChannel.onclick = () => el.modalChannel.classList.add('hidden');
    el.btnCancelModalChannel.onclick = () => el.modalChannel.classList.add('hidden');

    el.formCreateChannel.onsubmit = async (e) => {
      e.preventDefault();
      const name = el.newChanName.value.trim();
      const topic = el.newChanTopic.value.trim();
      if (!name) return;

      try {
        const res = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, topic })
        });
        if (res.ok) {
          el.modalChannel.classList.add('hidden');
          el.newChanName.value = '';
          el.newChanTopic.value = '';
        }
      } catch (err) {
        showToast('Error creating channel');
      }
    };

    // User Profile & Status Toggle
    el.statusDropdownToggle.onclick = (e) => {
      e.stopPropagation();
      el.statusMenu.classList.toggle('hidden');
    };
    document.onclick = () => el.statusMenu.classList.add('hidden');

    document.querySelectorAll('.status-menu-item').forEach(item => {
      item.onclick = () => {
        const status = item.getAttribute('data-status');
        if (state.currentUser) {
          state.currentUser.status = status;
          localStorage.setItem('teams_user', JSON.stringify(state.currentUser));
          updateUserUI();
          sendWs({ type: 'set_status', status });
        }
      };
    });

    el.editProfileBtn.onclick = promptUserSetup;
    el.railUserBtn.onclick = promptUserSetup;

    // Search Filter
    el.searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.channel-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
      document.querySelectorAll('.dm-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    };
  }

  function handleTypingTrigger() {
    if (!state.isTyping) {
      state.isTyping = true;
      sendWs({
        type: 'typing',
        channelId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
        recipientId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
        isTyping: true
      });
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(stopTyping, 2000);
  }

  function stopTyping() {
    if (state.isTyping) {
      state.isTyping = false;
      sendWs({
        type: 'typing',
        channelId: state.currentRoomType === 'channel' ? state.activeChannelId : null,
        recipientId: state.currentRoomType === 'dm' ? state.activeDmUserId : null,
        isTyping: false
      });
    }
  }

  function insertWrap(before, after) {
    const start = el.messageInput.selectionStart;
    const end = el.messageInput.selectionEnd;
    const val = el.messageInput.value;
    const sel = val.substring(start, end);
    el.messageInput.value = val.substring(0, start) + before + sel + after + val.substring(end);
    el.messageInput.focus();
    el.messageInput.selectionStart = start + before.length;
    el.messageInput.selectionEnd = start + before.length + sel.length;
  }

  // ==========================================
  // HELPERS
  // ==========================================
  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks ```code```
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // URLs
    html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    // Line breaks
    html = html.replace(/\n/g, '<br/>');

    return html;
  }

  function scrollToBottom() {
    setTimeout(() => {
      el.messageStream.scrollTop = el.messageStream.scrollHeight;
    }, 40);
  }

  let toastTimeout = null;
  function showToast(msg) {
    el.toastMessage.textContent = msg;
    el.toastMessage.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.toastMessage.classList.add('hidden');
    }, 2800);
  }

  // Start app
  window.addEventListener('DOMContentLoaded', init);

})();
