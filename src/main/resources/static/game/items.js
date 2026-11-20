// Vật phẩm, công thức chế tạo, bảng rơi đồ của từng loại chỗ lục soát và xác zombie.
// Đồ lục được tính riêng cho từng người chơi (co-op: ai cũng lục được mỗi chỗ một lần).
// Súng rất hiếm (cả game chỉ có súng lục ở phòng bảo vệ trường và shotgun ở kho súng đồn cảnh sát),
// đạn ít: phải nhặt thuốc súng + vỏ đạn để tự chế.

export const ITEMS = {
  ammo9: { name: 'Đạn 9mm', max: 60, icon: 0 },
  shells: { name: 'Đạn ghém', max: 24, icon: 1 },
  bandage: { name: 'Băng gạc', max: 8, icon: 2, use: 'heal', heal: 25, time: 1.1, give: true },
  medkit: { name: 'Hộp cứu thương', max: 4, icon: 3, use: 'heal', heal: 70, time: 2.0, give: true },
  food: { name: 'Đồ hộp', max: 8, icon: 4, use: 'eat', food: 45, time: 1.2, give: true },
  water: { name: 'Nước suối', max: 8, icon: 5, use: 'drink', water: 55, time: 0.8, give: true },
  fuel: { name: 'Can xăng', max: 1, icon: 6, quest: true },
  part: { name: 'Linh kiện bộ đàm', max: 2, icon: 7, quest: true },
  key: { name: 'Chìa khoá kho súng', max: 1, icon: 8, quest: true },
  pistol: { name: 'Súng lục', max: 1, icon: 21, weapon: 1 },
  shotgun: { name: 'Shotgun', max: 1, icon: 9, weapon: 2 },
  smg: { name: 'Tiểu liên', max: 1, icon: 10, weapon: 3 },
  antibio: { name: 'Kháng sinh', max: 6, icon: 11 },
  syringe: { name: 'Ống tiêm', max: 6, icon: 12 },
  antidote: { name: 'Thuốc giải', max: 4, icon: 13, use: 'cure', time: 1.4, give: true },
  flower: { name: 'Hoa bỉ ngạn', max: 3, icon: 14, hideZero: true },
  powder: { name: 'Thuốc súng', max: 6, icon: 15 },
  casing: { name: 'Vỏ đạn', max: 20, icon: 16 },
  wood: { name: 'Thanh gỗ', max: 6, icon: 17 },
  torch: { name: 'Đuốc', max: 3, icon: 18, use: 'torch', time: 0.6 },
  flashlight: { name: 'Đèn pin', max: 1, icon: 19, tool: true },
  battery: { name: 'Pin', max: 6, icon: 20 },
};
export const ITEM_ORDER = ['bandage', 'medkit', 'food', 'water', 'antidote', 'antibio', 'syringe', 'flower', 'torch', 'wood', 'flashlight', 'battery', 'ammo9', 'shells', 'powder', 'casing', 'fuel', 'part', 'key'];
// công thức chế thuốc giải (giữ tên cũ cho chỗ khác dùng)
export const ANTIDOTE_RECIPE = { antibio: 1, syringe: 1 };
// các công thức chế tạo trong ba lô
export const RECIPES = [
  { id: 'antidote', out: 'antidote', n: 1, need: { antibio: 1, syringe: 1 }, time: 3, label: 'Chế thuốc giải' },
  { id: 'ammo9', out: 'ammo9', n: 5, need: { powder: 1, casing: 1 }, time: 2.5, label: 'Chế 5 đạn 9mm' },
  { id: 'shells', out: 'shells', n: 2, need: { powder: 1, casing: 1 }, time: 2.5, label: 'Chế 2 đạn ghém' },
  { id: 'torch', out: 'torch', n: 1, need: { wood: 1 }, time: 1.5, label: 'Làm đuốc' },
];
export const TORCH_TIME = 150;    // giây cháy của một cây đuốc
export const BATTERY_TIME = 240;  // giây sáng của một viên pin

