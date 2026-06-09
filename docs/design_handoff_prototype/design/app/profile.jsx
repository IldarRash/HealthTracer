/* profile.jsx — light account/profile: identity, goals hierarchy, personal
   context, documents (explicit consent, wellness wording), devices & consents. */

function Toggle({ on, color = M.green }) {
  return (
    <div style={{ width: 40, height: 23, borderRadius: 12, flexShrink: 0, padding: 2,
      background: on ? color : L.line2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'all .15s' }}>
      <div style={{ width: 19, height: 19, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

function Field({ label, value, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
      borderBottom: `1px solid ${L.line}` }}>
      {icon && <Icon name={icon} size={17} stroke={L.mut} />}
      <span style={{ fontSize: 13.5, color: L.mut, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>{value}</span>
    </div>
  );
}

function ProfileScreen() {
  return (
    <AppShell theme="light" active="profile">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar title="Профиль" sub="Кто я и что коуч обо мне знает" />
        <div style={{ flex: 1, overflow: 'hidden', padding: '22px 34px' }}>
          <div style={{ display: 'flex', gap: 18 }}>
            {/* left */}
            <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card pad={20}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar who="user" size={56} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: L.ink }}>Алина Петрова</div>
                    <div style={{ fontSize: 13.5, color: L.mut, marginTop: 3 }}>С коучем 12 дней · цель «энергия»</div>
                  </div>
                  <Chip tone="amber">FREE</Chip>
                </div>
              </Card>

              <Card pad={0} style={{ overflow: 'hidden' }}>
                <div className="htRow" onClick={() => window.__htNav && window.__htNav('body')}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', cursor: 'pointer' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', background: M.greenDim }}>
                    <Icon name="profile" size={21} stroke={M.green} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: L.ink }}>Анализ тела</span>
                      <Chip tone="green" style={{ padding: '1px 8px', fontSize: 10.5 }}>новое</Chip>
                    </div>
                    <div style={{ fontSize: 12.5, color: L.mut, marginTop: 3 }}>
                      Состав тела, % жира и карта мышц · обновлено 5 июня</div>
                  </div>
                  <Icon name="chevR" size={17} stroke={L.mut2} />
                </div>
              </Card>

              <Card pad={20}>
                <CardHead title="Иерархия целей" icon="flag" color={M.green}
                  right={<span style={{ fontSize: 12, color: L.mut2 }}>меняется через коуча</span>} />
                <div style={{ borderRadius: 12, border: `1px solid ${L.line}`, padding: 16,
                  background: L.panel, marginBottom: 12 }}>
                  <Eyebrow style={{ marginBottom: 6 }}>Квартальная цель</Eyebrow>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name="star" size={17} stroke={M.amber} fill={M.amber} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: L.ink }}>Больше энергии днём</span>
                  </div>
                </div>
                <Eyebrow style={{ marginBottom: 10, paddingLeft: 4 }}>Недельные цели</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['dumbbell', '3 тренировки в неделю', M.blue], ['fork', 'Белок 100 г в день', M.green],
                    ['moon', 'Сон 7+ часов', M.indigo]].map(([ic, t, c]) => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px',
                      borderRadius: 11, border: `1px solid ${L.line}` }}>
                      <Icon name={ic} size={17} stroke={c} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: L.ink2, flex: 1 }}>{t}</span>
                      <Icon name="chevR" size={15} stroke={L.mut2} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card pad={20}>
                <CardHead title="Личный контекст" icon="profile" />
                <Field label="Возраст" value="32 года" />
                <Field label="Уровень активности" value="Средний" />
                <Field label="Ограничение" value="Бережём левое колено" />
                <Field label="Оборудование" value="Зал + дом" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 0' }}>
                  <span style={{ fontSize: 13.5, color: L.mut, flex: 1 }}>Предпочтения в еде</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Chip>Без свинины</Chip><Chip>Люблю рыбу</Chip>
                  </div>
                </div>
              </Card>
            </div>

            {/* right */}
            <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card pad={20}>
                <CardHead title="Устройства и данные" icon="spark" />
                {[['Часы · сон и пульс', true], ['Умные весы', false], ['Шаги телефона', true]].map(([t, on], i) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
                    borderBottom: i < 2 ? `1px solid ${L.line}` : 'none' }}>
                    <span style={{ fontSize: 14, color: L.ink2, flex: 1 }}>{t}</span>
                    <span style={{ fontSize: 12.5, color: on ? M.green : L.mut2, fontWeight: 600 }}>
                      {on ? 'Подключено' : 'Не подключено'}</span>
                    <Toggle on={on} />
                  </div>
                ))}
              </Card>

              <Card pad={20}>
                <CardHead title="Подписка" icon="star" color={M.amber} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: L.ink }}>Бесплатный план</div>
                    <div style={{ fontSize: 12.5, color: L.mut, marginTop: 2 }}>10 сообщений коучу в день</div>
                  </div>
                  <Btn kind="primary" size="sm" onClick={() => window.__htNav && window.__htNav('pricing')}>Перейти на Pro</Btn>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { ProfileScreen, Toggle });
