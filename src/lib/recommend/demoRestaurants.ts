export type DemoRestaurant = {
  id: string;
  name: string;
  area: string;        // 例: "渋谷"
  genre: string;       // 例: "ビストロ"
  price: "¥" | "¥¥" | "¥¥¥";
  tags: string[];      // 例: ["静か", "デート", "カウンター", "ワイン"]
  lat: number;
  lng: number;
};

export const DEMO_RESTAURANTS: DemoRestaurant[] = [
  {
    id: "r1",
    name: "ビストロ・ルミエール",
    area: "恵比寿",
    genre: "ビストロ",
    price: "¥¥¥",
    tags: ["デート", "静か", "ワイン", "雰囲気良い"],
    lat: 35.6467,
    lng: 139.7100,
  },
  {
    id: "r2",
    name: "渋谷 まぜそば研究所",
    area: "渋谷",
    genre: "ラーメン",
    price: "¥",
    tags: ["一人", "回転速い", "ガッツリ"],
    lat: 35.6581,
    lng: 139.7017,
  },
  {
    id: "r3",
    name: "新宿 とり匠",
    area: "新宿",
    genre: "焼鳥",
    price: "¥¥",
    tags: ["友達", "ワイワイ", "予約推奨"],
    lat: 35.6938,
    lng: 139.7034,
  },
  {
    id: "r4",
    name: "代々木 やさしい定食屋",
    area: "代々木",
    genre: "定食",
    price: "¥",
    tags: ["健康的", "落ち着く", "昼にも強い"],
    lat: 35.6833,
    lng: 139.7020,
  },
  {
    id: "r5",
    name: "銀座 すし澄",
    area: "銀座",
    genre: "寿司",
    price: "¥¥¥",
    tags: ["接待", "静か", "カウンター", "特別な日"],
    lat: 35.6717,
    lng: 139.7650,
  },
  {
    id: "r6",
    name: "表参道 カフェ・アトリエ",
    area: "表参道",
    genre: "カフェ",
    price: "¥¥",
    tags: ["作業", "電源", "Wi-Fi", "昼"],
    lat: 35.6653,
    lng: 139.7121,
  },
  {
    id: "r7",
    name: "中目黒 パスタノ",
    area: "中目黒",
    genre: "イタリアン",
    price: "¥¥",
    tags: ["デート", "雰囲気良い", "パスタ"],
    lat: 35.6443,
    lng: 139.6993,
  },
  {
    id: "r8",
    name: "下北沢 スパイス軒",
    area: "下北沢",
    genre: "カレー",
    price: "¥",
    tags: ["友達", "カジュアル", "スパイス"],
    lat: 35.6619,
    lng: 139.6684,
  },
  {
    id: "r9",
    name: "六本木 バー・ノクターン",
    area: "六本木",
    genre: "バー",
    price: "¥¥¥",
    tags: ["二軒目", "静か", "大人", "夜"],
    lat: 35.6628,
    lng: 139.7310,
  },
  {
    id: "r10",
    name: "池袋 ぎょうざ百景",
    area: "池袋",
    genre: "中華",
    price: "¥",
    tags: ["安い", "腹いっぱい", "友達"],
    lat: 35.7289,
    lng: 139.7100,
  },
];