// [xác suất, vật phẩm, số lượng min, max]
const L = {
  fridge: [[0.7, 'water', 1, 2], [0.55, 'food', 1, 2]],
  cabinet: [[0.65, 'food', 1, 2], [0.35, 'water', 1, 1], [0.3, 'bandage', 1, 1], [0.15, 'antibio', 1, 1], [0.15, 'battery', 1, 1]],
  wardrobe: [[0.6, 'bandage', 1, 2], [0.12, 'syringe', 1, 1], [0.3, 'wood', 1, 1]],
  sofa: [[0.25, 'food', 1, 1], [0.08, 'ammo9', 1, 3], [0.15, 'battery', 1, 1]],
  desk: [[0.3, 'bandage', 1, 1], [0.15, 'syringe', 1, 1], [0.25, 'battery', 1, 1], [0.1, 'casing', 1, 2]],
  shelf_food: [[0.85, 'food', 1, 3], [0.5, 'water', 1, 2]],
  drinks: [[0.95, 'water', 2, 3]],
  register: [[0.35, 'bandage', 1, 1], [0.3, 'battery', 1, 2]],
  storage: [[0.75, 'food', 2, 3], [0.65, 'water', 1, 3], [0.3, 'wood', 1, 2]],
  med_shelf: [[0.9, 'bandage', 1, 3], [0.4, 'medkit', 1, 1], [0.7, 'antibio', 1, 2], [0.5, 'syringe', 1, 1]],
  med_cabinet: [[0.95, 'medkit', 1, 1], [0.5, 'bandage', 1, 2], [0.75, 'antibio', 1, 1], [0.7, 'syringe', 1, 1]],
  counter_med: [[0.75, 'bandage', 1, 2], [0.2, 'medkit', 1, 1], [0.45, 'syringe', 1, 1], [0.35, 'antibio', 1, 1]],
  toolbox: [[0.45, 'powder', 1, 1], [0.5, 'wood', 1, 2], [0.4, 'battery', 1, 2], [0.12, 'flashlight', 1, 1]],
  parts_shelf: [[0.5, 'battery', 1, 2], [0.3, 'casing', 1, 3], [0.4, 'food', 1, 1], [0.15, 'syringe', 1, 1]],
  backpack: [[0.85, 'food', 1, 2], [0.75, 'water', 1, 2], [0.2, 'ammo9', 2, 4], [0.45, 'bandage', 1, 2], [0.3, 'antibio', 1, 1], [0.3, 'battery', 1, 1]],
  locker: [[0.35, 'ammo9', 3, 8], [0.2, 'shells', 1, 3], [0.45, 'casing', 1, 3], [0.3, 'bandage', 1, 1], [0.2, 'antibio', 1, 1], [0.3, 'battery', 1, 2], [0.06, 'flashlight', 1, 1]],
  chief_desk: [[0.5, 'ammo9', 3, 6], [0.4, 'casing', 2, 4]],
  trunk: [[0.5, 'water', 1, 2], [0.45, 'food', 1, 2], [0.12, 'ammo9', 2, 4], [0.25, 'bandage', 1, 1], [0.3, 'wood', 1, 1], [0.25, 'battery', 1, 1]],
  truck: [[0.6, 'ammo9', 4, 10], [0.4, 'shells', 2, 4], [0.6, 'powder', 1, 2], [0.6, 'medkit', 1, 1]],
  ambulance: [[1, 'bandage', 2, 3], [0.85, 'medkit', 1, 1], [0.9, 'antibio', 1, 2], [0.9, 'syringe', 1, 2], [0.35, 'antidote', 1, 1]],
  ammo_crate: [[1, 'ammo9', 8, 14], [0.7, 'shells', 3, 5], [0.6, 'powder', 1, 2], [0.6, 'casing', 2, 5]],
  body: [[0.45, 'bandage', 1, 1], [0.35, 'food', 1, 1], [0.3, 'water', 1, 1], [0.25, 'syringe', 1, 1], [0.12, 'ammo9', 1, 3], [0.2, 'battery', 1, 1]],
  armory: [[1, 'shells', 6, 10], [1, 'ammo9', 16, 24], [1, 'medkit', 1, 1], [1, 'powder', 2, 3]],
  // trường học
  teacher_desk: [[0.5, 'bandage', 1, 1], [0.35, 'antibio', 1, 1], [0.4, 'battery', 1, 1], [0.4, 'food', 1, 1]],
  school_bag: [[0.7, 'food', 1, 1], [0.6, 'water', 1, 1], [0.25, 'bandage', 1, 1], [0.2, 'battery', 1, 1]],
  locker_school: [[0.5, 'food', 1, 1], [0.4, 'water', 1, 1], [0.35, 'wood', 1, 1], [0.2, 'bandage', 1, 1]],
  med_bed: [[0.6, 'bandage', 1, 2], [0.3, 'syringe', 1, 1], [0.2, 'antibio', 1, 1]],
  guard_desk: [[0.5, 'ammo9', 3, 6], [0.6, 'battery', 1, 2], [0.4, 'food', 1, 1]],
  mall_guard: [[0.7, 'battery', 1, 3], [0.4, 'bandage', 1, 1], [0.3, 'casing', 1, 3]],
  canteen_counter: [[0.8, 'food', 1, 3], [0.6, 'water', 1, 2]],
  sports_rack: [[0.8, 'wood', 1, 2], [0.4, 'water', 1, 1], [0.25, 'bandage', 1, 1]],
  storage_club: [[0.6, 'wood', 1, 2], [0.5, 'food', 1, 1], [0.4, 'water', 1, 1]],
  // phố chợ
  mall_shelf: [[0.6, 'food', 1, 2], [0.5, 'water', 1, 2], [0.25, 'battery', 1, 1], [0.2, 'bandage', 1, 1]],
  electronics: [[0.9, 'battery', 1, 3], [0.25, 'flashlight', 1, 1], [0.2, 'casing', 1, 2]],
  clothes: [[0.5, 'bandage', 1, 2], [0.3, 'wood', 1, 1]],
  seed_shelf: [[0.6, 'food', 1, 1], [0.08, 'flower', 1, 1], [0.4, 'water', 1, 1]],
  pots: [[0.6, 'wood', 1, 2], [0.12, 'flower', 1, 1]],
  wood_pile: [[1, 'wood', 2, 3]],
  stall: [[0.7, 'food', 1, 2], [0.4, 'water', 1, 1], [0.25, 'wood', 1, 1]],
  // xác zombie
  z_walker: [[0.14, 'bandage', 1, 1], [0.14, 'food', 1, 1], [0.14, 'water', 1, 1], [0.06, 'antibio', 1, 1], [0.06, 'syringe', 1, 1], [0.08, 'battery', 1, 1], [0.05, 'ammo9', 1, 2]],
  z_runner: [[0.12, 'water', 1, 1], [0.08, 'bandage', 1, 1], [0.06, 'wood', 1, 1]],
  z_brute: [[0.45, 'medkit', 1, 1], [0.35, 'ammo9', 2, 5], [0.3, 'powder', 1, 1], [0.2, 'shells', 1, 2]],
  z_cop: [[0.25, 'ammo9', 2, 5], [0.4, 'casing', 1, 3], [0.35, 'bandage', 1, 1], [0.1, 'antibio', 1, 1], [0.15, 'battery', 1, 1]],
  z_soldier: [[0.3, 'ammo9', 3, 6], [0.2, 'shells', 1, 2], [0.25, 'powder', 1, 1], [0.35, 'medkit', 1, 1], [0.25, 'syringe', 1, 1], [0.2, 'antibio', 1, 1]],
  z_bloater: [[0.5, 'antibio', 1, 1], [0.4, 'food', 1, 1]],
  z_spitter: [[0.5, 'syringe', 1, 1], [0.35, 'antibio', 1, 1]],
  z_pouncer: [[0.45, 'bandage', 1, 2], [0.3, 'battery', 1, 1], [0.2, 'casing', 1, 3]],
  z_charger: [[0.7, 'medkit', 1, 1], [0.4, 'powder', 1, 2]],
  z_weeper: [[0.6, 'flower', 1, 1], [0.6, 'antidote', 1, 1]],
};
// đồ cố định (nhiệm vụ / súng / đèn pin)
const FIXED = {
  fuel: [['fuel', 1]],
  radio_desk: [['part', 1]],
  truck: [['part', 1]],
  chief_desk: [['key', 1]],
  armory: [['shotgun', 1]],
  guard_desk: [['pistol', 1], ['flashlight', 1]],
  mall_guard: [['flashlight', 1]],
};
export const SEARCH_TIME = { fridge: 1.0, drinks: 1.0, trunk: 2.0, truck: 2.4, armory: 2.4, ammo_crate: 1.8, body: 1.4, corpse: 1.3, storage: 1.8, shelf_food: 1.5, wood_pile: 1.2, stall: 1.3 };
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
