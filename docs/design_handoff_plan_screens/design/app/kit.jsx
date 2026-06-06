/* kit.jsx — design tokens, icons, and shared atoms.
   Two worlds: LIGHT (chat, ChatGPT-ish) and DARK (data screens, WHOOP-ish).
   Semantic metric colors are shared. Exports to window at the bottom. */

const FONT = '"Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif';
const MONO = '"SF Mono", ui-monospace, "Roboto Mono", Menlo, monospace';

// ── Color tokens ────────────────────────────────────────────────
const L = {              // light world (chat)
  bg: '#ffffff',
  panel: '#f9f9f8',
  panel2: '#f3f3f1',
  line: '#ececea',
  line2: '#e2e2df',
  ink: '#0e0e0d',
  ink2: '#3b3b38',
  mut: '#76766f',
  mut2: '#9a9a92',
  bubble: '#f4f4f2',
  field: '#ffffff',
};
const D = {              // dark world (data)
  bg: '#0b0d0e',
  panel: '#131618',
  panel2: '#1a1e21',
  elev: '#20262a',
  line: 'rgba(255,255,255,0.075)',
  line2: 'rgba(255,255,255,0.14)',
  ink: '#f3f5f6',
  ink2: '#cfd4d7',
  mut: '#878d92',
  mut2: '#5e656a',
};
// semantic metric scale (shared)
const M = {
  green: '#19c37d',   // good / recovery / done
  greenDim: 'rgba(25,195,125,0.16)',
  amber: '#f5a524',   // caution / partial
  amberDim: 'rgba(245,165,36,0.16)',
  red: '#f0506a',     // strain high / missed / alert
  redDim: 'rgba(240,80,106,0.16)',
  blue: '#3a8dff',    // strain / cardio
  blueDim: 'rgba(58,141,255,0.16)',
  indigo: '#7b7bff',  // sleep
  indigoDim: 'rgba(123,123,255,0.16)',
};

// ── Icons (single-path stroke set) ──────────────────────────────
const ICONS = {
  chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V15H6.5A2.5 2.5 0 0 1 4 12.5z',
  today: 'M4 7h16M4 12h16M4 17h10M7 3v3M17 3v3',
  longevity: 'M4 19V5M4 19h16M8 15l3-4 3 3 4-6',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  dumbbell: 'M6.5 7v10M3.5 9v6M17.5 7v10M20.5 9v6M6.5 12h11',
  fork: 'M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-2.5 0-5M17 12v9',
  moon: 'M19 13.5A7.5 7.5 0 0 1 10.5 5a7.5 7.5 0 1 0 8.5 8.5Z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  heart: 'M12 20s-7-4.6-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7-2.5C19 10 12 20 12 20Z',
  check: 'M4 12.5 9 17.5 20 6.5',
  checkSm: 'M3 8.5 6.5 12 13 4.5',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z',
  send: 'M5 12h13M12 5l7 7-7 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v8A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5zM12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  clip: 'M19 11l-7.5 7.5a4 4 0 0 1-5.7-5.7L13 5.5a2.6 2.6 0 0 1 3.7 3.7l-7.2 7.2a1.2 1.2 0 0 1-1.7-1.7L14 8',
  spark: 'M12 3v3M12 18v3M5 12H2M22 12h-3M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2',
  shield: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6z',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z',
  bed: 'M3 18v-6a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v5M3 14h18M3 18v2M21 17v3M7 10V8',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M5 9l7 7 7-7',
  info: 'M12 16v-5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  pause: 'M9 5v14M15 5v14',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M6 18l-1.5 1.5M19.5 4.5 18 6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
};
function Icon({ name, size = 20, stroke = 'currentColor', sw = 1.7, fill = 'none', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}>
      <path d={ICONS[name] || ''} />
    </svg>
  );
}

// ── Atoms ───────────────────────────────────────────────────────

// Brand mark — concentric ring (recovery-ring vibe)
function Mark({ size = 26, color = M.green, bg = 'transparent' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" style={{ display: 'block' }}>
      <circle cx="14" cy="14" r="11" fill={bg} stroke={color} strokeWidth="2.4" opacity="0.28" />
      <path d="M14 3a11 11 0 0 1 9.5 5.5" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14" cy="14" r="3.4" fill={color} />
    </svg>
  );
}

// Pill / chip
function Chip({ children, tone = 'neutral', dark, style }) {
  const map = {
    neutral: dark ? { bg: 'rgba(255,255,255,0.06)', fg: D.ink2, bd: D.line }
                  : { bg: L.panel2, fg: L.ink2, bd: 'transparent' },
    green: { bg: M.greenDim, fg: M.green, bd: 'transparent' },
    amber: { bg: M.amberDim, fg: M.amber, bd: 'transparent' },
    red: { bg: M.redDim, fg: M.red, bd: 'transparent' },
    blue: { bg: M.blueDim, fg: M.blue, bd: 'transparent' },
    indigo: { bg: M.indigoDim, fg: M.indigo, bd: 'transparent' },
  };
  const c = map[tone] || map.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      fontSize: 12.5, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
}

