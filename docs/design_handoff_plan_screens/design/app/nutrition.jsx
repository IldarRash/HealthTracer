/* nutrition.jsx — dark, read-only active nutrition plan ("Питание").
   Plan + revision facts + nutrient goals + meal structure +
   preferences/restrictions/allergies + coach notes + today's adherence panel
   (own sub-states) + recipe ideas (watchable) + revision history.
   States: loading / empty / error / done / recipe (detail). */

const MACROS = [
  { k: 'Калории', v: 2100, unit: 'ккал', cur: 1180, c: M.amber, pct: 56 },
  { k: 'Белок', v: 130, unit: 'г', cur: 78, c: M.green, pct: 60 },
  { k: 'Углеводы', v: 210, unit: 'г', cur: 132, c: M.blue, pct: 63 },
  { k: 'Жиры', v: 70, unit: 'г', cur: 41, c: M.indigo, pct: 59 },
];

const RECIPES = [
  { title: 'Боул с лососем и киноа', meta: '≈ 520 ккал · 38 г белка', duration: '4:10', tags: ['Обед', 'Рыба'], poster: 2 },
  { title: 'Курица терияки с рисом', meta: '≈ 610 ккал · 44 г белка', duration: '5:30', tags: ['Ужин'], poster: 1 },
  { title: 'Греческий йогурт-парфе', meta: '≈ 280 ккал · 22 г белка', duration: '1:40', tags: ['Перекус'], poster: 4 },
  { title: 'Чечевичный суп', meta: '≈ 340 ккал · 19 г белка', duration: '3:20', tags: ['Обед', 'Веган'], poster: 3 },
];

