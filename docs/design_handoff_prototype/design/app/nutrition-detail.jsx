/* nutrition-detail.jsx — deeper nutrition UX scenarios:
   • per-meal calories (калории по приёмам)
   • weekly ration (рацион на неделю)
   • weekly grocery list (закупка на неделю)
   • make-it-lighter proposal (диетичнее)
   Light interface; calorie figures shown as dark "instrument" inlays where they read as data. */

const DAY_MEALS = [
  { t: 'Завтрак', time: '7:30', ic: 'sun', name: 'Овсянка, ягоды, 2 яйца', kcal: 480, p: 32, c: 58, f: 14 },
  { t: 'Перекус', time: '11:00', ic: 'drop', name: 'Греческий йогурт + банан', kcal: 210, p: 12, c: 26, f: 6 },
  { t: 'Обед', time: '14:00', ic: 'fork', name: 'Курица, киноа, салат', kcal: 620, p: 44, c: 62, f: 20 },
  { t: 'Перед тренировкой', time: '17:00', ic: 'bolt', name: 'Банан + овсянка', kcal: 180, p: 6, c: 32, f: 3, changed: true },
  { t: 'Ужин', time: '20:00', ic: 'moon', name: 'Лосось, овощи на пару', kcal: 540, p: 38, c: 30, f: 24 },
];
const DAY_TARGET = 2100;

// little Б/У/Ж triple
function MacroMini({ p, c, f, dark }) {
  const items = [['Б', p, M.green], ['У', c, M.blue], ['Ж', f, M.indigo]];
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {items.map(([k, v, col]) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: col, alignSelf: 'center' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: dark ? D.ink2 : L.ink2,
            fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          <span style={{ fontSize: 11, color: dark ? D.mut2 : L.mut2 }}>{k} · г</span>
        </span>
      ))}
    </div>
  );
}

