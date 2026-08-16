import { hsl } from '../theme/tokens';

const TRIPLETS = ['168 76% 42%', '158 64% 45%', '200 70% 50%', '262 52% 56%', '45 93% 47%', '38 92% 50%', '350 70% 55%'];

export const COLOR_SWATCHES = TRIPLETS.map((t) => ({ value: t, color: hsl(t) }));

// `savings` matters to the money math, not just labelling: computeBalances treats
// savings/investment/retirement as NON-liquid, so it's excluded from Safe-to-Spend.
// Without this option there was no way to mark an account as savings from the app,
// and every savings balance inflated Safe-to-Spend.
export const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
];

export const EXPENSE_ICONS = [
  'shopping', 'utensils', 'coffee', 'pizza', 'wine', 'cake', 'car', 'fuel', 'bus', 'train', 'bike', 'plane',
  'home', 'zap', 'lightbulb', 'droplet', 'flame', 'wifi', 'phone', 'smartphone', 'tv', 'film', 'music', 'gamepad',
  'shirt', 'gem', 'gift', 'camera', 'book', 'graduationCap', 'briefcase', 'stethoscope', 'pill', 'heart', 'dumbbell',
  'paw', 'umbrella', 'scissors', 'wrench', 'tree', 'receipt', 'creditCard', 'wallet', 'coins', 'banknote',
  'dollarSign', 'landmark', 'building', 'church', 'tag', 'ticket', 'newspaper', 'package', 'mapPin', 'parking',
  'sparkles', 'shield', 'target', 'star', 'award', 'bell', 'calendar', 'piggy', 'handHeart', 'trendingUp', 'trendingDown',
];
export const GOAL_ICONS = [
  'target', 'shield', 'plane', 'home', 'car', 'graduationCap', 'gem', 'gift', 'heart', 'star', 'award',
  'piggy', 'wallet', 'coins', 'banknote', 'dollarSign', 'sparkles', 'trendingUp', 'umbrella', 'tree', 'building',
];
