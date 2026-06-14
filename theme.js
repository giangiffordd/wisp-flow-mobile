// ─────────────────────────────────────────────────────────────────
//  WispFlow Design Tokens — Aligned with ICPI Web Admin Dashboard
// ─────────────────────────────────────────────────────────────────

export const COLORS = {
  // Backgrounds
  pageBg:        '#F8FAFC',   // main content background (near-white)
  cardBg:        '#FFFFFF',   // card / panel background
  inputBg:       '#F1F5F9',   // input field fill

  // Dark header / sidebar (matches ICPI dark navy sidebar)
  headerBg:      '#1A2332',   // deep navy
  headerBorder:  '#253347',   // slightly lighter navy border
  headerBgAlt:   '#1E2937',   // alternate dark (secondary nav)

  // Primary brand blue (ICPI button / active state)
  primary:       '#2563EB',
  primaryLight:  '#DBEAFE',
  primaryMuted:  '#EFF6FF',

  // Text hierarchy
  textDark:      '#0F172A',   // primary headings
  textMid:       '#1E293B',   // body text
  textMuted:     '#64748B',   // secondary / placeholder
  textLight:     '#94A3B8',   // very light helper text
  textOnDark:    '#F8FAFC',   // text on dark header

  // Borders
  borderLight:   '#E2E8F0',
  borderMid:     '#CBD5E1',

  // Status colours (mirrors ICPI status badges)
  successGreen:  '#10B981',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',

  warningAmber:  '#F59E0B',
  warningBg:     '#FFFBEB',
  warningBorder: '#FEF3C7',

  errorRed:      '#EF4444',
  errorBg:       '#FEF2F2',
  errorBorder:   '#FECACA',

  lowStockRed:   '#EF4444',
  lowStockBg:    '#FEF2F2',

  outStockGray:  '#64748B',
  outStockBg:    '#F1F5F9',

  // WispFlow brand colours (kept for logo only)
  brandBlue:     '#B8D4E8',
  brandNavy:     '#2B3441',

  white:         '#FFFFFF',
};

// Shared shadow preset (light card shadow)
export const SHADOW_SM = {
  shadowColor:   '#0F172A',
  shadowOffset:  { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius:  6,
  elevation:     2,
};

export const SHADOW_MD = {
  shadowColor:   '#0F172A',
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius:  10,
  elevation:     4,
};
