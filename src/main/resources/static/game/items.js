// Vật phẩm, nguyên liệu, sách công thức, công thức chế đồ (kiểu Minecraft), vũ khí cận chiến,
// bảng rơi đồ của từng chỗ lục soát và xác zombie.
// Vào game người chơi tay trắng: lục phòng học tìm nguyên liệu và "Sách: Chế đồ cơ bản" để biết cách chế.
// Đồ lục được tính riêng cho từng người chơi (co-op: ai cũng lục được mỗi chỗ một lần).

export const ITEMS = {
  // vũ khí nóng đều là đồ tự chế (học sinh không dùng súng thật)
  ammo9: { name: 'Đạn bi tự chế', max: 40, icon: 0 },
  shells: { name: 'Đạn đinh tự chế', max: 24, icon: 1 },
  bandage: { name: 'Băng gạc', max: 8, icon: 2, use: 'heal', heal: 25, time: 1.1, give: true },
  medkit: { name: 'Hộp cứu thương', max: 4, icon: 3, use: 'heal', heal: 70, time: 2.0, give: true },
  food: { name: 'Đồ hộp', max: 8, icon: 4, use: 'eat', food: 45, time: 1.2, give: true },
  water: { name: 'Nước suối', max: 8, icon: 5, use: 'drink', water: 55, time: 0.8, give: true },
  fuel: { name: 'Can xăng', max: 1, icon: 6, quest: true },
  part: { name: 'Linh kiện bộ đàm', max: 2, icon: 7, quest: true },
  key: { name: 'Chìa khoá kho vật chứng', max: 1, icon: 8, quest: true },
  pistol: { name: 'Súng ống tự chế', max: 1, icon: 21, weapon: 1 },
  shotgun: { name: 'Súng hoa cải tự chế', max: 1, icon: 9, weapon: 2 },
  smg: { name: 'Súng bắn đinh cải tiến', max: 1, icon: 10, weapon: 3 },
  bow: { name: 'Cung gỗ', max: 1, icon: 44, weapon: 4 },
  antibio: { name: 'Kháng sinh', max: 6, icon: 11 },
  syringe: { name: 'Ống tiêm', max: 6, icon: 12 },
  antidote: { name: 'Thuốc giải', max: 4, icon: 13, use: 'cure', time: 1.4, give: true },
  flower: { name: 'Hoa bỉ ngạn', max: 3, icon: 14, hideZero: true },
  powder: { name: 'Thuốc pháo', max: 6, icon: 15, mat: true },
  casing: { name: 'Bi sắt', max: 20, icon: 16, mat: true },
  wood: { name: 'Thanh gỗ', max: 8, icon: 17, mat: true },
  torch: { name: 'Đuốc', max: 3, icon: 18, use: 'torch', time: 0.6 },
  flashlight: { name: 'Đèn pin', max: 1, icon: 19, tool: true },
  battery: { name: 'Pin', max: 6, icon: 20 },
  arrow: { name: 'Tên (cung)', max: 30, icon: 22 },
  // nguyên liệu
  cloth: { name: 'Vải vụn', max: 10, icon: 23, mat: true },
  nails: { name: 'Đinh', max: 20, icon: 24, mat: true },
  tape: { name: 'Băng keo', max: 6, icon: 25, mat: true },
  scrap: { name: 'Sắt vụn', max: 10, icon: 26, mat: true },
  cord: { name: 'Dây dù', max: 8, icon: 27, mat: true },
  bottle: { name: 'Chai rỗng', max: 6, icon: 28, mat: true },
  alcohol: { name: 'Cồn y tế', max: 6, icon: 29, mat: true },
  // sách công thức (đọc là học công thức, bấm vào sách để xem)
  book_basic: { name: 'Sách: Chế đồ cơ bản', max: 1, icon: 30, book: 'basic', hideZero: true },
  book_med: { name: 'Sổ tay y tế', max: 1, icon: 31, book: 'med', hideZero: true },
  book_arms: { name: 'Sổ tay bom xăng & bẫy', max: 1, icon: 32, book: 'arms', hideZero: true },
  book_bow: { name: 'Sổ tay bắn cung', max: 1, icon: 33, book: 'bow', hideZero: true },
  book_surv: { name: 'Cẩm nang sinh tồn', max: 1, icon: 34, book: 'surv', hideZero: true },
  // vũ khí cận chiến (có độ bền)
  knife: { name: 'Dao bếp', max: 2, icon: 35, melee: 'knife' },
  shiv: { name: 'Dao tự chế', max: 2, icon: 36, melee: 'shiv' },
  club: { name: 'Gậy gỗ', max: 2, icon: 37, melee: 'club' },
  nailbat: { name: 'Gậy đóng đinh', max: 2, icon: 38, melee: 'nailbat' },
  spear: { name: 'Giáo', max: 2, icon: 39, melee: 'spear' },
  pipe: { name: 'Ống thép', max: 2, icon: 40, melee: 'pipe' },
  // đồ dùng
  armor: { name: 'Áo giáp đệm', max: 2, icon: 41, use: 'armor', time: 1.5 },
  pack: { name: 'Ba lô tự may', max: 1, icon: 42, use: 'pack', time: 1.0 },
  molotov: { name: 'Bom xăng', max: 4, icon: 43, throw: true },
  mine: { name: 'Mìn tự chế', max: 4, icon: 46, place: true },
  cutters: { name: 'Kềm cắt', max: 1, icon: 45, quest: true },
};
export const ITEM_ORDER = [
  'book_basic', 'book_med', 'book_arms', 'book_bow', 'book_surv',
  'knife', 'shiv', 'club', 'nailbat', 'spear', 'pipe', 'molotov', 'mine', 'armor', 'pack',
  'bandage', 'medkit', 'food', 'water', 'antidote', 'antibio', 'syringe', 'flower', 'torch', 'flashlight', 'battery',
  'wood', 'cloth', 'nails', 'tape', 'scrap', 'cord', 'bottle', 'alcohol', 'powder', 'casing',
  'ammo9', 'shells', 'arrow', 'cutters', 'fuel', 'part', 'key',
];
// vũ khí cận chiến: chỉ số và độ bền (số đòn trúng trước khi gãy)
export const MELEE = {
  fist: { name: 'TAY KHÔNG', dmg: 14, rate: 0.42, reach: 1.2, arc: 0.9, dur: 0, spr: 'fist', kb: 0.35 },
  knife: { name: 'DAO BẾP', dmg: 42, rate: 0.38, reach: 1.45, arc: 1.0, dur: 140, spr: 'knife', kb: 0.5 },
  shiv: { name: 'DAO TỰ CHẾ', dmg: 34, rate: 0.36, reach: 1.4, arc: 1.0, dur: 70, spr: 'knife', kb: 0.45 },
  club: { name: 'GẬY GỖ', dmg: 30, rate: 0.55, reach: 1.7, arc: 1.15, dur: 60, spr: 'club', kb: 0.9 },
  nailbat: { name: 'GẬY ĐÓNG ĐINH', dmg: 54, rate: 0.6, reach: 1.7, arc: 1.15, dur: 90, spr: 'club', kb: 1.0 },
  spear: { name: 'GIÁO', dmg: 46, rate: 0.62, reach: 2.4, arc: 0.55, dur: 80, spr: 'spear', kb: 0.7 },
  pipe: { name: 'ỐNG THÉP', dmg: 40, rate: 0.58, reach: 1.75, arc: 1.05, dur: 160, spr: 'club', kb: 0.9 },
};
export const MELEE_ORDER = ['nailbat', 'spear', 'knife', 'pipe', 'shiv', 'club', 'fist'];

