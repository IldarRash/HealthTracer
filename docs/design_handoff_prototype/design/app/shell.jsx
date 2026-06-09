/* shell.jsx — single LIGHT app frame. The sidebar + top bar never theme-flip
   anymore (fixes the jarring light↔dark navigation). Data screens keep this
   same light chrome and inlay dark "instrument" cards instead.
   The `theme`/`dark` props are accepted but ignored — chrome is always light. */

function NavItem({ icon, label, active, badge, onClick }) {
  const fg = active ? L.ink : L.mut;
  return (
    <div className="htNav" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px',
      borderRadius: 10, background: active ? L.panel2 : 'transparent', color: fg, position: 'relative',
      fontSize: 15, fontWeight: active ? 600 : 500, cursor: 'pointer' }}>
      {active && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3,
        background: M.green }} />}
      <Icon name={icon} size={19} sw={active ? 2 : 1.7} stroke={active ? L.ink : L.mut} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge}
    </div>
  );
}

function AppShell({ active = 'chat', plan = 'Free', children, contentBg }) {
  const sideBg = L.panel;
  const sideLine = L.line;
  // prototype layout mode: 'flow' lets tall screens scroll the page with a sticky sidebar.
  const flow = typeof window !== 'undefined' && window.__htFlow === 'flow';
  const nav = (id) => { if (typeof window !== 'undefined' && window.__htNav) window.__htNav(id); };
  return (
    <div style={{ display: 'flex', width: '100%', height: flow ? 'auto' : '100%',
      minHeight: flow ? '100%' : undefined, alignItems: flow ? 'stretch' : undefined, fontFamily: FONT,
      background: L.bg, color: L.ink, overflow: flow ? 'visible' : 'hidden' }}>
      {/* Sidebar — always light */}
      <div style={{ width: 244, flexShrink: 0, background: sideBg, borderRight: `1px solid ${sideLine}`,
        display: 'flex', flexDirection: 'column', padding: '18px 14px 14px',
        position: flow ? 'sticky' : undefined, top: flow ? 0 : undefined,
        height: flow ? 'calc(100vh - 52px)' : undefined, alignSelf: flow ? 'flex-start' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 18px' }}>
          <Mark size={26} />
          <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: -0.2, color: L.ink }}>Health Tracer</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon="chat" label="Чат" active={active === 'chat'} onClick={() => nav('chat')} />
          <NavItem icon="today" label="Сегодня" active={active === 'today'} onClick={() => nav('today')} />
          <NavItem icon="longevity" label="Динамика" active={active === 'longevity'} onClick={() => nav('longevity')} />
          <NavItem icon="profile" label="Профиль" active={active === 'profile'} onClick={() => nav('profile')} />
        </div>

        <div style={{ height: 1, background: sideLine, margin: '16px 8px' }} />
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          color: L.mut2, padding: '0 11px 8px' }}>Планы · просмотр</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon="dumbbell" label="Тренировки" active={active === 'training'} onClick={() => nav('training')} />
          <NavItem icon="fork" label="Питание" active={active === 'nutrition'} onClick={() => nav('nutrition')} />
        </div>

        <div style={{ flex: 1 }} />

        {/* plan badge */}
        <div style={{ borderRadius: 12, border: `1px solid ${sideLine}`, background: '#fff',
          padding: '11px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: L.ink2 }}>
              {plan === 'Pro' ? 'Tracer Pro' : 'Бесплатный план'}</span>
            {plan === 'Pro'
              ? <Chip tone="green" style={{ padding: '2px 8px' }}>PRO</Chip>
              : <Chip tone="amber" style={{ padding: '2px 8px' }}>FREE</Chip>}
          </div>
          {plan !== 'Pro' && <div style={{ fontSize: 12.5, color: L.mut, marginTop: 6, lineHeight: 1.4 }}>
            Осталось 4 из 10 сообщений сегодня</div>}
        </div>

        {/* user */}
        <div className="htNav" onClick={() => nav('profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px',
          borderRadius: 10, cursor: 'pointer' }}>
          <Avatar who="user" size={30} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>Алина</div>
            <div style={{ fontSize: 12, color: L.mut }}>Цель: энергия</div>
          </div>
          <Icon name="chevR" size={15} stroke={L.mut2} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, height: flow ? 'auto' : '100%',
        minHeight: flow ? 'calc(100vh - 52px)' : undefined, overflow: flow ? 'visible' : 'hidden',
        background: contentBg || L.bg, position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

// Topbar — always light (part of the interface frame)
function TopBar({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '24px 34px 20px', borderBottom: `1px solid ${L.line}`, background: L.paper }}>
      <div>
        {sub && <Eyebrow style={{ marginBottom: 7, color: L.mut2 }}>{sub}</Eyebrow>}
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: L.ink }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

Object.assign(window, { AppShell, NavItem, TopBar });
