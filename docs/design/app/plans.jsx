/* plans.jsx — read-only weekly plan views (dark). Training + Nutrition.
   Emphasis: view-only, changes happen through chat → proposal → confirm. */

function ViewOnlyBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Chip dark><Icon name="lock" size={13} stroke={D.mut} />Только просмотр</Chip>
      <Btn kind="accept" size="sm" icon="chat">Изменить через коуча</Btn>
    </div>
  );
}

function WhatChanged({ color, text, detail }) {
  return (
    <Card dark pad={0} style={{ marginBottom: 18, overflow: 'hidden', borderTop: `2px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: `${color}22` }}>
          <Icon name="check" size={18} stroke={color} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: D.ink }}>{text}</span>
            <Chip tone="green" style={{ padding: '2px 8px', fontSize: 11 }}>v8 · сегодня</Chip>
          </div>
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: 3 }}>{detail}</div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: M.green, whiteSpace: 'nowrap' }}>Обсудить изменение →</span>
      </div>
    </Card>
  );
}

function DayRow({ day, date, icon, color, title, meta, status, changed, today, last }) {
  const stMap = {
    done: { t: 'Выполнено', c: M.green, chip: 'green' },
    today: { t: 'Сегодня', c: M.blue, chip: 'blue' },
    plan: { t: 'Запланировано', c: D.mut, chip: 'neutral' },
    rest: { t: 'Отдых', c: D.mut2, chip: 'neutral' },
  };
  const st = stMap[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 8px',
      borderBottom: last ? 'none' : `1px solid ${D.line}`,
      background: today ? 'rgba(58,141,255,0.05)' : 'transparent', borderRadius: today ? 10 : 0 }}>
      <div style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: today ? M.blue : D.ink }}>{day}</div>
        <div style={{ fontSize: 11.5, color: D.mut2, marginTop: 2 }}>{date}</div>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: status === 'rest' ? 'rgba(255,255,255,0.04)' : `${color}1f` }}>
        <Icon name={icon} size={18} stroke={status === 'rest' ? D.mut2 : color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: status === 'rest' ? D.mut : D.ink }}>{title}</span>
          {changed && <Chip tone="amber" style={{ padding: '2px 8px', fontSize: 11 }}>изменено</Chip>}
        </div>
        {meta && <div style={{ fontSize: 12.5, color: D.mut, marginTop: 3 }}>{meta}</div>}
      </div>
      <Chip tone={st.chip} dark={st.chip === 'neutral'}>
        {status === 'done' && <Icon name="checkSm" size={12} stroke={M.green} sw={2.4} />}{st.t}</Chip>
    </div>
  );
}

function TrainingScreen() {
  const days = [
    { day: 'Пн', date: '2 июн', icon: 'dumbbell', color: M.blue, title: 'Силовая · верх тела', meta: '45 мин · RPE 7', status: 'done' },
    { day: 'Вт', date: '3 июн', icon: 'heart', color: M.red, title: 'Кардио Z2', meta: '30 мин · лёгкий темп', status: 'done' },
    { day: 'Ср', date: '4 июн', icon: 'moon', color: M.indigo, title: 'Отдых', meta: 'Восстановление', status: 'rest' },
    { day: 'Чт', date: '5 июн', icon: 'dumbbell', color: M.blue, title: 'Силовая · низ + грудь', meta: '45 мин · сегодня в зале', status: 'today', today: true },
    { day: 'Пт', date: '6 июн', icon: 'sun', color: M.green, title: 'Прогулка', meta: 'Было: силовая · перенесено на чт', status: 'plan', changed: true },
    { day: 'Сб', date: '7 июн', icon: 'spark', color: M.indigo, title: 'Мобилити + растяжка', meta: '20 мин дома', status: 'plan' },
    { day: 'Вс', date: '8 июн', icon: 'moon', color: M.indigo, title: 'Отдых', meta: '', status: 'rest' },
  ];
  return (
    <AppShell theme="dark" active="training">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar dark sub="Активная версия · v8" title="План тренировок" right={<ViewOnlyBar />} />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 34px' }}>
          <WhatChanged color={M.blue} text="Силовая перенесена с четверга на пятницу"
            detail="Принято в чате сегодня · в четверг — лёгкая прогулка, из-за вечерних встреч и сниженного восстановления" />
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            {[['3', 'тренировки', M.blue], ['2 / 3', 'выполнено', M.green], ['185', 'минут движения', M.amber]].map(([v, l, c]) => (
              <Card key={l} dark pad={16} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: c, letterSpacing: -0.6 }}>{v}</span>
                </div>
                <Eyebrow dark style={{ marginTop: 6 }}>{l}</Eyebrow>
              </Card>
            ))}
          </div>
          <Card dark pad={16}>
            <CardHead dark icon="today" title="Эта неделя" right={<span style={{ fontSize: 12.5, color: D.mut2 }}>30 мая – 8 июня</span>} />
            {days.map((d, i) => <DayRow key={d.day} {...d} last={i === days.length - 1} />)}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function NutritionScreen() {
  const days = [
    { day: 'Пн', date: '2 июн', icon: 'fork', color: M.green, title: 'Белок + овощи в каждый приём', meta: '≈ 100 г белка · 4 приёма', status: 'done' },
    { day: 'Вт', date: '3 июн', icon: 'fork', color: M.green, title: 'Стандартный день', meta: '≈ 95 г белка', status: 'done' },
    { day: 'Ср', date: '4 июн', icon: 'fork', color: M.green, title: 'Стандартный день', meta: 'белок недобран · 70 г', status: 'done' },
    { day: 'Чт', date: '5 июн', icon: 'fork', color: M.green, title: 'День силовой', meta: '+ перекус перед тренировкой', status: 'today', today: true, changed: true },
    { day: 'Пт', date: '6 июн', icon: 'fork', color: M.green, title: 'Лёгкий день', meta: '3 приёма', status: 'plan' },
    { day: 'Сб', date: '7 июн', icon: 'fork', color: M.green, title: 'Свободный приём', meta: 'на ужин — без подсчёта', status: 'plan' },
    { day: 'Вс', date: '8 июн', icon: 'fork', color: M.green, title: 'Подготовка на неделю', meta: 'meal-prep', status: 'plan' },
  ];
  return (
    <AppShell theme="dark" active="nutrition">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar dark sub="Активная версия · v8" title="План питания" right={<ViewOnlyBar />} />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 34px' }}>
          <WhatChanged color={M.green} text="Добавлен перекус перед тренировкой в четверг"
            detail="Принято в чате сегодня · банан + овсянка за час до силовой" />
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <Card dark pad={16} style={{ flex: 1 }}>
              <CardHead dark icon="fork" color={M.green} title="Цель по белку" right={<span style={{ fontSize: 12.5, color: M.green, fontWeight: 600 }}>5 / 7 дней</span>} />
              <Progress dark value={80} color={M.green} h={8} />
              <div style={{ fontSize: 12.5, color: D.mut, marginTop: 9 }}>≈ 100 г в день · держится у цели</div>
            </Card>
            <Card dark pad={16} style={{ flex: 1 }}>
              <CardHead dark icon="drop" color={M.blue} title="Вода" right={<span style={{ fontSize: 12.5, color: M.blue, fontWeight: 600 }}>6 / 8 в среднем</span>} />
              <Progress dark value={75} color={M.blue} h={8} />
              <div style={{ fontSize: 12.5, color: D.mut, marginTop: 9 }}>Цель 2 л · чуть недобираешь к вечеру</div>
            </Card>
          </div>
          <Card dark pad={16}>
            <CardHead dark icon="today" title="Эта неделя" right={<span style={{ fontSize: 12.5, color: D.mut2 }}>30 мая – 8 июня</span>} />
            {days.map((d, i) => <DayRow key={d.day} {...d} last={i === days.length - 1} />)}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { TrainingScreen, NutritionScreen });
