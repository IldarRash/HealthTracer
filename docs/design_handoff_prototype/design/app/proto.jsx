/* proto.jsx — clickable desktop prototype controller for Health Tracer.
   - Real sidebar navigation (via window.__htNav, wired in shell.jsx).
   - Scripted chat flows (body analysis by photo, "make it lighter", proposal accept/reject).
   - A bottom "scenario" bar to reach every screen and every async state by click.
   No live LLM: all coach replies are scripted. */

const { useState, useEffect, useRef } = React;

// ── Scripted chat ───────────────────────────────────────────────
const CHIPS = [
  { id: 'body', label: 'Оцени моё тело по фото' },
  { id: 'dietary', label: 'Сделай план диетичнее' },
  { id: 'proposal', label: 'Перенеси силовую на пятницу' },
  { id: 'recipe', label: 'Что приготовить на ужин?' },
];

function ProtoChat() {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // auto-advance: analysing → result
  useEffect(() => {
    const last = turns[turns.length - 1];
    if (last && last.kind === 'analyzing') {
      const t = setTimeout(() => {
        setTurns((ts) => ts.map((x, i) => i === ts.length - 1
          ? { role: 'coach', kind: 'bodyresult', saved: false } : x));
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [turns]);

  const pushUser = (text, photos) => setTurns((t) => [...t, { role: 'user', text, photos }]);
  const sendCoach = (turn, delay = 600) => {
    setTurns((t) => [...t, { role: 'coach', kind: 'typing' }]);
    setTimeout(() => setTurns((t) => {
      const c = [...t]; const i = c.map((x) => x.kind).lastIndexOf('typing');
      if (i >= 0) c[i] = turn; return c;
    }), delay);
  };
  const patch = (idx, p) => setTurns((t) => t.map((x, i) => i === idx ? { ...x, ...p } : x));

  const handleChip = (id) => {
    if (id === 'body') {
      pushUser('Оцени моё тело по фото. Хочу узнать примерный процент жира и какие мышцы отстают.');
      sendCoach({ role: 'coach', kind: 'photoguide' });
    } else if (id === 'dietary') {
      pushUser('Сделай план питания более диетическим');
      sendCoach({ role: 'coach', kind: 'dietary' });
    } else if (id === 'proposal') {
      pushUser('Перенеси силовую с четверга на пятницу');
      sendCoach({ role: 'coach', kind: 'proposal', state: 'proposed' });
    } else if (id === 'recipe') {
      pushUser('Что приготовить на ужин под план?');
      sendCoach({ role: 'coach', kind: 'recipe' });
    }
  };

  const onShoot = () => { pushUser('Готово, со всех сторон', true); setTurns((t) => [...t, { role: 'coach', kind: 'analyzing' }]); };

  const send = () => {
    const v = input.trim(); if (!v) return; setInput('');
    pushUser(v);
    sendCoach({ role: 'coach', kind: 'text', paras: [
      'Это демо-прототип — коуч отвечает по заранее заданным сценариям, без живого ИИ.',
      'Выберите один из готовых сценариев ниже — он проиграется по шагам.'] });
  };

  const renderCoach = (t, idx) => {
    if (t.kind === 'typing') return <ThinkingBlock key={idx} />;
    if (t.kind === 'text') return (
      <CoachMsg key={idx}>{t.paras.map((p, i) => <Para key={i} style={i === t.paras.length - 1 ? { marginBottom: 0 } : null}>{p}</Para>)}</CoachMsg>
    );
    if (t.kind === 'photoguide') return (
      <CoachMsg key={idx}>
        <Para>Конечно. По фото я прикину процент жира, общий мышечный тонус и какие группы стоит подтянуть. Это оценка на глаз, не замер — но как ориентир работает.</Para>
        <Para style={{ marginBottom: 14 }}>Пришлите три снимка с разных ракурсов:</Para>
        <PhotoGuide onShoot={onShoot} onUpload={onShoot} />
      </CoachMsg>
    );
    if (t.kind === 'analyzing') return <ThinkingBlock key={idx} label="Коуч анализирует фото · оцениваю состав и мышцы…" />;
    if (t.kind === 'bodyresult') return (
      <CoachMsg key={idx}>
        <Para style={{ marginBottom: 14 }}>Готово. Телосложение спортивное — ноги и кор заметно сильнее верха. Жир в норме и, судя по динамике, снижается.</Para>
        <BodyAnalysisCard saved={t.saved}
          onSave={() => { patch(idx, { saved: true }); window.__htBodySaved = true;
            sendCoach({ role: 'coach', kind: 'savednote' }, 500); }}
          onOpen={() => window.__htNav('body')} />
      </CoachMsg>
    );
    if (t.kind === 'savednote') return (
      <CoachMsg key={idx}>
        <Para style={{ marginBottom: 0 }}>Сохранил в профиль, раздел «Анализ тела». Учту это при планировании тренировок —
          добавлю работу на грудь, руки и спину. <span style={{ color: M.green, fontWeight: 600, cursor: 'pointer' }}
          onClick={() => window.__htNav('body')}>Открыть профиль →</span></Para>
      </CoachMsg>
    );
    if (t.kind === 'proposal') return (
      <CoachMsg key={idx}>
        <Para>В четверг у вас встречи до вечера, а восстановление ниже обычного. Предлагаю сдвинуть силовую на пятницу:</Para>
        <ProposalCard domain="training" state={t.state}
          title="Сдвинуть силовую с четверга на пятницу"
          why="В пятницу будет больше сил и времени, а в четверг оставим лёгкую прогулку для восстановления."
          changes={[
            { from: { k: 'Четверг', v: 'Силовая · 45 мин' }, to: { k: 'Пятница', v: 'Силовая · 45 мин' } },
            { from: { k: 'Четверг', v: '—' }, to: { k: 'Четверг', v: 'Прогулка · 20 мин' } },
          ]}
          onAccept={() => patch(idx, { state: 'accepted' })}
          onReject={() => patch(idx, { state: 'rejected' })}
          onUndo={() => patch(idx, { state: 'proposed' })}
          onRestore={() => patch(idx, { state: 'proposed' })} />
      </CoachMsg>
    );
    if (t.kind === 'dietary') return (
      <CoachMsg key={idx}>
        <Para>Сделаю вариант «полегче» без урезания белка — за счёт замен уйдёт ≈350 ккал в день. Я собрал черновик версии v9:</Para>
        <div style={{ borderRadius: 16, border: `1px solid ${L.line2}`, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: M.greenDim }}>
              <Icon name="fork" size={21} stroke={M.green} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: L.ink }}>Облегчённый план · v9</div>
              <div style={{ fontSize: 13, color: L.mut, marginTop: 2 }}>2100 → 1750 ккал/день · 5 замен · белок сохранён</div>
            </div>
            <Btn kind="accept" size="sm" icon="arrow" onClick={() => window.__htNav('nt-dietary')}>Открыть черновик</Btn>
          </div>
        </div>
      </CoachMsg>
    );
    if (t.kind === 'recipe') return (
      <CoachMsg key={idx}>
        <Para style={{ marginBottom: 14 }}>Под сегодняшние цели подойдёт что-то лёгкое с белком. Например:</Para>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, maxWidth: 460 }}>
          <MediaCard kind="recipe" icon="fork" color={M.green} title="Боул с лососем и киноа" meta="≈ 520 ккал · 38 г белка" duration="4:10" tags={['Ужин', 'Рыба']} poster={2} />
          <MediaCard kind="recipe" icon="fork" color={M.green} title="Курица терияки" meta="≈ 610 ккал · 44 г белка" duration="5:30" tags={['Ужин']} poster={1} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Btn kind="soft" size="sm" icon="fork" onClick={() => window.__htNav('nutrition')}>Открыть план питания</Btn>
        </div>
      </CoachMsg>
    );
    return null;
  };

  return (
    <AppShell active="chat">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${L.line}`, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: L.ink }}>Коуч</span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: M.green }} />
            <span style={{ fontSize: 12.5, color: L.mut }}>на связи</span>
          </div>
          <Chip tone="neutral">Контекст: цель «энергия»</Chip>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 8px' }}>
            {turns.length === 0 ? (
              <div style={{ height: 440, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center' }}>
                <Avatar who="coach" size={56} />
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.6, color: L.ink, margin: '20px 0 8px' }}>
                  С чего начнём, Алина?</div>
                <div style={{ fontSize: 15, color: L.mut, maxWidth: 430, lineHeight: 1.55 }}>
                  Нажмите сценарий — он проиграется по шагам. Коуч предлагает, а решение всегда за вами.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 500, marginTop: 28 }}>
                  {CHIPS.map((c) => (
                    <span key={c.id} className="htBtn" onClick={() => handleChip(c.id)} style={{ padding: '10px 16px', borderRadius: 999,
                      border: `1px solid ${L.line2}`, background: '#fff', fontSize: 13.5, fontWeight: 500,
                      color: L.ink2, cursor: 'pointer' }}>{c.label}</span>
                  ))}
                </div>
              </div>
            ) : turns.map((t, i) => t.role === 'user'
              ? (t.photos ? <PhotoStripMsg key={i} caption={t.text} /> : <UserMsg key={i}>{t.text}</UserMsg>)
              : renderCoach(t, i))}
          </div>
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${L.line}`, background: L.bg }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px' }}>
            {turns.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0 0' }}>
                {CHIPS.map((c) => (
                  <span key={c.id} className="htBtn" onClick={() => handleChip(c.id)} style={{ padding: '7px 12px', borderRadius: 999,
                    border: `1px solid ${L.line2}`, background: '#fff', fontSize: 12.5, fontWeight: 500,
                    color: L.mut, cursor: 'pointer' }}>{c.label}</span>
                ))}
              </div>
            )}
            <div style={{ padding: '14px 0 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 10px 10px 16px',
                borderRadius: 26, border: `1px solid ${L.line2}`, background: '#fff', boxShadow: '0 2px 14px rgba(0,0,0,0.04)' }}>
                <Icon name="clip" size={21} stroke={L.mut} style={{ marginBottom: 7 }} />
                <Icon name="camera" size={21} stroke={L.mut} style={{ marginBottom: 7 }} />
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Напишите коучу или выберите сценарий…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: L.ink, padding: '9px 2px',
                    fontFamily: FONT, background: 'transparent' }} />
                <div onClick={send} className="htBtn" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: L.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="send" size={18} stroke="#fff" sw={2} />
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: L.mut2, marginTop: 9 }}>
                Коуч предлагает — решение всегда за вами. Это поддержка по образу жизни, не медицинская консультация.</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Scenario bar (bottom) — reach any screen / state ────────────