// Button
function Btn({ children, kind = 'primary', dark, icon, size = 'md', style, full }) {
  const pads = size === 'sm' ? '8px 12px' : size === 'lg' ? '14px 22px' : '11px 17px';
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14.5;
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: pads, fontSize: fs, fontWeight: 600, borderRadius: 12, cursor: 'pointer',
    border: '1px solid transparent', fontFamily: FONT, lineHeight: 1, whiteSpace: 'nowrap',
    width: full ? '100%' : 'auto' };
  const kinds = {
    primary: { background: L.ink, color: '#fff' },
    accept: { background: M.green, color: '#04130c' },
    ghost: dark ? { background: 'transparent', color: D.ink2, borderColor: D.line2 }
                : { background: '#fff', color: L.ink, borderColor: L.line2 },
    soft: dark ? { background: 'rgba(255,255,255,0.06)', color: D.ink }
               : { background: L.panel2, color: L.ink },
    danger: { background: 'transparent', color: M.red, borderColor: 'rgba(240,80,106,0.4)' },
    quiet: { background: 'transparent', color: dark ? D.mut : L.mut },
  };
  return <button style={{ ...base, ...(kinds[kind] || kinds.primary), ...style }}>
    {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} sw={1.9} />}{children}
  </button>;
}

// Donut metric ring
function Ring({ value = 70, size = 92, sw = 9, color = M.green, track, label, sub, dark }) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, value)) / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={track || (dark ? 'rgba(255,255,255,0.08)' : L.panel2)} strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: size * 0.27, fontWeight: 700, color: color, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums' }}>{label != null ? label : value}</div>
        {sub && <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, marginTop: 3,
          color: dark ? D.mut : L.mut2, textTransform: 'uppercase' }}>{sub}</div>}
      </div>
    </div>
  );
}

// horizontal segmented bar (for weekly bars etc.)
function MiniBars({ data, color = M.green, h = 44, dark, gap = 5 }) {
  const max = Math.max(...data.map((d) => (typeof d === 'object' ? d.v : d)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: h }}>
      {data.map((d, i) => {
        const v = typeof d === 'object' ? d.v : d;
        const col = typeof d === 'object' && d.c ? d.c : color;
        return <div key={i} style={{ flex: 1, height: `${Math.max(6, (v / max) * 100)}%`,
          background: col, borderRadius: 3, minWidth: 4, opacity: v === 0 ? 0.18 : 1 }} />;
      })}
    </div>
  );
}

// uppercase micro label
function Eyebrow({ children, dark, color, style }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
    color: color || (dark ? D.mut : L.mut2), ...style }}>{children}</div>;
}

// avatar dot for user / coach
function Avatar({ who = 'coach', size = 28 }) {
  if (who === 'coach') return <div style={{ width: size, height: size, borderRadius: '50%',
    background: '#0e0e0d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <Mark size={size * 0.66} /></div>;
  return <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg,#d9d4cc,#b7b1a6)', color: '#3a352d', fontWeight: 700,
    fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>А</div>;
}

// Card (themeable)
function Card({ children, dark, pad = 18, style, accent }) {
  return (
    <div style={{ borderRadius: 16, padding: pad,
      background: dark ? D.panel : '#fff',
      border: `1px solid ${dark ? D.line : L.line}`,
      borderTop: accent ? `2px solid ${accent}` : undefined,
      ...style }}>{children}</div>
  );
}

// header row inside a card
function CardHead({ icon, title, color, dark, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
      {icon && <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: color ? `${color}22` : (dark ? 'rgba(255,255,255,0.06)' : L.panel2) }}>
        <Icon name={icon} size={15} stroke={color || (dark ? D.ink2 : L.ink2)} />
      </div>}
      <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: 0.2,
        color: dark ? D.ink : L.ink, flex: 1 }}>{title}</span>
      {right}
    </div>
  );
}

// big stat number
function Stat({ value, unit, label, color, dark, sub }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1,
          color: color || (dark ? D.ink : L.ink), fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 14, fontWeight: 600, color: dark ? D.mut : L.mut }}>{unit}</span>}
      </div>
      {label && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
        color: dark ? D.mut : L.mut2, marginTop: 7 }}>{label}</div>}
      {sub && <div style={{ fontSize: 12.5, color: dark ? D.mut : L.mut, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// check circle (task done/undone)
function CheckCircle({ done, color = M.green, size = 22, dark }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: done ? 'none' : `2px solid ${dark ? D.line2 : L.line2}`,
      background: done ? color : 'transparent', display: 'flex',
      alignItems: 'center', justifyContent: 'center' }}>
      {done && <Icon name="checkSm" size={size * 0.6} stroke="#04130c" sw={2.6} />}
    </div>
  );
}

// thin progress bar
function Progress({ value = 50, color = M.green, dark, h = 7 }) {
  return (
    <div style={{ height: h, borderRadius: h, background: dark ? 'rgba(255,255,255,0.08)' : L.panel2,
      overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: h }} />
    </div>
  );
}

// labelled donut + caption for metric strips
function MetricDonut({ value, color, label, caption, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Ring value={value} size={68} sw={7} color={color} dark={dark} label={`${value}`} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
          color: dark ? D.mut : L.mut2, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: dark ? D.ink2 : L.ink2, fontWeight: 500 }}>{caption}</div>
      </div>
    </div>
  );
}

Object.assign(window, { FONT, MONO, L, D, M, Icon, Mark, Chip, Btn, Ring, MiniBars, Eyebrow,
  Avatar, Card, CardHead, Stat, CheckCircle, Progress, MetricDonut });
