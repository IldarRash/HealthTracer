/* today.jsx — dark, WHOOP-style daily execution screen. States: empty / partial / done. */

const TODAY_CFG = {
  empty:   { move: false, foodPct: 0, water: 0, habits: [false, false, false], reflect: false, prog: '0 / 0' },
  partial: { move: true,  foodPct: 55, water: 4, habits: [true, false, true], reflect: false, prog: '3 / 7' },
  done:    { move: true,  foodPct: 100, water: 8, habits: [true, true, true], reflect: true, prog: '7 / 7' },
};

function DayStrip({ state }) {
  const muted = state === 'empty';
  const sig = [
    { v: muted ? 0 : 72, c: M.green, label: 'Восстановление', cap: muted ? 'нет данных' : 'выше обычного' },
    { v: muted ? 0 : 84, c: M.indigo, label: 'Сон', cap: muted ? 'нет данных' : '7 ч 10 мин' },
    { v: muted ? 0 : 58, c: M.amber, label: 'Запас сил', cap: muted ? 'нет данных' : 'умеренный' },
  ];
  return (
    <Card dark pad={20} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {sig.map((s, i) => (
          <React.Fragment key={s.label}>
            <MetricDonut dark value={s.v} color={muted ? D.mut2 : s.c} label={s.label} caption={s.cap} />
            {i < 2 && <div style={{ width: 1, height: 52, background: D.line }} />}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${D.line}`, display: 'flex',
        alignItems: 'center', gap: 9 }}>
        <Icon name="info" size={15} stroke={D.mut} />
        <span style={{ fontSize: 13, color: D.ink2, lineHeight: 1.4 }}>
          {muted ? 'Подключи сон и самочувствие в профиле — и здесь появится картина дня.'
                 : 'Сил достаточно для силовой. Держим темп спокойным, без рекордов.'}</span>
      </div>
    </Card>
  );
}

function TaskCard({ icon, color, kind, title, sub, done, children, footerLink }) {
  return (
    <Card dark pad={18} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: `${color}22` }}>
          <Icon name={icon} size={21} stroke={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow dark color={color}>{kind}</Eyebrow>
            {done != null && <CheckCircle dark done={done} color={color} size={22} />}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2, color: D.ink, margin: '7px 0 3px' }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: D.mut, marginBottom: children ? 13 : 0 }}>{sub}</div>}
          {children}
          {footerLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, color: D.ink2,
              fontSize: 13, fontWeight: 600 }}>
              {footerLink}<Icon name="chevR" size={14} stroke={D.mut} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MoveCard({ done }) {
  const ex = ['Присед · 4×6', 'Жим лёжа · 4×8', 'Тяга · 3×10', 'Кор · 3 круга'];
  return (
    <TaskCard icon="dumbbell" color={M.blue} kind="Движение · 45 мин" done={done}
      title="Силовая · нижняя + грудь" sub="Зал · спокойный темп, RPE 7"
      footerLink="Открыть план тренировок">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {ex.map((e) => <Chip key={e} dark>{e}</Chip>)}
      </div>
    </TaskCard>
  );
}

function FoodCard({ pct, water }) {
  const meals = [
    { t: 'Завтрак', v: 'Овсянка, яйца, ягоды', d: true },
    { t: 'Перекус', v: 'Банан перед тренировкой', d: pct > 30 },
    { t: 'Обед', v: 'Курица, рис, овощи', d: pct >= 100 },
    { t: 'Ужин', v: 'Рыба, салат', d: pct >= 100 },
  ];
  return (
    <TaskCard icon="fork" color={M.green} kind="Питание сегодня"
      title="Сбалансированный день" sub="Фокус: белок к каждому приёму" footerLink="Открыть план питания">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
        {meals.map((m) => (
          <div key={m.t} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <CheckCircle dark done={m.d} size={18} />
            <span style={{ fontSize: 12, fontWeight: 700, color: D.mut2, width: 64, letterSpacing: 0.3,
              textTransform: 'uppercase' }}>{m.t}</span>
            <span style={{ fontSize: 13.5, color: m.d ? D.mut : D.ink2,
              textDecoration: m.d ? 'line-through' : 'none' }}>{m.v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14,
        borderTop: `1px solid ${D.line}` }}>
        <Icon name="drop" size={17} stroke={M.blue} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: D.ink2, letterSpacing: 0.3 }}>ВОДА</span>
        <div style={{ display: 'flex', gap: 5, flex: 1 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 9, borderRadius: 3,
              background: i < water ? M.blue : 'rgba(255,255,255,0.08)' }} />
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: D.mut, fontVariantNumeric: 'tabular-nums' }}>{water} / 8</span>
      </div>
    </TaskCard>
  );
}

function HabitsCard({ habits }) {
  const items = ['10 минут на свежем воздухе', 'Без экрана за час до сна', 'Растяжка вечером'];
  return (
    <Card dark pad={18}>
      <CardHead dark icon="spark" color={M.indigo} title="Привычки на сегодня"
        right={<Chip dark>{habits.filter(Boolean).length} / {habits.length}</Chip>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((it, i) => (
          <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px',
            borderRadius: 10, background: habits[i] ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
            <CheckCircle dark done={habits[i]} color={M.indigo} />
            <span style={{ fontSize: 14, color: habits[i] ? D.mut : D.ink,
              textDecoration: habits[i] ? 'line-through' : 'none' }}>{it}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CheckinCard({ done }) {
  const scale = [
    { l: 'Тяжело', c: M.red }, { l: 'Так себе', c: M.amber }, { l: 'Норм', c: '#c9b24a' },
    { l: 'Хорошо', c: M.green }, { l: 'Отлично', c: M.green },
  ];
  const sel = 3;
  return (
    <Card dark pad={18} style={{ marginBottom: 16 }} accent={M.amber}>
      <CardHead dark icon="heart" color={M.amber} title="Чек-ин самочувствия" />
      <div style={{ fontSize: 13, color: D.mut, marginBottom: 12 }}>Как ты сейчас?</div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
        {scale.map((m, i) => {
          const on = done && i === sel;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <div style={{ width: '100%', height: 40, borderRadius: 11, display: 'flex', alignItems: 'center',
                justifyContent: 'center', border: `1.5px solid ${on ? m.c : D.line}`,
                background: on ? `${m.c}22` : 'rgba(255,255,255,0.02)' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: m.c, opacity: on ? 1 : 0.45 }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? D.ink2 : D.mut2 }}>{m.l}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: D.mut2, marginBottom: 9 }}>Уровень стресса</div>
      <div style={{ display: 'flex', gap: 7 }}>
        {['Низкий', 'Средний', 'Высокий'].map((l, i) => (
          <div key={l} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10,
            fontSize: 12.5, fontWeight: 600,
            background: done && i === 0 ? M.greenDim : 'rgba(255,255,255,0.03)',
            color: done && i === 0 ? M.green : D.mut, border: `1px solid ${done && i === 0 ? 'transparent' : D.line}` }}>{l}</div>
        ))}
      </div>
    </Card>
  );
}

function ReflectCard({ done }) {
  return (
    <Card dark pad={18} style={{ marginBottom: 16 }}>
      <CardHead dark icon="moon" color={M.indigo} title="Рефлексия дня"
        right={<span style={{ fontSize: 11.5, color: D.mut2 }}>необязательно</span>} />
      {done ? (
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: D.ink2, fontStyle: 'italic',
          padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
          «День получился ровным, тренировка зашла легче обычного. Доволен.»
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: D.mut, padding: '14px', borderRadius: 12,
          border: `1px dashed ${D.line2}` }}>Что сегодня получилось? Пара слов в конце дня…</div>
      )}
    </Card>
  );
}

function QuickLinks() {
  const links = [['dumbbell', 'Недельный план тренировок'], ['fork', 'Недельный план питания'], ['chat', 'Обсудить день с коучем']];
  return (
    <Card dark pad={8}>
      {links.map(([ic, t], i) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px',
          borderBottom: i < 2 ? `1px solid ${D.line}` : 'none' }}>
          <Icon name={ic} size={18} stroke={D.mut} />
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: D.ink2 }}>{t}</span>
          <Icon name="chevR" size={15} stroke={D.mut2} />
        </div>
      ))}
    </Card>
  );
}

function TodayScreen({ state = 'partial' }) {
  const c = TODAY_CFG[state];
  const rightChip = state === 'empty'
    ? <Chip tone="amber">План на сегодня не готов</Chip>
    : state === 'done'
      ? <Chip tone="green"><Icon name="checkSm" size={13} stroke={M.green} sw={2.4} />Всё на сегодня готово</Chip>
      : <Chip dark>Выполнено {c.prog}</Chip>;

  return (
    <AppShell theme="dark" active="today">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar dark sub="Четверг · 5 июня" title="Сегодня" right={rightChip} />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 34px' }}>
          {state === 'empty' ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Card dark pad={40} style={{ maxWidth: 460, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                  <Icon name="sun" size={28} stroke={M.amber} /></div>
                <div style={{ fontSize: 20, fontWeight: 700, color: D.ink, marginBottom: 8 }}>Здесь появится твой день</div>
                <div style={{ fontSize: 14, color: D.mut, lineHeight: 1.55, marginBottom: 22 }}>
                  Коуч пока не знает твоих целей и расписания. Пара минут в онбординге — и план на день
                  соберётся сам.</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <Btn kind="accept" icon="arrow">Создать первую цель</Btn>
                  <Btn kind="ghost" dark icon="chat">Спросить коуча</Btn>
                </div>
              </Card>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, height: '100%' }}>
              <div style={{ flex: '1.7 1 0', minWidth: 0, overflow: 'hidden' }}>
                <DayStrip state={state} />
                <MoveCard done={c.move} />
                <FoodCard pct={c.foodPct} water={c.water} />
                <HabitsCard habits={c.habits} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <CheckinCard done={state === 'done'} />
                <ReflectCard done={c.reflect} />
                <QuickLinks />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { TodayScreen });
