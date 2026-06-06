/* shell.jsx — desktop app frame: left sidebar (4 tabs + secondary) + content.
   Themeable: theme="light" (chat) or theme="dark" (data screens). */

function NavItem({ icon, label, active, theme, badge, muted }) {
  const dark = theme === 'dark';
  const activeBg = dark ? 'rgba(255,255,255,0.07)' : '#ececea';
  const fg = active ? (dark ? D.ink : L.ink) : (dark ? D.mut : L.mut);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px',
      borderRadius: 10, background: active ? activeBg : 'transparent', color: fg,
      fontSize: 14.5, fontWeight: active ? 600 : 500, cursor: 'pointer', position: 'relative' }}>
      <Icon name={icon} size={19} sw={active ? 2 : 1.7} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge}
    </div>
  );
}

function AppShell({ theme = 'light', active = 'chat', plan = 'Free', children, contentBg }) {
  const dark = theme === 'dark';
  const T = dark ? D : L;
  const sideBg = dark ? '#0e1113' : L.panel;
  const sideLine = dark ? D.line : L.line;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', fontFamily: FONT,
      background: T.bg, color: dark ? D.ink : L.ink, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 244, flexShrink: 0, background: sideBg, borderRight: `1px solid ${sideLine}`,
        display: 'flex', flexDirection: 'column', padding: '18px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 18px' }}>
          <Mark size={26} />
          <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: -0.2,
            color: dark ? D.ink : L.ink }}>Health Tracer</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon="chat" label="Чат" active={active === 'chat'} theme={theme} />
          <NavItem icon="today" label="Сегодня" active={active === 'today'} theme={theme} />
          <NavItem icon="longevity" label="Динамика" active={active === 'longevity'} theme={theme} />
          <NavItem icon="profile" label="Профиль" active={active === 'profile'} theme={theme} />
        </div>

        <div style={{ height: 1, background: sideLine, margin: '16px 8px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          color: dark ? D.mut2 : L.mut2, padding: '0 11px 8px' }}>Планы · просмотр</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon="dumbbell" label="Тренировки" active={active === 'training'} theme={theme} />
          <NavItem icon="fork" label="Питание" active={active === 'nutrition'} theme={theme} />
        </div>

        <div style={{ flex: 1 }} />

        {/* plan badge */}
        <div style={{ borderRadius: 12, border: `1px solid ${sideLine}`,
          background: dark ? 'rgba(255,255,255,0.03)' : '#fff', padding: '11px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: dark ? D.ink2 : L.ink2 }}>
              {plan === 'Pro' ? 'Tracer Pro' : 'Бесплатный план'}</span>
            {plan === 'Pro'
              ? <Chip tone="green" dark={dark} style={{ padding: '2px 8px' }}>PRO</Chip>
              : <Chip tone="amber" dark={dark} style={{ padding: '2px 8px' }}>FREE</Chip>}
          </div>
          {plan !== 'Pro' && <div style={{ fontSize: 12, color: dark ? D.mut : L.mut, marginTop: 6,
            lineHeight: 1.4 }}>Осталось 4 из 10 сообщений сегодня</div>}
        </div>

        {/* user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px' }}>
          <Avatar who="user" size={30} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: dark ? D.ink : L.ink }}>Алина</div>
            <div style={{ fontSize: 11.5, color: dark ? D.mut : L.mut }}>Цель: энергия</div>
          </div>
          <Icon name="chevR" size={15} stroke={dark ? D.mut2 : L.mut2} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden',
        background: contentBg || (dark ? D.bg : L.bg), position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

// Topbar used inside content area for data screens
function TopBar({ title, sub, right, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '26px 34px 20px', borderBottom: `1px solid ${dark ? D.line : L.line}` }}>
      <div>
        {sub && <Eyebrow dark={dark} style={{ marginBottom: 7 }}>{sub}</Eyebrow>}
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5,
          color: dark ? D.ink : L.ink }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

Object.assign(window, { AppShell, NavItem, TopBar });
