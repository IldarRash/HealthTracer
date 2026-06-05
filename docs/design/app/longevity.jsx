/* longevity.jsx — dark weekly overview. Wellness tone: consistency, cross-domain
   trends, goal progress, "discuss with coach" prompts. No clinical scores. */

function Spark({ data, color = M.green, w = 120, h = 34 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / rng) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = data[data.length - 1], lx = w, ly = h - ((last - min) / rng) * (h - 4) - 2;
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.8" fill={color} />
    </svg>
  );
}

function TrendArrow({ dir = 'up', good = true }) {
  const color = good ? M.green : M.amber;
  const rot = dir === 'up' ? -45 : dir === 'down' ? 45 : 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}>
        <path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}

function ConsistencyHero() {
  const days = [
    { d: 'Пн', v: 90, c: M.green }, { d: 'Вт', v: 75, c: M.green }, { d: 'Ср', v: 40, c: M.amber },
    { d: 'Чт', v: 85, c: M.green }, { d: 'Пт', v: 100, c: M.green }, { d: 'Сб', v: 20, c: M.red },
    { d: 'Вс', v: 70, c: M.green },
  ];
  return (
    <Card dark pad={22} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 28 }}>
        <div style={{ flexShrink: 0 }}>
          <Eyebrow dark style={{ marginBottom: 12 }}>Консистентность недели</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2, color: M.green,
              lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>76</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: D.mut }}>%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
            <TrendArrow dir="up" /><span style={{ fontSize: 13, color: D.ink2 }}>
              <span style={{ color: M.green, fontWeight: 600 }}>+9%</span> к прошлой неделе</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <Icon name="bolt" size={14} stroke={M.amber} fill={M.amber} />
            <span style={{ fontSize: 13, color: D.mut }}>Серия: 4 дня подряд</span>
          </div>
        </div>
        <div style={{ width: 1, background: D.line }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, color: D.mut, marginBottom: 16 }}>Выполнение плана по дням</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            {days.map((d) => (
              <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 9 }}>
                <div style={{ width: '100%', height: 96, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${d.v}%`, background: d.c, borderRadius: 6,
                    opacity: d.v < 30 ? 0.5 : 1 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: D.mut2 }}>{d.d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TrendCard({ icon, color, title, value, unit, spark, trend, good, caption }) {
  return (
    <Card dark pad={18}>
      <CardHead dark icon={icon} color={color} title={title}
        right={<TrendArrow dir={trend} good={good} />} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.6, color: D.ink,
              fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: D.mut }}>{unit}</span>
          </div>
        </div>
        <Spark data={spark} color={color} w={110} h={36} />
      </div>
      <div style={{ fontSize: 12.5, color: D.mut, marginTop: 12, lineHeight: 1.4 }}>{caption}</div>
    </Card>
  );
}

function GoalsCard() {
  const goals = [
    { t: 'Больше энергии днём', tag: 'Квартальная цель', v: 62, c: M.green },
    { t: '3 тренировки в неделю', tag: 'Эта неделя', v: 66, c: M.blue, note: '2 из 3' },
    { t: 'Белок 100 г/день', tag: 'Эта неделя', v: 80, c: M.green, note: '5 из 7 дней' },
    { t: 'Сон 7+ часов', tag: 'Эта неделя', v: 57, c: M.indigo, note: '4 из 7 дней' },
  ];
  return (
    <Card dark pad={20}>
      <CardHead dark icon="flag" color={M.green} title="Прогресс по целям" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {goals.map((g, i) => (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {i === 0 && <Icon name="star" size={14} stroke={M.amber} fill={M.amber} />}
                <span style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>{g.t}</span>
                <Chip dark style={{ padding: '2px 8px', fontSize: 11 }}>{g.tag}</Chip>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.mut,
                fontVariantNumeric: 'tabular-nums' }}>{g.note || `${g.v}%`}</span>
            </div>
            <Progress dark value={g.v} color={g.c} h={8} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function DiscussCard() {
  const items = [
    { ic: 'moon', c: M.indigo, t: 'Сон просел в среду и субботу', a: 'Разобрать причины' },
    { ic: 'dumbbell', c: M.blue, t: 'Силовые идут стабильно — можно чуть прибавить', a: 'Обсудить нагрузку' },
  ];
  return (
    <Card dark pad={18}>
      <CardHead dark icon="chat" color={M.green} title="Стоит обсудить с коучем" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
            borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: `${it.c}22` }}>
              <Icon name={it.ic} size={17} stroke={it.c} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: D.ink2, lineHeight: 1.35 }}>{it.t}</div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: M.green, whiteSpace: 'nowrap' }}>{it.a} →</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LongevityScreen() {
  return (
    <AppShell theme="dark" active="longevity">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar dark sub="Неделя · 30 мая – 5 июня" title="Динамика"
          right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${D.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevR" size={16} stroke={D.mut} style={{ transform: 'rotate(180deg)' }} /></div>
            <Chip dark>Эта неделя</Chip>
            <div style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${D.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chevR" size={16} stroke={D.mut} /></div>
          </div>} />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 34px' }}>
          <ConsistencyHero />
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}><TrendCard icon="dumbbell" color={M.blue} title="Тренировки"
              value="3" unit="/ нед" spark={[1, 2, 2, 3, 2, 3, 3]} trend="up" good
              caption="Стабильно, нагрузка растёт мягко" /></div>
            <div style={{ flex: 1 }}><TrendCard icon="fork" color={M.green} title="Питание"
              value="88" unit="г белка" spark={[70, 82, 60, 90, 95, 88, 92]} trend="up" good
              caption="Белок держится у цели" /></div>
            <div style={{ flex: 1 }}><TrendCard icon="moon" color={M.indigo} title="Сон"
              value="6.8" unit="ч/ночь" spark={[7.5, 7, 5.5, 7, 6, 5, 7]} trend="down" good={false}
              caption="Два коротких сна за неделю" /></div>
            <div style={{ flex: 1 }}><TrendCard icon="heart" color={M.amber} title="Самочувствие"
              value="Ровно" unit="" spark={[3, 4, 2, 4, 5, 3, 4]} trend="up" good
              caption="Настроение выше прошлой недели" /></div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: '1.3 1 0' }}><GoalsCard /></div>
            <div style={{ flex: '1 1 0' }}><DiscussCard /></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { LongevityScreen, Spark });
