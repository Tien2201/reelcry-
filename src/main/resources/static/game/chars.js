// Năm nhân vật chơi được: không có kỹ năng riêng, chỉ khác nhau ở máu và tốc độ
// (bạn nam trâu hơn, bạn nữ di chuyển nhanh hơn). Hệ số gameplay chung nằm trong BASE_MOD.

export const BASE_MOD = {
  meleeDmg: 1, meleeRate: 1, gunDmg: 1, bowDmg: 1, bowRate: 1, bowPierce: 0, reload: 1,
  craftTime: 1, healMul: 1, reviveTime: 1, maxHp: 0, infectTime: 300, carry: 1,
  detect: 1, bite: 1, dodge: 0, stamina: 1, speed: 0,
  camTime: 25, camLoot: 0, battery: 1, search: 1, arrows: 3, arrowRecover: 0.6,
  takedown: 0, lift: 0, liftTime: 1, hack: 0, antidoteOut: 1, ammoCraft: 0, shove: 0, shoveCd: 1,
};

export const CHARS = [
  {
    id: 'lycas', name: 'Lycas', nat: 'Mỹ', role: 'Nam · mê công nghệ', color: '#6aa0e8', hp: 110, speed: 4.25, scale: 0.88,
    desc: 'Nhỏ con nhưng lanh lợi. Máu khá, tốc độ bình thường.',
    mod: {},
    pal: { hair: '#7a4a2a', hairS: '#4e2e18', hairL: '#a06a3e', top: '#4a5a6a', topS: '#34404c', topL: '#6a7a8a', scarf: '#3a7ac8', scarfS: '#2a5a96' },
  },
  {
    id: 'ama', name: 'Ama', nat: 'Đức', role: 'Nữ · đội trưởng đội võ', color: '#e86a5a', hp: 95, speed: 4.75, scale: 1,
    desc: 'Đội trưởng đội võ của trường. Di chuyển nhanh, máu ít hơn các bạn nam.',
    mod: {},
    pal: { hair: '#e8c86a', hairS: '#b8943a', hairL: '#fff0a8', top: '#c83a3a', topS: '#962424', topL: '#e86a5a', scarf: '#f0ece4', scarfS: '#b8b4ac' },
  },
  {
    id: 'naryne', name: 'Naryne', nat: 'Nhật', role: 'Nữ · mê hoá sinh', color: '#c88ae8', hp: 90, speed: 4.8, scale: 0.96,
    desc: 'Tiểu thư mê hoá sinh, người duy nhất biết tự chế súng, đạn và mìn. Nhanh nhất nhóm, máu ít nhất.',
    mod: {},
    pal: { hair: '#1a1a24', hairS: '#0c0c12', hairL: '#3a3a4a', top: '#e8e4f0', topS: '#b8b0c8', topL: '#ffffff', scarf: '#c8283a', scarfS: '#8a1a28' },
  },
  {
    id: 'hamble', name: 'Hamble', nat: 'Angola', role: 'Nam · cầu thủ bóng rổ', color: '#f2a13e', hp: 150, speed: 4.05, scale: 1.13,
    desc: 'Cầu thủ bóng rổ to khoẻ. Máu trâu nhất nhóm, đi chậm nhất.',
    mod: {},
    pal: { skin: '#7a4a2e', skinS: '#5a321c', skinL: '#9a6440', hair: '#14100e', hairS: '#080606', hairL: '#2a2420', top: '#e86a1a', topS: '#b04a10', topL: '#ff9a4a', scarf: '#2a2a30', scarfS: '#16161a', blush: '#9a5a4a', mouth: '#5a2a22' },
  },
  {
    id: 'tien', name: 'Tiến', nat: 'Việt Nam', role: 'Nam · hot boy', color: '#88c870', hp: 120, speed: 4.3, scale: 1.02,
    desc: 'Hot boy toàn diện. Máu trâu, tốc độ bình thường.',
    mod: {},
    pal: { hair: '#14141c', hairS: '#08080c', hairL: '#34344a', top: '#2a3a5a', topS: '#1c2840', topL: '#4a5a7a', scarf: '#88c870', scarfS: '#5a9a48' },
  },
];
export const charIndex = (id) => Math.max(0, CHARS.findIndex((c) => c.id === id));