// ── Per-meal calories — light list + dark daily-total instrument ──
function MealCaloriesBreakdown() {
  const sum = DAY_MEALS.reduce((a, m) => a + m.kcal, 0);
  const sp = DAY_MEALS.reduce((a, m) => a + m.p, 0);
  const sc = DAY_MEALS.reduce((a, m) => a + m.c, 0);
  const sf = DAY_MEALS.reduce((a, m) => a + m.f, 0);
  const maxKcal = Math.max(...DAY_MEALS.map((m) => m.kcal));
  const pct = Math.round((sum / DAY_TARGET) * 100);
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* dark daily total instrument */}
      <Card dark pad={22} style={{ width: 290, flexShrink: 0 }}>
        <CardHead dark icon="fork" color={M.amber} title="Итог за день" />
        <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 16px' }}>
          <Ring value={pct} size={148} sw={13} color={M.amber} dark label={sum}
            track="rgba(255,255,255,0.07)" />
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: D.mut, marginBottom: 18 }}>
          из <b style={{ color: D.ink2 }}>{DAY_TARGET} ккал</b> · цель плана · осталось {DAY_TARGET - sum}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['Белок', sp, M.green], ['Углев.', sc, M.blue], ['Жиры', sf, M.indigo]].map(([l, v, col]) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', padding: '11px 6px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.line}` }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <Eyebrow dark style={{ marginTop: 4 }}>{l}</Eyebrow>
            </div>
          ))}
        </div>
      </Card>

      {/* light per-meal list */}
      <Card pad={20} style={{ flex: 1 }}>
        <CardHead icon="today" color={M.green} title="Калории по приёмам пищи"
          right={<span style={{ fontSize: 12.5, color: L.mut2 }}>примерная оценка</span>} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {DAY_MEALS.map((m, i) => (
            <div key={m.t} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '15px 4px',
              borderBottom: i === DAY_MEALS.length - 1 ? 'none' : `1px solid ${L.line}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: L.panel2 }}>
                <Icon name={m.ic} size={18} stroke={L.ink2} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: L.ink }}>{m.t}</span>
                  <span style={{ fontSize: 12, color: L.mut2, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
                  {m.changed && <Chip tone="amber" style={{ padding: '1px 7px', fontSize: 10.5 }}>новое</Chip>}
                </div>
                <div style={{ fontSize: 12.5, color: L.mut, marginBottom: 8 }}>{m.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1, maxWidth: 220, height: 6, borderRadius: 6, background: L.panel2,
                    overflow: 'hidden' }}>
                    <div style={{ width: `${(m.kcal / maxKcal) * 100}%`, height: '100%',
                      background: M.amber, borderRadius: 6 }} /></div>
                  <MacroMini p={m.p} c={m.c} f={m.f} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 78 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: L.ink, fontVariantNumeric: 'tabular-nums',
                  letterSpacing: -0.4 }}>{m.kcal}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: L.mut2,
                  textTransform: 'uppercase' }}>ккал</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function NutritionMealsScreen() {
  return (
    <AppShell active="nutrition" contentBg={L.paper}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar sub="Активная версия · v8" title="Калории по приёмам"
          right={<Chip tone="neutral"><Icon name="lock" size={13} stroke={L.mut} />Только просмотр</Chip>} />
        <div style={{ flex: 1, minHeight: 0, padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChangeBanner />
          <MealCaloriesBreakdown />
          <CoachNotes>Цифры — ориентир: вес порций оценивается по фото и описанию. Если калорий мало к вечеру, это нормально — день ещё не закончен. Точные граммы можно поправить в «Сегодня».</CoachNotes>
        </div>
      </div>
    </AppShell>
  );
}

// ── Weekly ration (рацион на неделю) ────────────────────────────
const WEEK = [
  { d: 'Пн', date: '2 июн', kcal: 2040, b: 'Овсянка + яйца', l: 'Индейка, гречка', s: 'Творог, ягоды', dn: 'Треска, овощи' },
  { d: 'Вт', date: '3 июн', kcal: 1980, b: 'Йогурт-парфе', l: 'Курица, киноа', s: 'Орех-микс*', dn: 'Тофу, овощи' },
  { d: 'Ср', date: '4 июн', kcal: 2110, b: 'Омлет, тост', l: 'Лосось, рис', s: 'Яблоко', dn: 'Курица, салат' },
  { d: 'Чт', date: '5 июн', kcal: 2030, b: 'Овсянка, ягоды', l: 'Курица, киноа', s: 'Банан+овсянка', dn: 'Лосось, овощи', today: true },
  { d: 'Пт', date: '6 июн', kcal: 2090, b: 'Сырники', l: 'Говядина, булгур', s: 'Йогурт', dn: 'Креветки, овощи' },
  { d: 'Сб', date: '7 июн', kcal: 2240, b: 'Шакшука', l: 'Паста с курицей', s: 'Фрукты', dn: 'Стейк, салат' },
  { d: 'Вс', date: '8 июн', kcal: 1890, b: 'Гранола, йогурт', l: 'Чечевичный суп', s: 'Хумус, овощи', dn: 'Рыба на пару' },
];

function WeekPlanScreen() {
  const avg = Math.round(WEEK.reduce((a, w) => a + w.kcal, 0) / WEEK.length);
  const cols = [['b', 'Завтрак', 'sun'], ['l', 'Обед', 'fork'], ['s', 'Перекус', 'drop'], ['dn', 'Ужин', 'moon']];
  return (
    <AppShell active="nutrition" contentBg={L.paper}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar sub="Активная версия · v8" title="Рацион на неделю"
          right={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chip tone="green">≈ {avg} ккал / день в среднем</Chip>
            <Chip tone="neutral"><Icon name="lock" size={13} stroke={L.mut} />Только просмотр</Chip>
          </div>} />
        <div style={{ flex: 1, minHeight: 0, padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ChangeBanner />
          <Card pad={0} style={{ overflow: 'hidden' }}>
            {/* header */}
            <div style={{ display: 'grid', gridTemplateColumns: '128px repeat(4, 1fr) 92px',
              background: L.panel, borderBottom: `1px solid ${L.line}` }}>
              <div style={{ padding: '13px 18px', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6,
                textTransform: 'uppercase', color: L.mut2 }}>День</div>
              {cols.map(([k, label, ic]) => (
                <div key={k} style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name={ic} size={14} stroke={L.mut} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                    color: L.mut2 }}>{label}</span>
                </div>
              ))}
              <div style={{ padding: '13px 14px', textAlign: 'right', fontSize: 11.5, fontWeight: 700,
                letterSpacing: 0.6, textTransform: 'uppercase', color: L.mut2 }}>Σ ккал</div>
            </div>
            {/* rows */}
            {WEEK.map((w, i) => (
              <div key={w.d} style={{ display: 'grid', gridTemplateColumns: '128px repeat(4, 1fr) 92px',
                borderBottom: i === WEEK.length - 1 ? 'none' : `1px solid ${L.line}`,
                background: w.today ? 'rgba(25,195,125,0.06)' : 'transparent' }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: w.today ? M.green : L.panel2, color: w.today ? '#04130c' : L.ink }}>
                    <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{w.d}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: L.ink }}>{w.date}</div>
                    {w.today && <span style={{ fontSize: 11, fontWeight: 700, color: M.green }}>сегодня</span>}
                  </div>
                </div>
                {[w.b, w.l, w.s, w.dn].map((meal, j) => (
                  <div key={j} style={{ padding: '14px 14px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: L.ink2, lineHeight: 1.35 }}>{meal}</span>
                  </div>
                ))}
                <div style={{ padding: '14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: w.today ? M.green : L.ink,
                    fontVariantNumeric: 'tabular-nums' }}>{w.kcal}</span>
                </div>
              </div>
            ))}
          </Card>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 13, padding: '14px 18px',
              borderRadius: 14, background: '#fff', border: `1px solid ${L.line}` }}>
              <Icon name="info" size={18} stroke={L.mut} />
              <span style={{ fontSize: 12.5, color: L.mut, lineHeight: 1.45, flex: 1 }}>
                <b style={{ color: L.ink2 }}>*</b> Орехи — только без арахиса (аллергия учтена). Калории за день
                держатся в коридоре ±10% от цели — это норма.</span>
            </div>
            <Btn kind="soft" icon="fork" style={{ alignSelf: 'center' }}
              onClick={() => window.__htNav && window.__htNav('nt-grocery')}>Собрать список покупок</Btn>
          </div>
          <CoachNotes>В субботу заложен чуть больший день — это осознанно, под активные выходные. В воскресенье — легче и больше овощей для восстановления.</CoachNotes>
        </div>
      </div>
    </AppShell>
  );
}