const NAV_GROUPS = [
  { title: 'Основное', items: [['chat', 'Чат'], ['today', 'Сегодня'], ['longevity', 'Динамика'],
    ['workouts', 'Тренировки'], ['nutrition', 'Питание'], ['profile', 'Профиль']] },
  { title: 'Питание · детально', items: [['nt-meals', 'Калории по приёмам'], ['nt-week', 'Рацион на неделю'],
    ['nt-grocery', 'Закупка'], ['nt-dietary', 'Диетичнее']] },
  { title: 'Анализ тела', items: [['body', 'Анализ тела']] },
  { title: 'Подписка и вход', items: [['pricing', 'Тарифы Free/Pro'], ['limit', 'Лимит исчерпан'],
    ['onb-welcome', 'Онбординг · 1'], ['onb-goal', 'Онбординг · 2'], ['onb-done', 'Онбординг · 3'],
    ['consent', 'Согласие']] },
];
const STATE_OPTS = {
  today: ['partial', 'done', 'empty'],
  longevity: ['loading', 'sparse', 'error', 'partial', 'done'],
  workouts: ['loading', 'empty', 'error', 'done', 'video'],
  nutrition: ['loading', 'empty', 'error', 'done', 'recipe'],
};
const STATE_RU = { partial: 'частично', done: 'готово', empty: 'пусто', loading: 'загрузка',
  error: 'ошибка', sparse: 'sparse', recipe: 'рецепт', video: 'видео' };