// cây kỹ năng: 3 nhánh × 3 ô, học theo thứ tự trong nhánh, mỗi ô tốn 1 điểm
const N = (id, name, desc, mod) => ({ id, name, desc, mod });
export const SKILLS = {
  lycas: [
    { name: 'Hack', nodes: [N('l1', 'Camera tầm xa', 'Xem camera lâu hơn 15 giây', { camTime: 45 }), N('l2', 'Đánh dấu đồ', 'Khi hack, thấy chỗ còn đồ chưa lục', { camLoot: 1 }), N('l3', 'Chuyên gia', 'Xem camera lâu hơn nữa (65 giây)', { camTime: 65 })] },
    { name: 'Thiết bị', nodes: [N('l4', 'Pin bền', 'Đèn pin sáng lâu gấp rưỡi', { battery: 1.5 }), N('l5', 'Tay nhanh', 'Lục soát nhanh hơn', { search: 0.7 }), N('l6', 'Thợ máy', 'Pin bền gấp đôi, chế đồ nhanh hơn', { battery: 2, craftTime: 0.8 })] },
    { name: 'Lẩn trốn', nodes: [N('l7', 'Bước nhẹ', 'Zombie phát hiện muộn hơn', { detect: 0.6 }), N('l8', 'Dai sức', 'Hồi sức chạy nhanh hơn', { stamina: 1.35 }), N('l9', 'Bóng ma', 'Zombie gần như không thấy bạn', { detect: 0.45 })] },
  ],
  ama: [
    { name: 'Võ', nodes: [N('a1', 'Đòn nặng', 'Cận chiến mạnh gấp 2,4', { meleeDmg: 2.4 }), N('a2', 'Liên hoàn', 'Đánh nhanh hơn', { meleeRate: 0.75 }), N('a3', 'Bậc thầy', 'Cận chiến mạnh gấp 3', { meleeDmg: 3 })] },
    { name: 'Phản đòn', nodes: [N('a4', 'Gạt đỡ', 'Ít bị cắn nhiễm hơn', { bite: 0.55 }), N('a5', 'Né đòn', '15% né được đòn', { dodge: 0.15 }), N('a6', 'Phản xạ', '30% né được đòn', { dodge: 0.3 })] },
    { name: 'Đội trưởng', nodes: [N('a7', 'Rèn luyện', 'Thêm 20 máu', { maxHp: 20 }), N('a8', 'Bền bỉ', 'Hồi sức chạy nhanh hơn', { stamina: 1.45 }), N('a9', 'Thép', 'Thêm 40 máu', { maxHp: 40 })] },
  ],
  naryne: [
    { name: 'Hoá sinh', nodes: [N('n1', 'Pha nhanh', 'Chế đồ cực nhanh', { craftTime: 0.35 }), N('n2', 'Thuốc súng', 'Chế đạn ra thêm 2 viên', { ammoCraft: 2 }), N('n3', 'Công thức của cha', 'Mỗi lần chế thuốc giải ra 3 lọ', { antidoteOut: 3 })] },
    { name: 'Y tế', nodes: [N('n4', 'Băng bó khéo', 'Hồi máu nhiều hơn', { healMul: 1.7 }), N('n5', 'Cấp cứu', 'Cứu bạn gục rất nhanh', { reviveTime: 0.45 }), N('n6', 'Bác sĩ', 'Hồi máu gấp đôi', { healMul: 2 })] },
    { name: 'Huyết thống', locked: 'Mở theo cốt truyện', nodes: [N('n7', '???', 'Bí mật', {}), N('n8', '???', 'Bí mật', {}), N('n9', '???', 'Bí mật', {})] },
  ],
  hamble: [
    { name: 'Sức mạnh', nodes: [N('h1', 'Tay to', 'Cận chiến mạnh hơn', { meleeDmg: 1.7 }), N('h2', 'Lực sĩ', 'Nâng cổng nhanh gấp đôi', { liftTime: 0.5 }), N('h3', 'Búa tạ', 'Cận chiến mạnh gấp đôi', { meleeDmg: 2.1 })] },
    { name: 'Sức bền', nodes: [N('h4', 'Da dày', 'Thêm 50 máu', { maxHp: 50 }), N('h5', 'Miễn dịch', '10 phút mới hoá zombie', { infectTime: 600 }), N('h6', 'Ba lô to', 'Mang gấp đôi đồ', { carry: 2 })] },
    { name: 'Xung phong', nodes: [N('h7', 'Húc', 'Phím G: húc văng zombie xung quanh', { shove: 1 }), N('h8', 'Hồi phục', 'Húc lại nhanh hơn', { shoveCd: 0.55 }), N('h9', 'Lá chắn', 'Ít bị cắn nhiễm hơn', { bite: 0.6 })] },
  ],
  tien: [
    { name: 'Bắn cung', nodes: [N('t1', 'Mắt diều hâu', 'Tên mạnh hơn 40%', { bowDmg: 1.4 }), N('t2', 'Kéo nhanh', 'Bắn cung nhanh hơn', { bowRate: 0.7 }), N('t3', 'Xuyên giáp', 'Tên xuyên qua 2 zombie', { bowPierce: 2 })] },
    { name: 'Chế tên', nodes: [N('t4', 'Thợ tên', 'Một thanh gỗ làm 6 tên', { arrows: 6 }), N('t5', 'Nhặt lại', 'Hầu như luôn nhặt lại được tên', { arrowRecover: 0.9 }), N('t6', 'Xưởng tên', 'Một thanh gỗ làm 8 tên', { arrows: 8 })] },
    { name: 'Toàn diện', nodes: [N('t7', 'Xạ thủ', 'Súng mạnh hơn 30%', { gunDmg: 1.3 }), N('t8', 'Thay đạn nhanh', 'Nạp đạn nhanh hơn', { reload: 0.65 }), N('t9', 'Thể lực', 'Hồi sức chạy nhanh hơn', { stamina: 1.3 })] },
  ],
};
// không còn kỹ năng riêng / cây kỹ năng: ai cũng dùng hệ số chung
export function computeMod() {
  return { ...BASE_MOD };
}
export const xpNeed = (lv) => 60 + lv * 45;