// ── Weekly grocery list (закупка на неделю) ─────────────────────
const GROCERY = [
  { cat: 'Белок', ic: 'fork', color: M.green, items: [
    { n: 'Куриное филе', q: '1.2 кг', got: true }, { n: 'Филе лосося', q: '600 г' },
    { n: 'Яйца', q: '20 шт', got: true }, { n: 'Греческий йогурт', q: '1 кг' },
    { n: 'Творог 5%', q: '500 г' }, { n: 'Креветки', q: '300 г' } ] },
  { cat: 'Овощи и зелень', ic: 'heart', color: M.blue, items: [
    { n: 'Шпинат', q: '2 пучка', got: true }, { n: 'Огурцы', q: '6 шт' },
    { n: 'Помидоры', q: '8 шт' }, { n: 'Брокколи', q: '2 шт' },
    { n: 'Авокадо', q: '4 шт' }, { n: 'Кабачки', q: '3 шт' } ] },
  { cat: 'Крупы и злаки', ic: 'today', color: M.amber, items: [
    { n: 'Киноа', q: '500 г' }, { n: 'Овсянка', q: '1 кг', got: true },
    { n: 'Гречка', q: '800 г' }, { n: 'Булгур', q: '500 г' } ] },
  { cat: 'Фрукты и ягоды', ic: 'drop', color: M.red, items: [
    { n: 'Бананы', q: '7 шт' }, { n: 'Черника', q: '300 г' },
    { n: 'Яблоки', q: '5 шт', got: true }, { n: 'Лимоны', q: '3 шт' } ] },
  { cat: 'Бакалея и прочее', ic: 'spark', color: M.indigo, items: [
    { n: 'Оливковое масло', q: '0.5 л', got: true }, { n: 'Хумус', q: '400 г' },
    { n: 'Гранола', q: '500 г' }, { n: 'Семена чиа', q: '200 г' } ] },
];

function GroceryCheck({ on }) {
  return (
    <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
      border: on ? 'none' : `2px solid ${L.line2}`, background: on ? M.green : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Icon name="checkSm" size={12} stroke="#04130c" sw={2.8} />}
    </div>
  );
}

