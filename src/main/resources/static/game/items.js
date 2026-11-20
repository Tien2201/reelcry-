// Vật phẩm, bảng rơi đồ của từng loại chỗ lục soát và xác zombie.
// Đồ lục được tính riêng cho từng người chơi (co-op: ai cũng lục được mỗi chỗ một lần).

export const ITEMS = {
  ammo9: { name: 'Đạn 9mm', max: 240, icon: 0 },
  shells: { name: 'Đạn ghém', max: 60, icon: 1 },
  bandage: { name: 'Băng gạc', max: 8, icon: 2, use: 'heal', heal: 25, time: 1.1 },
  medkit: { name: 'Hộp cứu thương', max: 4, icon: 3, use: 'heal', heal: 70, time: 2.0 },
  food: { name: 'Đồ hộp', max: 8, icon: 4, use: 'eat', food: 45, time: 1.2 },
  water: { name: 'Nước suối', max: 8, icon: 5, use: 'drink', water: 55, time: 0.8 },
  fuel: { name: 'Can xăng', max: 1, icon: 6, quest: true },
  part: { name: 'Linh kiện bộ đàm', max: 2, icon: 7, quest: true },
  key: { name: 'Chìa khoá kho súng', max: 1, icon: 8, quest: true },
  shotgun: { name: 'Shotgun', max: 1, icon: 9, weapon: 2 },
  smg: { name: 'Tiểu liên', max: 1, icon: 10, weapon: 3 },
};
export const ITEM_ORDER = ['bandage', 'medkit', 'food', 'water', 'ammo9', 'shells', 'fuel', 'part', 'key'];

// [xác suất, vật phẩm, số lượng min, max]
const L = {
  fridge: [[0.7, 'water', 1, 2], [0.55, 'food', 1, 2]],
  cabinet: [[0.65, 'food', 1, 2], [0.35, 'water', 1, 1], [0.3, 'bandage', 1, 1]],
  wardrobe: [[0.6, 'bandage', 1, 2], [0.25, 'ammo9', 6, 12]],
  sofa: [[0.45, 'ammo9', 4, 9], [0.25, 'food', 1, 1]],
  desk: [[0.6, 'ammo9', 6, 14], [0.3, 'bandage', 1, 1]],
  shelf_food: [[0.85, 'food', 1, 3], [0.5, 'water', 1, 2]],
  drinks: [[0.95, 'water', 2, 3]],
  register: [[0.45, 'ammo9', 4, 10], [0.35, 'bandage', 1, 1]],
  storage: [[0.75, 'food', 2, 3], [0.65, 'water', 1, 3]],
  med_shelf: [[0.9, 'bandage', 1, 3], [0.4, 'medkit', 1, 1]],
  med_cabinet: [[0.95, 'medkit', 1, 1], [0.5, 'bandage', 1, 2]],
  counter_med: [[0.75, 'bandage', 1, 2], [0.2, 'medkit', 1, 1]],
  toolbox: [[0.55, 'ammo9', 6, 12], [0.4, 'bandage', 1, 1]],
  parts_shelf: [[0.65, 'ammo9', 8, 14], [0.4, 'food', 1, 1]],
  backpack: [[0.85, 'food', 1, 2], [0.75, 'water', 1, 2], [0.6, 'ammo9', 8, 16], [0.45, 'bandage', 1, 2]],
  locker: [[0.95, 'ammo9', 12, 24], [0.55, 'shells', 4, 8], [0.3, 'bandage', 1, 1]],
  chief_desk: [[0.7, 'ammo9', 10, 16]],
  trunk: [[0.5, 'water', 1, 2], [0.45, 'food', 1, 2], [0.4, 'ammo9', 6, 12], [0.25, 'bandage', 1, 1]],
  truck: [[1, 'ammo9', 20, 30], [0.8, 'shells', 6, 10], [0.6, 'medkit', 1, 1]],
  ambulance: [[1, 'bandage', 2, 3], [0.85, 'medkit', 1, 1]],
  ammo_crate: [[1, 'ammo9', 24, 36], [0.85, 'shells', 8, 12]],
  body: [[0.65, 'ammo9', 6, 12], [0.45, 'bandage', 1, 1], [0.35, 'food', 1, 1], [0.3, 'water', 1, 1]],
  armory: [[1, 'shells', 16, 20], [1, 'ammo9', 60, 80], [1, 'medkit', 1, 1]],
  // xác zombie
  z_walker: [[0.28, 'ammo9', 4, 8], [0.14, 'bandage', 1, 1], [0.14, 'food', 1, 1], [0.14, 'water', 1, 1]],
  z_runner: [[0.22, 'ammo9', 4, 8], [0.12, 'water', 1, 1], [0.08, 'bandage', 1, 1]],
  z_brute: [[0.8, 'ammo9', 10, 20], [0.45, 'medkit', 1, 1], [0.45, 'shells', 4, 8]],
  z_cop: [[0.95, 'ammo9', 10, 18], [0.35, 'bandage', 1, 1], [0.2, 'shells', 2, 4]],
  z_soldier: [[0.8, 'ammo9', 14, 24], [0.65, 'shells', 4, 8], [0.35, 'medkit', 1, 1]],
};
// đồ cố định (nhiệm vụ / vũ khí)
const FIXED = {
  fuel: [['fuel', 1]],
  radio_desk: [['part', 1]],
  truck: [['part', 1], ['shotgun', 1]],
  chief_desk: [['key', 1]],
  armory: [['shotgun', 1], ['smg', 1]],
};
export const SEARCH_TIME = { fridge: 1.0, drinks: 1.0, trunk: 2.0, truck: 2.4, armory: 2.4, ammo_crate: 1.8, body: 1.4, corpse: 1.3, storage: 1.8, shelf_food: 1.5 };
export const searchTime = (kind) => SEARCH_TIME[kind] || 1.6;

const rint = (a, b, r) => a + Math.floor(r() * (b - a + 1));
// tung đồ cho một chỗ lục soát; questDone(item) cho biết vật phẩm nhiệm vụ đã không còn cần
export function rollLoot(kind, r = Math.random, questDone = () => false) {
  const out = [];
  for (const [it, n] of FIXED[kind] || []) if (!(ITEMS[it].quest && questDone(it))) out.push([it, n]);
  for (const [p, it, a, b] of L[kind] || []) if (r() < p) out.push([it, rint(a, b, r)]);
  if (!out.length && kind.startsWith('z_') === false && r() < 0.5) out.push([r() < 0.5 ? 'food' : 'water', 1]);
  return out;
}
