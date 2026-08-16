// Maps stored icon names (web/Lucide kebab-case, or mobile camelCase) to the
// mobile Icon set so categories/goals show a real, distinct glyph instead of a
// generic fallback. The mobile Icon set has ~99 glyphs — keep VALID in sync with
// the keys in components/Icon.js so any already-mobile name passes straight through.

const VALID = new Set([
  'home', 'arrowUpDown', 'calendar', 'barChart', 'menu', 'more', 'wallet',
  'trendingUp', 'trendingDown', 'scale', 'plus', 'bell', 'shield', 'target',
  'creditCard', 'car', 'utensils', 'shopping', 'film', 'zap', 'piggy', 'receipt',
  'chevronRight', 'chevronLeft', 'chevronDown', 'chevronUp', 'check', 'x', 'search',
  'alertTriangle', 'sparkles', 'pencil', 'trash', 'userCircle', 'share', 'filter',
  'plane', 'coffee', 'gift', 'heart', 'book', 'graduationCap', 'briefcase',
  'dollarSign', 'coins', 'banknote', 'landmark', 'phone', 'smartphone', 'wifi',
  'tv', 'gamepad', 'music', 'camera', 'fuel', 'bus', 'train', 'bike', 'paw',
  'shirt', 'gem', 'umbrella', 'key', 'wrench', 'tree', 'sun', 'cloud', 'droplet',
  'flame', 'star', 'flag', 'mapPin', 'clock', 'lock', 'mail', 'eye', 'eyeOff',
  'messageCircle', 'award', 'calculator', 'percent', 'tag', 'ticket', 'newspaper',
  'cake', 'wine', 'pizza', 'parking', 'lightbulb', 'stethoscope', 'pill',
  'dumbbell', 'heartPulse', 'handHeart', 'church', 'building', 'package', 'scissors',
]);

// Lucide / web kebab-case names (and common synonyms) → mobile glyph. Prefer the
// most specific distinct glyph now that the mobile set is rich.
const MAP = {
  // shopping / retail
  'shopping-cart': 'shopping', 'shopping-bag': 'shopping', cart: 'shopping', bag: 'shopping',
  tag: 'tag', tags: 'tag', package: 'package', box: 'package', shirt: 'shirt', gem: 'gem', diamond: 'gem', scissors: 'scissors',
  gift: 'gift', 'party-popper': 'sparkles', ticket: 'ticket',
  // food & drink
  utensils: 'utensils', 'utensils-crossed': 'utensils', restaurant: 'utensils', apple: 'utensils',
  coffee: 'coffee', pizza: 'pizza', wine: 'wine', beer: 'wine', cake: 'cake', 'birthday-cake': 'cake',
  // transport
  car: 'car', taxi: 'car', bus: 'car', train: 'train', tram: 'train', bike: 'bike', bicycle: 'bike',
  fuel: 'fuel', 'fuel-pump': 'fuel', gas: 'fuel', parking: 'parking', plane: 'plane', 'plane-takeoff': 'plane',
  // home & utilities
  home: 'home', house: 'home', building: 'building', 'building-2': 'building', church: 'church',
  zap: 'zap', bolt: 'zap', plug: 'zap', lightbulb: 'lightbulb', flame: 'flame', fire: 'flame',
  droplet: 'droplet', droplets: 'droplet', water: 'droplet', wrench: 'wrench', tool: 'wrench', key: 'key',
  wifi: 'wifi', phone: 'phone', smartphone: 'smartphone', mobile: 'smartphone', umbrella: 'umbrella',
  // media & fun
  film: 'film', clapperboard: 'film', tv: 'tv', music: 'music', headphones: 'music',
  gamepad: 'gamepad', 'gamepad-2': 'gamepad', camera: 'camera', ticket2: 'ticket',
  // docs & work
  receipt: 'receipt', 'file-text': 'receipt', file: 'receipt', clipboard: 'receipt', newspaper: 'newspaper',
  briefcase: 'briefcase', calculator: 'calculator', percent: 'percent', mail: 'mail', 'message-circle': 'messageCircle',
  // education & growth
  'graduation-cap': 'graduationCap', book: 'book', 'book-open': 'book', award: 'award', star: 'star',
  tree: 'tree', sun: 'sun', cloud: 'cloud', flag: 'flag', 'map-pin': 'mapPin', paw: 'paw', 'paw-print': 'paw',
  // money
  wallet: 'wallet', banknote: 'banknote', cash: 'banknote', 'dollar-sign': 'dollarSign', coins: 'coins',
  'hand-coins': 'coins', landmark: 'landmark', bank: 'landmark', 'credit-card': 'creditCard', creditcard: 'creditCard',
  'piggy-bank': 'piggy', piggy: 'piggy', vault: 'piggy',
  // health & fitness
  heart: 'heart', 'heart-pulse': 'heartPulse', 'hand-heart': 'handHeart', stethoscope: 'stethoscope',
  pill: 'pill', cross: 'heartPulse', dumbbell: 'dumbbell', baby: 'heart',
  // security & meta
  shield: 'shield', 'shield-check': 'shield', lock: 'lock', target: 'target', goal: 'target', crosshair: 'target',
  'trending-up': 'trendingUp', activity: 'trendingUp', 'trending-down': 'trendingDown',
  bell: 'bell', calendar: 'calendar', search: 'search', pencil: 'pencil', pen: 'pencil', scale: 'scale',
  sparkles: 'sparkles', clock: 'clock',
};

export function normalizeIcon(name, fallback = 'shopping') {
  if (!name) return fallback;
  if (VALID.has(name)) return name; // already a mobile icon name
  const key = String(name).toLowerCase().trim();
  return MAP[key] || (VALID.has(key) ? key : fallback);
}