function GroceryScreen() {
  const { useState } = React;
  const init = {};
  GROCERY.forEach((g) => g.items.forEach((it) => { init[g.cat + '|' + it.n] = !!it.got; }));
  const [checked, setChecked] = useState(init);
  const toggle = (k) => setChecked((s) => ({ ...s, [k]: !s[k] }));
  const total = GROCERY.reduce((a, g) => a + g.items.length, 0);
  const got = Object.values(checked).filter(Boolean).length;
  return (
    <AppShell active="nutrition" contentBg={L.paper}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar sub="Собрано из рациона · v8" title="Закупка на неделю"
          right={<Btn kind="soft" size="sm" icon="doc">Отправить в заметки</Btn>} />
        <div style={{ flex: 1, minHeight: 0, padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* summary strip */}
          <Card pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: M.greenDim }}>
                <Icon name="fork" size={23} stroke={M.green} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: L.ink }}>Список под план на 7 дней</div>
                <div style={{ fontSize: 13, color: L.mut, marginTop: 2 }}>
                  {total} позиций · 5 приёмов в день · аллергия на орехи учтена</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: L.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {got}<span style={{ color: L.mut2 }}>/{total}</span></div>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                  color: L.mut2 }}>куплено</div>
              </div>
              <div style={{ width: 120 }}>
                <Progress value={Math.round((got / total) * 100)} color={M.green} h={8} /></div>
            </div>
          </Card>
          {/* category columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
            {GROCERY.map((g) => (
              <Card key={g.cat} pad={18}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: `${g.color}22` }}>
                    <Icon name={g.ic} size={14} stroke={g.color} /></div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: L.ink, flex: 1 }}>{g.cat}</span>
                  <span style={{ fontSize: 12, color: L.mut2 }}>{g.items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {g.items.map((it, i) => {
                    const key = g.cat + '|' + it.n;
                    const on = !!checked[key];
                    return (
                    <div key={it.n} className="htRow" onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 11,
                      padding: '10px 2px', cursor: 'pointer', borderBottom: i === g.items.length - 1 ? 'none' : `1px solid ${L.line}` }}>
                      <GroceryCheck on={on} />
                      <span style={{ flex: 1, fontSize: 13.5, color: on ? L.mut2 : L.ink,
                        textDecoration: on ? 'line-through' : 'none' }}>{it.n}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: on ? L.mut2 : L.mut,
                        fontVariantNumeric: 'tabular-nums' }}>{it.q}</span>
                    </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 13,
            background: 'rgba(123,123,255,0.08)', border: `1px solid rgba(123,123,255,0.28)` }}>
            <Icon name="spark" size={17} stroke="#5b5bd6" />
            <span style={{ flex: 1, fontSize: 12.5, color: L.mut, lineHeight: 1.45 }}>
              Список пересобирается автоматически, когда коуч меняет рацион в чате. Менять блюда — тоже через чат.</span>
            <Btn kind="soft" size="sm" icon="chat">Поменять блюдо</Btn>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── "Make it lighter / more dietary" proposal ───────────────────
const SWAPS = [
  { from: 'Белый рис · 150 г', to: 'Цветная капуста-рис · 150 г', save: 160, ic: 'fork' },
  { from: 'Гранола · 60 г', to: 'Овсянка + ягоды', save: 120, ic: 'sun' },
  { from: 'Масло для жарки', to: 'Запекание / спрей', save: 90, ic: 'bolt' },
  { from: 'Паста · 120 г', to: 'Паста из чечевицы · 100 г', save: 110, ic: 'today' },
  { from: 'Стейк рибай', to: 'Филе индейки', save: 170, ic: 'fork' },
];

function DietaryScreen() {
  const { useState } = React;
  const [applied, setApplied] = useState(false);
  const saved = SWAPS.reduce((a, s) => a + s.save, 0);
  const target = DAY_TARGET - 350; // 1750
  return (
    <AppShell active="nutrition" contentBg={L.paper}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar sub="Предложение коуча" title="Сделать план диетичнее"
          right={applied
            ? <Chip tone="green"><Icon name="check" size={13} stroke={M.green} />применён · v9 активна</Chip>
            : <Chip tone="amber"><Icon name="spark" size={13} stroke={M.amber} />черновик · не применён</Chip>} />
        <div style={{ flex: 1, minHeight: 0, padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* coach intro */}
          <Card pad={18}>
            <div style={{ display: 'flex', gap: 13 }}>
              <Avatar who="coach" size={32} />
              <div style={{ flex: 1, fontSize: 14, color: L.ink2, lineHeight: 1.6, paddingTop: 2 }}>
                Вы попросили вариант «полегче». Я не урезаю белок и не делаю план голодным — снижаю калории
                за счёт замен с теми же вкусами. Так уходит ≈350 ккал в день, а сытость и белок остаются.
              </div>
            </div>
          </Card>

          {/* before / after */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <Card pad={20} style={{ flex: 1 }}>
              <Eyebrow style={{ marginBottom: 12 }}>Сейчас · v8</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 700, color: L.ink, letterSpacing: -1,
                  fontVariantNumeric: 'tabular-nums' }}>{DAY_TARGET}</span>
                <span style={{ fontSize: 15, color: L.mut }}>ккал / день</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <Chip tone="green">Белок 130 г</Chip><Chip tone="neutral">Углеводы 210 г</Chip>
              </div>
            </Card>
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: M.greenDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow" size={22} stroke={M.green} /></div>
            </div>
            <Card pad={20} accent={M.green} style={{ flex: 1 }}>
              <Eyebrow style={{ marginBottom: 12, color: M.green }}>Облегчённый · v9 (черновик)</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 700, color: M.green, letterSpacing: -1,
                  fontVariantNumeric: 'tabular-nums' }}>{target}</span>
                <span style={{ fontSize: 15, color: L.mut }}>ккал / день</span>
                <Chip tone="green" style={{ marginLeft: 6 }}>−{saved} ккал</Chip>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <Chip tone="green">Белок 130 г</Chip><Chip tone="amber">Углеводы 150 г</Chip>
              </div>
            </Card>
          </div>

          {/* swaps */}
          <Card pad={20}>
            <CardHead icon="spark" color={M.green} title="Замены, которые делают план легче"
              right={<span style={{ fontSize: 12.5, color: L.mut2 }}>{SWAPS.length} замен · −{saved} ккал</span>} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {SWAPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 4px',
                  borderBottom: i === SWAPS.length - 1 ? 'none' : `1px solid ${L.line}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', background: L.panel2 }}>
                    <Icon name={s.ic} size={16} stroke={L.ink2} /></div>
                  <span style={{ flex: 1, fontSize: 13.5, color: L.mut2, textDecoration: 'line-through' }}>{s.from}</span>
                  <Icon name="arrow" size={16} stroke={L.mut} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: L.ink }}>{s.to}</span>
                  <Chip tone="green" style={{ flexShrink: 0 }}>−{s.save} ккал</Chip>
                </div>
              ))}
            </div>
          </Card>

          {/* decision row (proposal pattern) */}
          {applied ? (
            <Card pad={0} accent={M.green} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
                background: M.greenDim }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: M.green,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="checkSm" size={17} stroke="#04130c" sw={2.6} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0c6b45' }}>План обновлён · версия v9 активна</div>
                  <div style={{ fontSize: 12.5, color: '#137a4f', marginTop: 2 }}>
                    Цель — 1750 ккал/день. Рацион и закупка пересобраны. Прошлая версия сохранена в истории.</div>
                </div>
                <Btn kind="soft" size="sm" onClick={() => setApplied(false)}>Отменить</Btn>
                <Btn kind="soft" size="sm" icon="fork"
                  onClick={() => window.__htNav && window.__htNav('nt-week')}>Открыть рацион</Btn>
              </div>
            </Card>
          ) : (
            <Card pad={18}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Icon name="info" size={18} stroke={L.mut} />
                <span style={{ flex: 1, fontSize: 13, color: L.mut, lineHeight: 1.45 }}>
                  Это черновик версии v9. Применяется он, как и все изменения, через коуча — вы решаете, оставить ли.</span>
                <Btn kind="ghost" size="sm">Изменить</Btn>
                <Btn kind="quiet" size="sm">Не сейчас</Btn>
                <Btn kind="accept" size="sm" icon="check" onClick={() => setApplied(true)}>Применить v9</Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, {
  NutritionMealsScreen, MealCaloriesBreakdown, WeekPlanScreen, GroceryScreen, DietaryScreen, MacroMini,
});
