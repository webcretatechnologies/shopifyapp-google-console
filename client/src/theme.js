// Central app theme. Edit values here to retheme the whole app at once.
// Use these constants instead of hardcoding hex values inline.

export const COLORS = {
  // Primary / accent — the "selected" / "active" / "primary action" color
  // Matches Shopify admin's near-black brand fill.
  accent:        '#1a1a1a',
  accentHover:   '#000000',
  accentSubtle:  '#303030',

  // Text
  text:          '#202223',
  textSubdued:   '#6d7175',
  textInverse:   '#ffffff',

  // Surfaces
  surface:       '#ffffff',
  surfaceMuted:  '#fafbfb',
  surfaceHover:  '#f6f6f7',

  // Borders
  border:        '#e1e3e5',
  borderStrong:  '#cccccc',
  borderMuted:   '#f1f2f3',

  // Status
  success:       '#008060',
  successBg:     '#e3f1df',
  warning:       '#c05717',
  warningBg:     '#fff5ea',
  critical:      '#d82c0d',
  criticalBg:    '#ffd7d5',

  // Chart palette — distinct hues for line/bar charts. Replace any of these to
  // recolor charts without touching individual files (charts already import
  // from CHART_COLORS where possible).
  chart: {
    primary:    '#1a1a1a',  // sessions / clicks
    secondary:  '#303030',  // impressions
    tertiary:   '#404040',
    success:    '#50b83c',  // users
    info:       '#47c1bf',  // new_users
    warning:    '#e67e22',  // spend / bounce
    accent:     '#1a73e8',  // ctr / link
    positive:   '#137333',  // up trends
    negative:   '#e37400',  // position / warnings
  },
};

// Reusable button styles — black "primary" + white "secondary" segmented look,
// matches Shopify admin selected/unselected buttons.
export const BUTTON_STYLES = {
  base: {
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: 1.4,
    transition: 'background 120ms ease, color 120ms ease',
  },
  primary: {
    background: COLORS.accent,
    color: COLORS.textInverse,
    boxShadow: `0 0 0 1px ${COLORS.accent} inset`,
  },
  secondary: {
    background: COLORS.surface,
    color: COLORS.accentSubtle,
    boxShadow: `0 0 0 1px ${COLORS.borderStrong} inset, 0 -1px 0 0 #b5b5b5 inset`,
  },
};

// Helper: returns the right segmented-button style based on selected state
export function segButtonStyle(selected) {
  return {
    ...BUTTON_STYLES.base,
    ...(selected ? BUTTON_STYLES.primary : BUTTON_STYLES.secondary),
  };
}