// sách công thức: tìm thấy ở đâu
export const BOOKS = {
  basic: { item: 'book_basic', name: 'Sách: Chế đồ cơ bản', where: 'bàn giáo viên trong các lớp học' },
  med: { item: 'book_med', name: 'Sổ tay y tế', where: 'tủ thuốc ở phòng y tế, nhà thuốc' },
  arms: { item: 'book_arms', name: 'Sổ tay bom xăng & bẫy', where: 'phòng bảo vệ của trường, đồn cảnh sát' },
  naryne: { item: 'powder', name: 'Vũ khí tự chế (ai cũng chế được)', where: '' },
  bow: { item: 'book_bow', name: 'Sổ tay bắn cung', where: 'giá dụng cụ ở CLB bắn cung' },
  surv: { item: 'book_surv', name: 'Cẩm nang sinh tồn', where: 'tủ đồ học sinh, quầy quần áo' },
};
// công thức chế: đặt đúng nguyên liệu vào lưới 3×3 (không cần đúng vị trí)
export const RECIPES = [
  { id: 'club', book: 'basic', out: 'club', n: 1, need: { wood: 2 } },
  { id: 'shiv', book: 'basic', out: 'shiv', n: 1, need: { scrap: 1, tape: 1 } },
  { id: 'nailbat', book: 'basic', out: 'nailbat', n: 1, need: { club: 1, nails: 3 } },
  { id: 'spear', book: 'basic', out: 'spear', n: 1, need: { wood: 2, shiv: 1 } },
  { id: 'torch', book: 'basic', out: 'torch', n: 1, need: { wood: 1, cloth: 1 } },
  { id: 'bandage', book: 'basic', out: 'bandage', n: 1, need: { cloth: 2 } },
  { id: 'medkit', book: 'med', out: 'medkit', n: 1, need: { bandage: 2, alcohol: 1 } },
  { id: 'antidote', book: 'med', out: 'antidote', n: 1, need: { antibio: 1, syringe: 1 } },
  { id: 'molotov', book: 'arms', out: 'molotov', n: 1, need: { bottle: 1, cloth: 1, alcohol: 1 } },
  // súng, đạn và mìn tự chế: ai cũng chế được khi có đủ nguyên liệu
  { id: 'pistol', book: 'naryne', out: 'pistol', n: 1, need: { pipe: 1, wood: 1, tape: 2, scrap: 1 } },
  { id: 'ammo9', book: 'naryne', out: 'ammo9', n: 4, need: { powder: 1, casing: 2 } },
  { id: 'shotgun', book: 'naryne', out: 'shotgun', n: 1, need: { pipe: 2, wood: 2, tape: 2, scrap: 2 } },
  { id: 'shells', book: 'naryne', out: 'shells', n: 2, need: { powder: 1, nails: 3 } },
  { id: 'smg', book: 'naryne', out: 'smg', n: 1, need: { scrap: 3, battery: 2, tape: 2, cord: 1 } },
  { id: 'mine', book: 'naryne', out: 'mine', n: 1, need: { powder: 2, nails: 4, tape: 1, bottle: 1 } },
  { id: 'bow', book: 'bow', out: 'bow', n: 1, need: { wood: 3, cord: 2 } },
  { id: 'arrow', book: 'bow', out: 'arrow', n: 3, need: { wood: 1, scrap: 1 } },
  { id: 'armor', book: 'surv', out: 'armor', n: 1, need: { cloth: 3, tape: 2, scrap: 2 } },
  { id: 'pack', book: 'surv', out: 'pack', n: 1, need: { cloth: 4, cord: 2 } },
];
export const ANTIDOTE_RECIPE = { antibio: 1, syringe: 1 };
export const TORCH_TIME = 150;    // giây cháy của một cây đuốc
export const BATTERY_TIME = 240;  // giây sáng của một viên pin
export const ARMOR_PTS = 60;      // điểm giáp của một áo giáp đệm