function ActiveNutritionHeader({ empty }) {
  if (empty) {
    return (
      <Card dark pad={22}>
        <div style={{ borderRadius: 14, border: `1px dashed ${D.line2}`, padding: '30px 24px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 15, margin: '0 auto 16px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(25,195,125,0.12)' }}>
            <Icon name="fork" size={26} stroke={M.green} /></div>
          <div style={{ fontSize: 19, fontWeight: 700, color: D.ink, letterSpacing: -0.3 }}>Активного плана питания пока нет</div>
          <div style={{ fontSize: 13.5, color: D.mut, marginTop: 9, lineHeight: 1.5, maxWidth: 410, margin: '9px auto 0' }}>
            План питания собирается коучем под ваши цели, предпочтения и ограничения. Расскажите в чате,
            что любите и чего избегаете — и примите предложение одним нажатием.</div>
          <Btn kind="accept" icon="chat" style={{ marginTop: 18 }}>Открыть чат с коучем</Btn>
        </div>
      </Card>
    );
  }
  return (
    <Card dark pad={22}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Chip tone="green" style={{ padding: '3px 10px' }}>Активный план</Chip>
        <Chip dark style={{ padding: '3px 10px' }}>версия v8</Chip>
      </div>
      <div style={{ fontSize: 25, fontWeight: 700, color: D.ink, letterSpacing: -0.5 }}>
        Белок + овощи · сбалансированный</div>
      <div style={{ fontSize: 13.5, color: D.mut, marginTop: 8, lineHeight: 1.55, maxWidth: 560 }}>
        Белок и овощи в каждый основной приём, умеренные углеводы вокруг тренировок и достаточно воды.
        Без жёстких запретов — фокус на регулярности и насыщении.</div>
    </Card>
  );
}

// daily nutrient goals
function NutrientGoals() {
  return (
    <Card dark pad={20} style={{ flex: 1.2 }}>
      <CardHead dark icon="fork" color={M.green} title="Дневные цели"
        right={<span style={{ fontSize: 12.5, color: D.mut2 }}>цель плана</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {MACROS.map((m) => (
          <div key={m.k}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>{m.k}</span>
              <span style={{ fontSize: 13, color: D.mut, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: m.c, fontWeight: 700 }}>{m.cur}</span> / {m.v} {m.unit}</span>
            </div>
            <Progress dark value={m.pct} color={m.c} h={8} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: D.mut2, marginTop: 14, lineHeight: 1.4 }}>
        Цели — ориентир, а не строгая норма. Их меняет коуч в чате.</div>
    </Card>
  );
}

// meal structure with timing
function MealStructure() {
  const meals = [
    { t: 'Завтрак', time: '7:30', hint: 'Белок + сложные углеводы', ic: 'sun' },
    { t: 'Перекус', time: '11:00', hint: 'Фрукт или йогурт', ic: 'drop' },
    { t: 'Обед', time: '14:00', hint: 'Белок + овощи + крупа', ic: 'fork' },
    { t: 'Перед тренировкой', time: '17:00', hint: 'Лёгкий перекус с углеводами', ic: 'bolt', changed: true },
    { t: 'Ужин', time: '20:00', hint: 'Лёгкий белок + овощи', ic: 'moon' },
  ];
  return (
    <Card dark pad={20} style={{ flex: 1 }}>
      <CardHead dark icon="today" color={M.blue} title="Структура приёмов" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {meals.map((m, i) => (
          <div key={m.t} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 4px',
            borderBottom: i === meals.length - 1 ? 'none' : `1px solid ${D.line}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
              <Icon name={m.ic} size={15} stroke={D.ink2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: D.ink }}>{m.t}</span>
                {m.changed && <Chip tone="amber" style={{ padding: '1px 7px', fontSize: 10.5 }}>новое</Chip>}
              </div>
              <div style={{ fontSize: 12, color: D.mut, marginTop: 2 }}>{m.hint}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: D.mut2, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// preferences / restrictions / allergies
function PrefsCard() {
  const groups = [
    { label: 'Предпочтения', tone: 'green', ic: 'star', items: ['Средиземноморская', 'Рыба', 'Овощи'] },
    { label: 'Ограничения', tone: 'amber', ic: 'info', items: ['Меньше сахара', 'Без алкоголя в будни'] },
    { label: 'Аллергии', tone: 'red', ic: 'shield', items: ['Орехи'] },
  ];
  return (
    <Card dark pad={20}>
      <CardHead dark icon="heart" color={M.amber} title="Предпочтения, ограничения, аллергии" />
      <div style={{ display: 'flex', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.label} style={{ flex: 1, padding: '14px 15px', borderRadius: 13,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
              <Icon name={g.ic} size={14} stroke={M[g.tone]} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: D.ink2 }}>{g.label}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {g.items.map((it) => <Chip key={it} tone={g.tone} style={{ padding: '4px 10px' }}>{it}</Chip>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Today's adherence panel — own sub-states ────────────────────
// state: 'data' | 'loading' | 'error' | 'empty'
function AdherencePanel({ state = 'data' }) {
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'rgba(25,195,125,0.16)' }}>
        <Icon name="check" size={16} stroke={M.green} /></div>
      <span style={{ fontSize: 14, fontWeight: 700, color: D.ink, flex: 1 }}>Сегодня залогировано</span>
      <Chip dark><Icon name="lock" size={12} stroke={D.mut} />только чтение</Chip>
      <Btn kind="soft" dark size="sm" icon="today">Логировать в «Сегодня»</Btn>
    </div>
  );
  let inner;
  if (state === 'loading') {
    inner = (
      <div style={{ display: 'flex', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1 }}><SkCard h={56} head={false} pad={14} /></div>)}
      </div>
    );
  } else if (state === 'error') {
    inner = <SectionError label="Не удалось загрузить сегодняшнее следование" h={90} />;
  } else if (state === 'empty') {
    inner = (
      <div style={{ borderRadius: 13, border: `1px dashed ${D.line2}`, padding: '26px 20px', textAlign: 'center' }}>
        <Icon name="fork" size={24} stroke={M.green} style={{ margin: '0 auto 10px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>Пока ничего не залогировано</div>
        <div style={{ fontSize: 12.5, color: D.mut, marginTop: 6, lineHeight: 1.5 }}>
          Отметьте первый приём пищи или стакан воды в «Сегодня» — сводка появится здесь.</div>
        <Btn kind="accept" size="sm" icon="today" style={{ marginTop: 14 }}>Открыть «Сегодня»</Btn>
      </div>
    );
  } else {
    const logged = [
      { t: 'Завтрак', d: 'Овсянка + ягоды', c: M.green, done: true },
      { t: 'Обед', d: 'Курица, рис, салат', c: M.green, done: true },
      { t: 'Перекус', d: 'не отмечен', c: D.mut2, done: false },
      { t: 'Ужин', d: 'впереди', c: D.mut2, done: false },
    ];
    inner = (
      <>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {logged.map((m) => (
            <div key={m.t} style={{ flex: 1, padding: '13px 15px', borderRadius: 13,
              background: m.done ? 'rgba(25,195,125,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${m.done ? 'rgba(25,195,125,0.2)' : D.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle done={m.done} dark size={18} />
                <span style={{ fontSize: 13, fontWeight: 600, color: m.done ? D.ink : D.mut }}>{m.t}</span>
              </div>
              <div style={{ fontSize: 12, color: D.mut, lineHeight: 1.4 }}>{m.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px',
            borderRadius: 13, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <Icon name="fork" size={18} stroke={M.green} />
            <span style={{ flex: 1, fontSize: 13, color: D.ink2 }}>Белок</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: M.green, fontVariantNumeric: 'tabular-nums' }}>78 / 130 г</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px',
            borderRadius: 13, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <Icon name="drop" size={18} stroke={M.blue} />
            <span style={{ flex: 1, fontSize: 13, color: D.ink2 }}>Вода</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: M.blue, fontVariantNumeric: 'tabular-nums' }}>1.2 / 2 л</span>
          </div>
        </div>
      </>
    );
  }
  return <Card dark pad={20}>{head}{inner}</Card>;
}

// recipe ideas (watchable, do NOT change plan goals)
function RecipeIdeas() {
  return (
    <Card dark pad={20}>
      <CardHead dark icon="spark" color={M.green} title="Идеи блюд под план"
        right={<span style={{ fontSize: 12.5, color: D.mut2 }}>примерная оценка нутриентов</span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {RECIPES.map((r, i) => (
          <MediaCard key={i} kind="recipe" icon="fork" color={M.green} title={r.title}
            meta={r.meta} duration={r.duration} tags={r.tags} poster={r.poster} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '11px 15px',
        borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
        <Icon name="info" size={16} stroke={D.mut} />
        <span style={{ fontSize: 12.5, color: D.mut, lineHeight: 1.4 }}>
          Сохранить или залогировать рецепт можно в «Сегодня» — это идеи, они <b style={{ color: D.ink2 }}>не меняют</b> цели плана.</span>
      </div>
    </Card>
  );
}

// ── Recipe detail (focus) ───────────────────────────────────────
function RecipeDetail() {
  const ingredients = ['Филе лосося — 150 г', 'Киноа — 80 г (сухая)', 'Огурец, помидоры, шпинат',
    'Авокадо — ½', 'Лимон, оливковое масло', 'Соль, перец, зелень'];
  const steps = ['Отварите киноа до готовности, остудите', 'Запеките лосось 12–14 мин при 200°C',
    'Нарежьте овощи и авокадо', 'Соберите боул, заправьте маслом и лимоном'];
  return (
    <div style={{ padding: '20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Btn kind="ghost" dark size="sm"><Icon name="chevR" size={15} stroke={D.ink2} style={{ transform: 'rotate(180deg)' }} />Назад к плану</Btn>
        <Chip dark style={{ padding: '3px 10px' }}>Идея блюда · не меняет план</Chip>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.5 }}>
          <div style={{ position: 'relative', height: 360, borderRadius: 18, overflow: 'hidden',
            background: 'linear-gradient(135deg, #1b2620, #0c100e)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: `1px solid ${D.line}` }}>
            <Icon name="fork" size={84} stroke={M.green} sw={1.2} style={{ opacity: 0.22 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlayBadge size={72} />
            </div>
            <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 8,
              background: 'rgba(8,10,11,0.6)', fontSize: 12, fontWeight: 600, color: '#fff' }}>4:10</div>
          </div>
          <Card dark pad={20} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: D.mut2, marginBottom: 12 }}>Как готовить</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 11 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, fontSize: 12,
                    fontWeight: 700, color: M.green, background: 'rgba(25,195,125,0.14)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                  <span style={{ fontSize: 13.5, color: D.ink2, lineHeight: 1.45 }}>{s}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          <Card dark pad={20}>
            <div style={{ fontSize: 22, fontWeight: 700, color: D.ink, letterSpacing: -0.4 }}>Боул с лососем и киноа</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Chip tone="green" style={{ padding: '4px 11px' }}>Обед</Chip>
              <Chip dark style={{ padding: '4px 11px' }}>30 мин</Chip>
              <Chip dark style={{ padding: '4px 11px' }}>подходит плану</Chip>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {[['520', 'ккал', M.amber], ['38 г', 'белок', M.green], ['12 г', 'жиры', M.indigo]].map(([v, l, c]) => (
                <div key={l} style={{ flex: 1, padding: '12px', borderRadius: 12, textAlign: 'center',
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                  <Eyebrow dark style={{ marginTop: 4 }}>{l}</Eyebrow>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: D.line, margin: '18px 0' }} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: D.mut2, marginBottom: 12 }}>Ингредиенты</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ingredients.map((it) => (
                <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: M.green, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, color: D.ink2 }}>{it}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card dark pad={16} style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 13,
            background: 'rgba(255,255,255,0.03)' }}>
            <Icon name="info" size={18} stroke={D.mut} />
            <div style={{ flex: 1, fontSize: 12.5, color: D.mut, lineHeight: 1.45 }}>
              Залогировать это блюдо можно в «Сегодня». Цели плана при этом не меняются.</div>
            <Btn kind="soft" dark size="sm" icon="today">В «Сегодня»</Btn>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NutritionScreen({ state = 'done', adherence = 'data' }) {
  const empty = state === 'empty';
  const top = <TopBar dark sub={empty ? 'План питания' : 'Активная версия · v8'} title="Питание"
    right={<Chip dark><Icon name="lock" size={13} stroke={D.mut} />Только просмотр</Chip>} />;

  let body;
  if (state === 'loading') {
    body = <LoadingScreen label="Загружаем план питания" layout="plan" />;
  } else if (state === 'error') {
    body = <ErrorScreen title="План питания недоступен"
      msg="Не удалось загрузить план питания. Попробуйте обновить — данные не потеряны." secondary="Открыть чат" />;
  } else if (state === 'recipe') {
    body = <RecipeDetail />;
  } else if (empty) {
    body = (
      <div style={{ padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ChangeBanner />
        <ActiveNutritionHeader empty />
        <AdherencePanel state="empty" />
      </div>
    );
  } else {
    body = (
      <div style={{ padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ChangeBanner />
        <ActiveNutritionHeader />
        <DailyExecCard icon="today" color={M.green} title="Логирование — на экране «Сегодня»"
          text="Отмечайте приёмы пищи и воду в «Сегодня». Здесь — только просмотр плана." />
        <RevisionFacts rev="v8" when="сегодня, 09:14" source="Принято в чате" accent={M.green}
          why="Перед силовой в четверг вы часто чувствовали нехватку сил. Добавили лёгкий перекус с углеводами за час до тренировки — так будет больше энергии без тяжести в желудке." />
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <NutrientGoals />
          <MealStructure />
        </div>
        <PrefsCard />
        <CoachNotes>Не гонитесь за идеальными цифрами по выходным — важнее белок и овощи в будни. Если вечером тянет на сладкое, попробуйте йогурт-парфе из идей ниже.</CoachNotes>
        <AdherencePanel state={adherence} />
        <RecipeIdeas />
        <RevisionHistory open rows={[
          { rev: 'v8', when: 'Сегодня', note: 'Добавлен перекус перед тренировкой', active: true },
          { rev: 'v7', when: '26 мая', note: 'Поднята цель по белку до 130 г' },
          { rev: 'v6', when: '12 мая', note: 'Убран алкоголь в будни' },
          { rev: 'v5', when: '1 мая', note: 'Старт плана' },
        ]} />
      </div>
    );
  }

  return (
    <AppShell theme="dark" active="nutrition">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {top}
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>
    </AppShell>
  );
}

// isolated panel frame for sub-state artboards
function AdherenceFrame({ state }) {
  return (
    <div style={{ width: '100%', height: '100%', background: D.bg, fontFamily: FONT, padding: 28,
      display: 'flex', alignItems: 'center' }}>
      <div style={{ width: '100%' }}>
        <Eyebrow dark style={{ marginBottom: 14, paddingLeft: 2 }}>
          Панель «сегодняшнее следование» · {state === 'loading' ? 'загрузка' : state === 'error' ? 'ошибка' : 'пусто'}</Eyebrow>
        <AdherencePanel state={state} />
      </div>
    </div>
  );
}

Object.assign(window, { NutritionScreen, AdherencePanel, AdherenceFrame, RecipeDetail });