const ALL_LABELS = {};
NAV_GROUPS.forEach((g) => g.items.forEach(([id, l]) => { ALL_LABELS[id] = l; }));

function ScenarioBar({ route, states, setRoute, setState, menuOpen, setMenuOpen }) {
  const stOpts = STATE_OPTS[route];
  const chip = (active, label, onClick) => (
    <span key={label} className="htBtn" onClick={onClick} style={{ padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      background: active ? M.green : 'rgba(255,255,255,0.07)', color: active ? '#04130c' : D.ink2,
      border: `1px solid ${active ? M.green : D.line2}` }}>{label}</span>
  );
  return (
    <>
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', left: 16, right: 16, bottom: 60,
            maxWidth: 1000, margin: '0 auto', background: D.panel, border: `1px solid ${D.line2}`, borderRadius: 16,
            padding: 18, zIndex: 61, boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              {NAV_GROUPS.map((g) => (
                <div key={g.title}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                    color: D.mut2, marginBottom: 10 }}>{g.title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {g.items.map(([id, label]) => (
                      <span key={id} className="htBtn" onClick={() => { setRoute(id); setMenuOpen(false); }}
                        style={{ padding: '8px 11px', borderRadius: 9, fontSize: 13, cursor: 'pointer',
                          background: route === id ? 'rgba(25,195,125,0.16)' : 'rgba(255,255,255,0.04)',
                          color: route === id ? M.green : D.ink2, border: `1px solid ${route === id ? 'rgba(25,195,125,0.4)' : D.line}`,
                          fontWeight: route === id ? 700 : 500 }}>{label}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 52, zIndex: 62,
        background: D.bg, borderTop: `1px solid ${D.line2}`, display: 'flex', alignItems: 'center',
        gap: 14, padding: '0 16px', fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <Mark size={20} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: D.ink, letterSpacing: 0.2 }}>Прототип</span>
          <span style={{ width: 1, height: 18, background: D.line2, margin: '0 2px' }} />
          <span style={{ fontSize: 12.5, color: D.mut }}>{ALL_LABELS[route] || route}</span>
        </div>
        {stOpts && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
            <span style={{ fontSize: 11, color: D.mut2, flexShrink: 0 }}>состояние:</span>
            {stOpts.map((s) => chip(states[route] === s, STATE_RU[s] || s, () => setState(route, s)))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span className="htBtn" onClick={() => setMenuOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center',
          gap: 8, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.07)',
          color: D.ink, border: `1px solid ${D.line2}`, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          <Icon name="today" size={15} stroke={D.ink} />Все экраны
          <Icon name={menuOpen ? 'chevD' : 'chevR'} size={14} stroke={D.mut} style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(-90deg)' }} />
        </span>
      </div>
    </>
  );
}

// ── App controller ──────────────────────────────────────────────
const FIXED_ROUTES = new Set(['chat']);
const ONB = { 'onb-welcome': 'welcome', 'onb-goal': 'goal', 'onb-done': 'done' };

function ProtoApp() {
  const [route, setRoute] = useState('chat');
  const [states, setStates] = useState({ today: 'partial', longevity: 'done', workouts: 'done', nutrition: 'done' });
  const [menuOpen, setMenuOpen] = useState(false);
  const setState = (r, s) => setStates((st) => ({ ...st, [r]: s }));

  useEffect(() => {
    window.__htNav = (id) => setRoute(id === 'training' ? 'workouts' : id);
    return () => { delete window.__htNav; };
  }, []);

  const mode = FIXED_ROUTES.has(route) ? 'fixed' : 'flow';
  window.__htFlow = mode;

  let screen;
  if (route === 'chat') screen = <ProtoChat />;
  else if (route === 'today') screen = <TodayScreen state={states.today} />;
  else if (route === 'longevity') screen = <LongevityScreen state={states.longevity} />;
  else if (route === 'workouts') screen = <WorkoutsScreen state={states.workouts} />;
  else if (route === 'nutrition') screen = <NutritionScreen state={states.nutrition} />;
  else if (route === 'nt-meals') screen = <NutritionMealsScreen />;
  else if (route === 'nt-week') screen = <WeekPlanScreen />;
  else if (route === 'nt-grocery') screen = <GroceryScreen />;
  else if (route === 'nt-dietary') screen = <DietaryScreen />;
  else if (route === 'profile') screen = <ProfileScreen />;
  else if (route === 'body') screen = <BodyAnalysisScreen />;
  else if (route === 'pricing') screen = <PricingScreen />;
  else if (route === 'limit') screen = <LimitReachedScreen />;
  else if (ONB[route]) screen = <OnboardingScreen step={ONB[route]} />;
  else if (route === 'consent') screen = <ConsentScreen />;
  else screen = <ProtoChat />;

  return (
    <>
      <div key={route} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 52,
        overflowY: mode === 'flow' ? 'auto' : 'hidden', overflowX: 'hidden', background: L.bg }}>
        {screen}
      </div>
      <ScenarioBar route={route} states={states} setRoute={setRoute} setState={setState}
        menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
    </>
  );
}

window.ProtoApp = ProtoApp;
