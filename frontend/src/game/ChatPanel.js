const channelLabels = {
  global: 'TOÀN NHÀ TÙ',
  near: 'GẦN ĐÂY',
  private: 'RIÊNG',
};

export class ChatPanel {
  constructor(socket) {
    this.socket = socket;
    this.root = document.querySelector('#chat-root');
    this.panel = document.querySelector('#chat-panel');
    this.list = document.querySelector('#chat-messages');
    this.empty = document.querySelector('#chat-empty');
    this.form = document.querySelector('#chat-form');
    this.input = document.querySelector('#chat-input');
    this.status = document.querySelector('#chat-status');
    this.feedback = document.querySelector('#chat-feedback');
    this.playerSelect = document.querySelector('#chat-player-select');
    this.openButton = document.querySelector('#chat-open-button');
    this.unreadCount = document.querySelector('#chat-unread-count');
    this.unreadLabel = document.querySelector('#chat-unread-label');
    this.type = 'global';
    this.playerId = null;
    this.peerId = '';
    this.available = false;
    this.visible = false;
    this.collapsed = true;
    this.userHidden = true;
    this.muted = true;
    this.unread = 0;
    this.unreadByChannel = new Map();
    this.messages = new Map();
    this.loading = new Set();
    this.historyExhausted = new Set();
    this.roster = [];
    this.blocked = new Set();
    this.soundContext = null;
    this.opacityInput = document.querySelector('#chat-opacity-input');

    if (this.collapsed) {
      this.panel.classList.add('is-collapsed');
      const minimizeButton = document.querySelector('#chat-minimize-button');
      minimizeButton.textContent = '+';
      minimizeButton.title = 'Mở rộng chat';
    }
    this.root.classList.toggle('is-expanded', !this.collapsed);
    this.root.style.setProperty('--chat-panel-alpha', '0.92');
    this.opacityInput.addEventListener('input', () => {
      this.root.style.setProperty('--chat-panel-alpha', String(Number(this.opacityInput.value) / 100));
    });
    this.root.querySelectorAll('[data-chat-type]').forEach((button) => {
      button.addEventListener('click', () => this.setType(button.dataset.chatType));
    });
    document.querySelector('#chat-hide-button').addEventListener('click', () => this.setHidden(true));
    document.querySelector('#chat-open-button').addEventListener('click', () => this.setHidden(false));
    window.addEventListener('game:toggle-chat', () => {
      if (!this.visible) return;
      this.setHidden(!this.panel.hidden);
      if (!this.panel.hidden) this.input.focus();
    });
    document.querySelector('#chat-minimize-button').addEventListener('click', (event) => {
      this.collapsed = !this.collapsed;
      this.panel.classList.toggle('is-collapsed', this.collapsed);
      this.root.classList.toggle('is-expanded', !this.collapsed && !this.panel.hidden);
      document.querySelector('#touch-controls')?.classList.toggle(
        'chat-open',
        !this.collapsed && !this.panel.hidden,
      );
      event.currentTarget.textContent = this.collapsed ? '+' : '−';
      event.currentTarget.title = this.collapsed ? 'Mở rộng chat' : 'Thu nhỏ chat';
    });
    document.querySelector('#chat-sound-button').addEventListener('click', (event) => {
      this.muted = !this.muted;
      event.currentTarget.setAttribute('aria-pressed', String(!this.muted));
      event.currentTarget.title = this.muted ? 'Bật âm báo' : 'Tắt âm báo';
      this.setFeedback(this.muted ? 'Đã tắt âm báo' : 'Đã bật âm báo');
    });
    this.playerSelect.addEventListener('change', () => {
      this.peerId = this.playerSelect.value;
      this.updateBlockButton();
      if (this.type === 'private') this.loadHistory();
    });
    document.querySelector('#chat-block-button').addEventListener('click', () => this.toggleBlock());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.sendMessage();
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.list.addEventListener('scroll', () => {
      if (this.list.scrollTop < 24) this.loadOlder();
    });
    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const isField = target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select'));
      if (this.visible && event.key === 'Enter' && !isField) {
        event.preventDefault();
        this.input.focus();
      }
    });

    socket.on('session:welcome', (welcome) => {
      this.playerId = welcome.player.id;
      this.blocked = new Set(welcome.blockedPlayerIds || []);
      this.updateBlockButton();
      this.refreshRoster();
    });
    socket.on('chat:status', (event) => this.setAvailability(event.available));
    socket.on('chat:message', (message) => this.receiveMessage(message));
    socket.on('chat:message-deleted', (event) => this.markMessageDeleted(event.id));
    socket.on('chat:roster', (players) => this.setRoster(players));
    socket.on('disconnect', () => {
      this.loading.clear();
      this.status.textContent = 'ĐANG KẾT NỐI LẠI';
    });
    socket.on('connect', () => {
      this.refreshRoster();
      if (this.available) this.loadHistory();
    });
    this.setType('global');
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) return;
    this.setHidden(this.userHidden);
    this.refreshRoster();
    this.loadHistory();
  }

  setHidden(hidden) {
    const wasHidden = this.panel.hidden;
    this.userHidden = hidden;
    if (!hidden && wasHidden) {
      this.collapsed = false;
      this.panel.classList.remove('is-collapsed');
      const minimizeButton = document.querySelector('#chat-minimize-button');
      minimizeButton.textContent = '−';
      minimizeButton.title = 'Thu nhỏ chat';
    }
    this.root.classList.toggle('is-hidden', hidden);
    this.root.classList.toggle('is-expanded', !hidden && !this.collapsed);
    document.querySelector('#touch-controls')?.classList.toggle(
      'chat-open',
      !hidden && !this.collapsed,
    );
    this.panel.hidden = hidden;
    this.openButton.hidden = !hidden;
    if (!hidden) this.markChannelRead();
  }

  setAvailability(available) {
    this.available = Boolean(available);
    this.status.textContent = this.available ? 'TRỰC TUYẾN' : 'CHAT CHƯA CẤU HÌNH';
    this.form.querySelector('button').disabled = !this.available;
    this.input.disabled = !this.available;
    this.input.placeholder = this.available ? 'Nhập tin nhắn...' : 'Chat cần PostgreSQL trên server';
    if (this.available) this.loadHistory();
  }

  setType(type) {
    if (!Object.hasOwn(channelLabels, type)) return;
    this.type = type;
    this.root.querySelectorAll('[data-chat-type]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.chatType === type));
    });
    this.playerSelect.hidden = type !== 'private';
    this.playerSelect.previousElementSibling.hidden = type !== 'private';
    document.querySelector('#chat-block-button').hidden = type !== 'private';
    this.renderMessages();
    this.loadHistory();
    this.markChannelRead();
  }

  channelKey(type = this.type, peerId = this.peerId) {
    return type === 'private' ? `private:${peerId}` : type;
  }

  currentMessages() {
    return this.messages.get(this.channelKey()) || [];
  }

  async loadHistory(before) {
    const key = this.channelKey();
    if (!this.available || !this.socket.connected || this.loading.has(key)) return;
    if (before && this.historyExhausted.has(key)) return;
    if (this.type === 'private' && !this.peerId) return;
    this.loading.add(key);
    const payload = { type: this.type, limit: 30 };
    if (this.type === 'private') payload.peerId = this.peerId;
    if (before) payload.before = before;
    this.socket.emit('chat:history', payload, (response) => {
      this.loading.delete(key);
      if (!response?.ok) {
        this.setFeedback(response?.error || 'Không thể tải lịch sử.');
        return;
      }
      if (response.messages.length < payload.limit) this.historyExhausted.add(key);
      const existing = this.messages.get(key) || [];
      const merged = new Map(existing.map((message) => [message.id, message]));
      response.messages.forEach((message) => merged.set(message.id, message));
      this.messages.set(key, [...merged.values()].sort((a, b) => (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )).slice(-100));
      if (key === this.channelKey()) this.renderMessages();
    });
  }

  loadOlder() {
    if (this.loading.has(this.channelKey())) return;
    const first = this.currentMessages()[0];
    if (first?.createdAt) this.loadHistory(first.createdAt);
  }

  refreshRoster() {
    if (!this.socket.connected) return;
    this.socket.emit('chat:players', (response) => {
      if (response?.ok) this.setRoster(response.players);
    });
  }

  setRoster(players) {
    if (!Array.isArray(players)) return;
    this.roster = players.filter((player) => player.id !== this.playerId);
    const previousId = this.peerId;
    this.playerSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Chọn tù nhân';
    this.playerSelect.append(placeholder);
    for (const player of this.roster) {
      const option = document.createElement('option');
      option.value = player.id;
      option.textContent = `${player.name} · ${player.inmateCode} · ${player.area}`;
      this.playerSelect.append(option);
    }
    this.peerId = this.roster.some((player) => player.id === previousId) ? previousId : '';
    this.playerSelect.value = this.peerId;
    this.updateBlockButton();
  }

  updateBlockButton() {
    const button = document.querySelector('#chat-block-button');
    button.textContent = this.blocked.has(this.peerId) ? '↗' : '⊘';
    button.title = this.blocked.has(this.peerId) ? 'Bỏ chặn người chơi' : 'Chặn người chơi';
    button.setAttribute('aria-label', button.title);
  }

  toggleBlock() {
    if (!this.peerId) return;
    const blocked = !this.blocked.has(this.peerId);
    this.socket.emit('chat:block', { playerId: this.peerId, blocked }, (response) => {
      if (!response?.ok) return this.setFeedback(response?.error || 'Không thể cập nhật chặn.');
      if (blocked) this.blocked.add(this.peerId);
      else this.blocked.delete(this.peerId);
      this.updateBlockButton();
      this.setFeedback(blocked ? 'Đã chặn người chơi' : 'Đã bỏ chặn người chơi');
    });
  }

  receiveMessage(message) {
    if (!message?.id || !['global', 'near', 'private'].includes(message.type)) return;
    const peerId = message.type === 'private'
      ? (message.senderId === this.playerId ? message.receiverId : message.senderId)
      : '';
    const key = this.channelKey(message.type, peerId);
    const channel = this.messages.get(key) || [];
    if (!channel.some((item) => item.id === message.id)) {
      channel.push(message);
      this.messages.set(key, channel.slice(-100));
    }
    const isCurrent = key === this.channelKey() && this.visible && !this.panel.hidden && !this.collapsed;
    if (isCurrent) {
      this.renderMessages();
      this.markChannelRead();
    } else {
      this.unread += 1;
      this.unreadByChannel.set(key, (this.unreadByChannel.get(key) || 0) + 1);
      this.updateUnread();
      this.playNotification();
    }
  }

  renderMessages() {
    const messages = this.currentMessages();
    const oldHeight = this.list.scrollHeight;
    const oldTop = this.list.scrollTop;
    this.list.replaceChildren();
    for (const message of messages) this.list.append(this.createMessageElement(message));
    this.empty.hidden = messages.length > 0;
    if (oldTop > 24 && oldHeight > 0) this.list.scrollTop = oldTop + this.list.scrollHeight - oldHeight;
    else this.list.scrollTop = this.list.scrollHeight;
  }

  markMessageDeleted(messageId) {
    for (const [key, messages] of this.messages) {
      const message = messages.find((item) => item.id === messageId);
      if (message) {
        message.deleted = true;
        message.content = '';
        if (key === this.channelKey()) this.renderMessages();
      }
    }
  }

  createMessageElement(message) {
    const item = document.createElement('li');
    item.className = 'chat-message';
    if (message.senderId === this.playerId) item.classList.add('is-own');
    const heading = document.createElement('div');
    heading.className = 'chat-message-heading';
    const sender = document.createElement('strong');
    sender.textContent = message.senderName || 'Tù nhân';
    const code = document.createElement('span');
    code.textContent = message.senderInmateCode || '';
    const time = document.createElement('time');
    const sentAt = new Date(message.createdAt);
    time.dateTime = sentAt.toISOString();
    time.textContent = sentAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    heading.append(sender, code, time);
    const content = document.createElement('p');
    content.textContent = message.deleted ? 'Tin nhắn đã bị xóa.' : message.content;
    item.append(heading, content);
    if (message.senderId !== this.playerId && !message.deleted) {
      const report = document.createElement('button');
      report.className = 'chat-message-report';
      report.type = 'button';
      report.textContent = 'BÁO CÁO';
      report.addEventListener('click', () => {
        this.socket.emit('chat:report', { messageId: message.id }, (response) => {
          this.setFeedback(response?.ok ? 'Đã gửi báo cáo' : response?.error || 'Không thể báo cáo.');
        });
      });
      item.append(report);
    } else if (message.senderId === this.playerId && !message.deleted) {
      const remove = document.createElement('button');
      remove.className = 'chat-message-report';
      remove.type = 'button';
      remove.textContent = 'XÓA';
      remove.addEventListener('click', () => {
        this.socket.emit('chat:delete-own', { messageId: message.id }, (response) => {
          this.setFeedback(response?.ok ? 'Đã xóa tin nhắn' : response?.error || 'Không thể xóa tin nhắn.');
        });
      });
      item.append(remove);
    }
    return item;
  }

  markChannelRead() {
    const key = this.channelKey();
    const unreadForChannel = this.unreadByChannel.get(key) || 0;
    this.unread = Math.max(0, this.unread - unreadForChannel);
    this.unreadByChannel.delete(key);
    this.updateUnread();
  }

  updateUnread() {
    this.unreadCount.textContent = String(this.unread);
    this.unreadCount.hidden = this.unread === 0;
    this.unreadLabel.textContent = this.unread ? `${this.unread} CHƯA ĐỌC` : '';
  }

  playNotification() {
    if (this.muted) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.soundContext ||= new AudioContextClass();
      const oscillator = this.soundContext.createOscillator();
      const gain = this.soundContext.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.035, this.soundContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.soundContext.currentTime + 0.12);
      oscillator.connect(gain).connect(this.soundContext.destination);
      oscillator.start();
      oscillator.stop(this.soundContext.currentTime + 0.12);
    } catch {
      this.muted = true;
    }
  }

  sendMessage() {
    if (!this.available || !this.socket.connected) return this.setFeedback('Chưa kết nối chat.');
    if (this.type === 'private' && !this.peerId) return this.setFeedback('Chọn người chơi để nhắn riêng.');
    const content = this.input.value.trim();
    if (!content) return;
    const button = this.form.querySelector('button');
    button.disabled = true;
    const payload = { type: this.type, content };
    if (this.type === 'private') payload.receiverId = this.peerId;
    this.socket.emit('chat:send', payload, (response) => {
      button.disabled = false;
      if (!response?.ok) return this.setFeedback(response?.error || 'Không thể gửi tin nhắn.');
      this.input.value = '';
      this.input.focus();
      this.setFeedback('Tin nhắn đã gửi');
    });
  }

  setFeedback(message) {
    this.feedback.textContent = message;
  }
}