// [xác suất, vật phẩm, số lượng min, max]
const L = {
  fridge: [[0.6, 'water', 1, 2], [0.5, 'food', 1, 2], [0.3, 'bottle', 1, 1]],
  cabinet: [[0.55, 'food', 1, 2], [0.3, 'water', 1, 1], [0.4, 'bottle', 1, 1], [0.15, 'alcohol', 1, 1], [0.2, 'tape', 1, 1], [0.1, 'antibio', 1, 1]],
  wardrobe: [[0.8, 'cloth', 1, 3], [0.25, 'cord', 1, 1], [0.2, 'bandage', 1, 1], [0.1, 'syringe', 1, 1]],
  sofa: [[0.45, 'cloth', 1, 2], [0.25, 'food', 1, 1], [0.15, 'battery', 1, 1]],
  desk: [[0.5, 'tape', 1, 1], [0.3, 'battery', 1, 1], [0.2, 'bandage', 1, 1], [0.1, 'casing', 1, 2]],
  shelf_food: [[0.8, 'food', 1, 3], [0.45, 'water', 1, 2], [0.2, 'bottle', 1, 1]],
  drinks: [[0.9, 'water', 1, 3], [0.5, 'bottle', 1, 2]],
  register: [[0.3, 'tape', 1, 1], [0.3, 'battery', 1, 2], [0.15, 'bandage', 1, 1]],
  storage: [[0.65, 'food', 1, 3], [0.55, 'water', 1, 2], [0.4, 'wood', 1, 2], [0.3, 'nails', 2, 4]],
  med_shelf: [[0.6, 'bandage', 1, 2], [0.3, 'medkit', 1, 1], [0.6, 'antibio', 1, 2], [0.45, 'syringe', 1, 1], [0.5, 'alcohol', 1, 1]],
  med_cabinet: [[0.6, 'medkit', 1, 1], [0.4, 'bandage', 1, 2], [0.7, 'antibio', 1, 1], [0.6, 'syringe', 1, 1], [0.6, 'alcohol', 1, 2]],
  counter_med: [[0.5, 'bandage', 1, 2], [0.15, 'medkit', 1, 1], [0.4, 'syringe', 1, 1], [0.3, 'antibio', 1, 1], [0.4, 'alcohol', 1, 1]],
  // trường học (bên trong): thư viện, kho dụng cụ, phòng thí nghiệm, bình nước hành lang
  z_student: [[0.4, 'cloth', 1, 1], [0.3, 'food', 1, 1], [0.2, 'bandage', 1, 1], [0.15, 'tape', 1, 1], [0.15, 'water', 1, 1]],
  bookshelf: [[0.35, 'book_surv', 1, 1], [0.4, 'cloth', 1, 1], [0.25, 'tape', 1, 1], [0.2, 'cord', 1, 1]],
  tool_shelf: [[0.9, 'nails', 2, 6], [0.7, 'tape', 1, 2], [0.7, 'scrap', 1, 3], [0.6, 'wood', 1, 2], [0.5, 'cord', 1, 2], [0.3, 'pipe', 1, 1]],
  lab_shelf: [[0.8, 'alcohol', 1, 2], [0.7, 'bottle', 1, 2], [0.4, 'cloth', 1, 2], [0.3, 'syringe', 1, 1], [0.25, 'antibio', 1, 1]],
  water_cooler: [[0.85, 'water', 1, 2]],
  toolbox: [[0.8, 'nails', 2, 5], [0.5, 'tape', 1, 2], [0.6, 'scrap', 1, 2], [0.35, 'powder', 1, 1], [0.4, 'battery', 1, 2], [0.12, 'flashlight', 1, 1], [0.2, 'pipe', 1, 1]],
  parts_shelf: [[0.7, 'scrap', 1, 3], [0.5, 'nails', 2, 4], [0.5, 'battery', 1, 2], [0.3, 'casing', 1, 3], [0.3, 'cord', 1, 1]],
  backpack: [[0.7, 'food', 1, 2], [0.6, 'water', 1, 2], [0.5, 'cloth', 1, 2], [0.35, 'bandage', 1, 1], [0.25, 'antibio', 1, 1], [0.3, 'battery', 1, 1], [0.3, 'cord', 1, 1]],
  locker: [[0.35, 'casing', 3, 8], [0.2, 'nails', 1, 3], [0.45, 'casing', 1, 3], [0.3, 'tape', 1, 1], [0.2, 'antibio', 1, 1], [0.3, 'battery', 1, 2], [0.06, 'flashlight', 1, 1]],
  chief_desk: [[0.5, 'casing', 3, 6], [0.4, 'casing', 2, 4]],
  fuel: [[0.5, 'bottle', 1, 1], [0.4, 'cloth', 1, 1], [0.35, 'scrap', 1, 2], [0.2, 'alcohol', 1, 1]],
  radio_desk: [[0.6, 'battery', 1, 2], [0.5, 'cord', 1, 1], [0.4, 'scrap', 1, 2]],
  trunk: [[0.4, 'water', 1, 2], [0.35, 'food', 1, 1], [0.5, 'scrap', 1, 2], [0.3, 'tape', 1, 1], [0.3, 'cord', 1, 1], [0.3, 'bottle', 1, 1], [0.2, 'battery', 1, 1]],
  truck: [[0.6, 'casing', 4, 10], [0.4, 'nails', 2, 4], [0.6, 'powder', 1, 2], [0.5, 'medkit', 1, 1], [0.6, 'scrap', 1, 3], [0.5, 'cord', 1, 2]],
  ambulance: [[0.9, 'bandage', 1, 3], [0.7, 'medkit', 1, 1], [0.8, 'antibio', 1, 2], [0.8, 'syringe', 1, 2], [0.3, 'antidote', 1, 1], [0.7, 'alcohol', 1, 2]],
  ammo_crate: [[1, 'casing', 8, 14], [0.7, 'nails', 3, 5], [0.6, 'powder', 1, 2], [0.6, 'casing', 2, 5]],
  body: [[0.5, 'cloth', 1, 2], [0.25, 'bandage', 1, 1], [0.3, 'food', 1, 1], [0.25, 'water', 1, 1], [0.2, 'battery', 1, 1], [0.15, 'syringe', 1, 1], [0.1, 'casing', 1, 3]],
  armory: [[1, 'nails', 6, 10], [1, 'casing', 16, 24], [1, 'medkit', 1, 1], [1, 'powder', 2, 3]],
  // trường học
  teacher_desk: [[0.5, 'tape', 1, 1], [0.35, 'battery', 1, 1], [0.3, 'bandage', 1, 1], [0.3, 'food', 1, 1]],
  school_bag: [[0.6, 'food', 1, 1], [0.5, 'water', 1, 1], [0.35, 'tape', 1, 1], [0.35, 'cloth', 1, 2], [0.2, 'battery', 1, 1]],
  locker_school: [[0.5, 'cloth', 1, 2], [0.35, 'food', 1, 1], [0.35, 'wood', 1, 1], [0.3, 'cord', 1, 1], [0.3, 'book_surv', 1, 1]],
  med_bed: [[0.7, 'cloth', 1, 2], [0.4, 'bandage', 1, 1], [0.3, 'alcohol', 1, 1], [0.2, 'syringe', 1, 1]],
  guard_desk: [[0.5, 'casing', 3, 6], [0.6, 'battery', 1, 2], [0.4, 'food', 1, 1], [0.4, 'tape', 1, 1]],
  mall_guard: [[0.7, 'battery', 1, 3], [0.4, 'bandage', 1, 1], [0.3, 'casing', 1, 3]],
  canteen_counter: [[0.8, 'food', 1, 3], [0.6, 'water', 1, 2], [0.6, 'bottle', 1, 2]],
  sports_rack: [[0.8, 'wood', 1, 2], [0.7, 'cord', 1, 2], [0.3, 'tape', 1, 1], [0.3, 'water', 1, 1]],
  storage_club: [[0.7, 'wood', 1, 3], [0.5, 'cord', 1, 1], [0.4, 'nails', 2, 4], [0.4, 'food', 1, 1]],
  // phố chợ
  mall_shelf: [[0.5, 'food', 1, 2], [0.4, 'water', 1, 2], [0.3, 'tape', 1, 1], [0.3, 'cloth', 1, 2], [0.3, 'bottle', 1, 1], [0.08, 'book_surv', 1, 1]],
  electronics: [[0.9, 'battery', 1, 3], [0.25, 'flashlight', 1, 1], [0.4, 'tape', 1, 1], [0.3, 'scrap', 1, 2]],
  clothes: [[0.9, 'cloth', 2, 3], [0.4, 'cord', 1, 1], [0.15, 'book_surv', 1, 1]],
  seed_shelf: [[0.5, 'food', 1, 1], [0.08, 'flower', 1, 1], [0.4, 'water', 1, 1], [0.4, 'cord', 1, 1]],
  pots: [[0.6, 'wood', 1, 2], [0.12, 'flower', 1, 1], [0.3, 'bottle', 1, 1]],
  wood_pile: [[1, 'wood', 2, 4]],
  stall: [[0.6, 'food', 1, 2], [0.35, 'water', 1, 1], [0.3, 'wood', 1, 1], [0.3, 'cloth', 1, 1], [0.3, 'bottle', 1, 1]],
  // xác zombie
  z_walker: [[0.25, 'cloth', 1, 1], [0.08, 'bandage', 1, 1], [0.1, 'food', 1, 1], [0.1, 'water', 1, 1], [0.05, 'antibio', 1, 1], [0.05, 'syringe', 1, 1], [0.06, 'battery', 1, 1], [0.08, 'scrap', 1, 1]],
  z_runner: [[0.2, 'cloth', 1, 1], [0.1, 'water', 1, 1], [0.08, 'tape', 1, 1]],
  z_brute: [[0.4, 'medkit', 1, 1], [0.35, 'casing', 2, 5], [0.3, 'powder', 1, 1], [0.4, 'scrap', 1, 3]],
  z_cop: [[0.25, 'casing', 2, 5], [0.4, 'casing', 1, 3], [0.3, 'bandage', 1, 1], [0.1, 'antibio', 1, 1], [0.15, 'battery', 1, 1], [0.2, 'tape', 1, 1]],
  z_soldier: [[0.3, 'casing', 3, 6], [0.2, 'nails', 1, 2], [0.25, 'powder', 1, 1], [0.3, 'medkit', 1, 1], [0.2, 'syringe', 1, 1], [0.3, 'cord', 1, 1]],
  z_bloater: [[0.5, 'antibio', 1, 1], [0.4, 'cloth', 1, 2], [0.3, 'alcohol', 1, 1]],
  z_spitter: [[0.5, 'syringe', 1, 1], [0.35, 'antibio', 1, 1], [0.3, 'bottle', 1, 1]],
  z_pouncer: [[0.45, 'bandage', 1, 2], [0.3, 'battery', 1, 1], [0.3, 'cord', 1, 1]],
  z_charger: [[0.6, 'medkit', 1, 1], [0.4, 'powder', 1, 2], [0.5, 'scrap', 1, 3]],
  z_weeper: [[0.6, 'flower', 1, 1], [0.6, 'antidote', 1, 1]],
  // Zombie Chúa: mang theo thuốc và mẫu thử của phòng thí nghiệm
  z_lord: [[1, 'antidote', 2, 3], [1, 'medkit', 1, 2], [1, 'syringe', 1, 2], [1, 'antibio', 1, 2], [0.8, 'powder', 2, 3], [0.6, 'battery', 1, 2]],
};
// đồ cố định (sách, nguyên liệu chế súng); đồ nhiệm vụ đặt ngẫu nhiên mỗi ván (main.js: QSPOTS)
const FIXED = {
  chief_desk: [['book_arms', 1]],
  armory: [['powder', 3], ['pipe', 1]],
  guard_desk: [['pipe', 1], ['flashlight', 1], ['book_arms', 1]],
  mall_guard: [['flashlight', 1]],
  teacher_desk: [['book_basic', 1]],
  med_cabinet: [['book_med', 1]],
  sports_rack: [['book_bow', 1], ['bow', 1]],
  canteen_counter: [['knife', 1]],
};
// bảng rơi đồ (để hiện "nhặt ở đâu" trong bảng hướng dẫn vật phẩm)
export const LOOT = L, FIXED_LOOT = FIXED;
export const SEARCH_TIME = { fridge: 1.0, drinks: 1.0, trunk: 2.0, truck: 2.4, armory: 2.4, ammo_crate: 1.8, body: 1.4, corpse: 1.3, storage: 1.8, shelf_food: 1.5, wood_pile: 1.2, stall: 1.3 };
export const searchTime = (kind) => SEARCH_TIME[kind] || 1.6;

const rint = (a, b, r) => a + Math.floor(r() * (b - a + 1));
// tung đồ cho một chỗ lục soát; questDone(item) cho biết vật phẩm nhiệm vụ / sách đã không còn cần
export function rollLoot(kind, r = Math.random, questDone = () => false) {
  const out = [];
  for (const [it, n] of FIXED[kind] || []) if (!((ITEMS[it].quest || ITEMS[it].book) && questDone(it))) out.push([it, n]);
  for (const [p, it, a, b] of L[kind] || []) if (r() < p && !(ITEMS[it].book && questDone(it))) out.push([it, rint(a, b, r)]);
  if (!out.length && kind.startsWith('z_') === false && r() < 0.5) out.push([r() < 0.5 ? 'cloth' : 'wood', 1]);
  return out;
}
