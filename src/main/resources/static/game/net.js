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

// ---------- Firebase Realtime Database (chạy ngoài Claude: GitHub Pages, web riêng) ----------
// Dùng chung dự án Firebase với Tiên Đồ. Mỗi người chơi ghi trạng thái của mình vào
// dn_rooms/<phòng>/<uid> = { d: JSON trạng thái, t: giờ máy chủ }; tự xoá khi rớt mạng.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBYPZQt0hDyr2pQq4XOKqNB2uIdsxIYAg0',
  authDomain: 'dau-hu-thui.firebaseapp.com',
  databaseURL: 'https://dau-hu-thui-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'dau-hu-thui',
  storageBucket: 'dau-hu-thui.firebasestorage.app',
  messagingSenderId: '960591114586',
  appId: '1:960591114586:web:e9d261b3d6ee865e5d4363',
};
const FB_VER = '10.12.2';
class FireRoom {
  constructor(t, name) {
    const { D, db } = t;
    this.t = t; this.name = name; this.me = t.uid;
    this.mine = {}; this.others = new Map(); this.handlers = new Set();
    this.alive = true; this._snap = null; this._lastW = 0; this._wT = 0;
    this.ref = D.ref(db, 'dn_rooms/' + name);
    this.myRef = D.ref(db, 'dn_rooms/' + name + '/' + this.me);
    D.onDisconnect(this.myRef).remove().catch(() => {});
    const err = (e) => t.fail(e);
    const put = (snap, isNew) => {
      if (!this.alive || snap.key === this.me) return;
      const v = snap.val();
      if (!v || typeof v.d !== 'string') return;
      if (v.t && t.now() - v.t > 90000) return;   // máy rớt mạng mà chưa kịp xoá
      let pres;
      try { pres = Object.freeze(JSON.parse(v.d)); } catch (e) { return; }
      const had = this.others.has(snap.key);
      this.others.set(snap.key, { peer: snap.key, presence: pres, updatedAt: Date.now() });
      this._emit(had && !isNew ? { updated: [snap.key] } : { joined: [snap.key] });
    };
    this.unsubs = [
      D.onChildAdded(this.ref, (s2) => put(s2, true), err),
      D.onChildChanged(this.ref, (s2) => put(s2, false), err),
      D.onChildRemoved(this.ref, (s2) => { if (this.others.delete(s2.key)) this._emit({ left: [s2.key] }); }, err),
    ];
    this._write();
    this._keep = setInterval(() => this._write(), 15000);   // làm mới giờ để người khác biết mình còn
  }
  _emit(ch) {
    this._snap = null;
    const peers = this.peers();
    for (const h of this.handlers) h({ peers, joined: [], left: [], updated: [], ...ch });
  }
  // ghi ngay mỗi lần đổi (trong trận game đã tự giới hạn ~8 lần/giây)
  _write() {
    if (!this.alive) return;
    this._lastW = Date.now();
    const { D } = this.t;
    D.set(this.myRef, { d: JSON.stringify(this.mine), t: D.serverTimestamp() }).catch((e) => this.t.fail(e));
  }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.mine[k]; else this.mine[k] = patch[k]; }
    this._snap = null;
    this._write();
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
  // sau khi nối lại mạng: đăng ký lại việc tự xoá khi rớt mạng và ghi lại trạng thái của mình
  rearm() { if (!this.alive) return; this.t.D.onDisconnect(this.myRef).remove().catch(() => {}); this._write(); }
  connected() { return this.t.online; }
  leave() {
    if (!this.alive) return Promise.resolve();
    this.alive = false;
    clearInterval(this._keep); clearTimeout(this._wT);
    for (const u of this.unsubs) u();
    const { D } = this.t;
    D.onDisconnect(this.myRef).cancel().catch(() => {});
    return D.remove(this.myRef).catch(() => {});
  }
}
class FireTransport {
  constructor() { this.kind = 'firebase'; this.online = false; this.offset = 0; this.onError = null; this.failed = ''; }
  static async create() {
    const base = window.__fbBase || 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';   // __fbBase: chỉ để thử nghiệm
    const [app, A, D] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js')]);
    const t = new FireTransport();
    const a = app.initializeApp(FIREBASE_CONFIG, 'deadnight');
    const auth = A.getAuth(a);
    t.A = A; t.D = D; t.db = D.getDatabase(a);
    t.uid = await signIn(A, auth);
    D.onValue(D.ref(t.db, '.info/connected'), (s) => { t.online = !!s.val(); });
    D.onValue(D.ref(t.db, '.info/serverTimeOffset'), (s) => { t.offset = +s.val() || 0; });
    t.lobby = new FireRoom(t, 'lobby');
    return t;
  }
  now() { return Date.now() + this.offset; }
  // ngắt hẳn kết nối khi không ở phòng chờ / phòng co-op (không chiếm suất kết nối của dự án)
  sleep() { if (this.asleep) return; this.asleep = true; this.D.goOffline(this.db); }
  wake() { if (!this.asleep) return; this.asleep = false; this.D.goOnline(this.db); this.lobby.rearm(); }
  fail(e) {
    const code = String((e && (e.code || e.message)) || e);
    this.failed = /permission/i.test(code)
      ? 'Firebase chưa cho phép ghi dn_rooms: thêm luật dn_rooms trong Realtime Database → Rules.'
      : 'Lỗi kết nối Firebase: ' + code;
    if (this.onError) this.onError(this.failed);
  }
  join(name) { return Promise.resolve(new FireRoom(this, name)); }
}
// đăng nhập ẩn danh; nếu dự án chưa bật thì tự tạo một tài khoản riêng cho máy này
async function signIn(A, auth) {
  try { return (await A.signInAnonymously(auth)).user.uid; }
  catch (e) { /* chưa bật Anonymous trong Firebase Authentication */ }
  let acc = null;
  try { acc = JSON.parse(localStorage.getItem('dn_fbacc') || 'null'); } catch (e) { acc = null; }
  if (acc && acc.e && acc.p) {
    try { return (await A.signInWithEmailAndPassword(auth, acc.e, acc.p)).user.uid; } catch (e) { /* tạo lại */ }
  }
  const rnd = () => Math.random().toString(36).slice(2, 10);
  acc = { e: 'dn' + rnd() + rnd() + '@dauhuthui.game', p: rnd() + rnd() + 'X9' };
  const uid = (await A.createUserWithEmailAndPassword(auth, acc.e, acc.p)).user.uid;
  try { localStorage.setItem('dn_fbacc', JSON.stringify(acc)); } catch (e) { /* không lưu được */ }
  return uid;
}

// Kênh có sẵn ngay khi mở trang: giả lập (?mockroom) hoặc kênh room của Claude; không có thì null.
export let transportError = '';
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
// Firebase chỉ dùng khi chạy trên web riêng (GitHub Pages…), và chỉ kết nối khi người chơi mở phần co-op.
// Trên localhost bỏ qua (trừ khi thêm ?fb) để chạy thử không đụng vào dữ liệu thật.
export function canUseFirebase() {
  const local = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) && !/[?&]fb\b/.test(location.search);
  return /^https?:$/.test(location.protocol) && !window.claude && !local;
}
export async function openFirebase() {
  try { transportError = ''; return await FireTransport.create(); }
  catch (e) { transportError = 'Không kết nối được máy chủ online (' + ((e && (e.code || e.message)) || 'lỗi') + ')'; return null; }
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
