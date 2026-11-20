// Kênh mạng cho co-op. Trong artifact trên Claude dùng capability `room`
// (presence = trạng thái của từng người, tự chia sẻ cho cả phòng); khi chạy thử
// cục bộ với ?mockroom thì giả lập bằng BroadcastChannel giữa các tab.

// ---------- giả lập phòng bằng BroadcastChannel (để test 2 tab trên cùng máy) ----------
class MockRoom {
  constructor(bus, name) {
    this.bus = bus; this.name = name;
    this.me = bus.peer;
    this.mine = {};
    this.others = new Map();
    this.handlers = new Set();
    this.alive = true;
    this._snap = null;
    bus.rooms.set(name, this);
    this._send('hello');
    this._keep = setInterval(() => { this._send('pres'); this._reap(); }, 1000);
  }
  _send(type) { this.bus.ch.postMessage({ type, room: this.name, peer: this.me, presence: this.mine, t: Date.now() }); }
  _recv(m) {
    if (!this.alive || m.peer === this.me) return;
    if (m.type === 'leave') { if (this.others.delete(m.peer)) this._emit({ left: [m.peer] }); return; }
    if (m.type === 'hello') this._send('pres');
    const prev = this.others.get(m.peer);
    const presence = Object.freeze({ ...(m.presence || {}) });
    this.others.set(m.peer, { peer: m.peer, presence, updatedAt: Date.now(), seen: Date.now() });
    this._emit(prev ? { updated: [m.peer] } : { joined: [m.peer] });
  }
  _reap() {
    const now = Date.now();
    for (const [k, v] of this.others) if (now - v.seen > 5000) { this.others.delete(k); this._emit({ left: [k] }); }
  }
  _emit(ch) {
    this._snap = null;
    const peers = this.peers();
    for (const h of this.handlers) h({ peers, joined: [], left: [], updated: [], ...ch });
  }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.mine[k]; else this.mine[k] = patch[k]; }
    this._snap = null;
    this._send('pres');
    return Promise.resolve();
  }
  peers() {
    if (this._snap) return this._snap;
    const list = [{ peer: this.me, presence: { ...this.mine }, updatedAt: Date.now(), isMe: true, sameTab: true, kind: 'viewer', guest: false, by: null }];
    for (const v of this.others.values()) list.push({ peer: v.peer, presence: v.presence, updatedAt: v.updatedAt, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null });
    this._snap = list;
    return list;
  }
  onPeers(fn) { this.handlers.add(fn); setTimeout(() => this.alive && fn({ peers: this.peers(), joined: this.peers(), left: [], updated: [] }), 0); return () => this.handlers.delete(fn); }
  connected() { return true; }
  leave() {
    if (!this.alive) return Promise.resolve();
    this.alive = false;
    clearInterval(this._keep);
    this._send('leave');
    this.bus.rooms.delete(this.name);
    return Promise.resolve();
  }
}
class MockTransport {
  constructor() {
    this.kind = 'mock';
    this.peer = 'm' + Math.random().toString(36).slice(2, 10);
    this.ch = new BroadcastChannel('deadnight-mockroom');
    this.rooms = new Map();
    this.ch.onmessage = (e) => { const r = this.rooms.get(e.data.room); if (r) r._recv(e.data); };
    this.lobby = new MockRoom(this, 'lobby');
    addEventListener('pagehide', () => { for (const r of [...this.rooms.values()]) r.leave(); });
  }
  join(name) { return Promise.resolve(this.rooms.get(name) || new MockRoom(this, name)); }
}

// ---------- capability `room` của artifact ----------
class RoomTransport {
  constructor(room) {
    this.kind = 'room';
    this.room = room;
    this.lobby = room;
  }
  join(name) { return this.room.join(name); }
}

// Trả về kênh co-op, hoặc null nếu trang này không mở được kênh nào.
export async function openTransport(mock) {
  if (mock && typeof BroadcastChannel !== 'undefined') return new MockTransport();
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const room = await window.claude.use('room');
      if (room) return new RoomTransport(room);
    }
  } catch (e) { /* không có kênh */ }
  return null;
}

// tên phòng ngắn, dễ đọc cho bạn bè nhập tay (bỏ các ký tự dễ nhầm)
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() { let s = ''; for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }
export const roomName = (code) => 'dn-' + code.toLowerCase();
export function cleanCode(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
export function cleanName(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const c = ch.codePointAt(0);
    if (c < 32 || (c >= 127 && c < 160) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff) continue;
    out += ch;
  }
  return out.trim().slice(0, 14) || 'Người sống sót';
}
