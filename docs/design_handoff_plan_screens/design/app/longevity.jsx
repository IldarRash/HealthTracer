/* longevity.jsx — dark weekly overview ("Динамика"). Full brief:
   consistency hero, domain summaries, goals, 7-day wellbeing, consent-gated
   device signals, cross-domain trends (with deferred domains), document
   metadata, coach prompts. States: loading / sparse / error / partial / done. */

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
    <span style={{ display: 'inline-flex', alignItems: 'center', color }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}>
        <path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}

// ── HERO · consistency (ring + percent + day bars) ──────────────
function ConsistencyHero({ sparse }) {
  const days = [
    { d: 'Пн', v: 90, c: M.green }, { d: 'Вт', v: 75, c: M.green }, { d: 'Ср', v: 40, c: M.amber },
    { d: 'Чт', v: 85, c: M.green }, { d: 'Пт', v: 100, c: M.green }, { d: 'Сб', v: 20, c: M.red },
    { d: 'Вс', v: 70, c: M.green },
  ];
  if (sparse) {
    return (
      <Card dark pad={24} style={{ background: 'linear-gradient(135deg, rgba(25,195,125,0.07), rgba(19,22,24,0))' }}>
        <Eyebrow dark style={{ marginBottom: 14 }}>Консистентность недели</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', flexShrink: 0,
            border: `3px dashed ${D.line2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="spark" size={30} stroke={M.green} sw={1.6} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: D.ink, letterSpacing: -0.3 }}>
              Соберём вашу неделю</div>
            <div style={{ fontSize: 13.5, color: D.mut, marginTop: 7, lineHeight: 1.5, maxWidth: 440 }}>
              Пока данных мало для процента консистентности. Отметьте пару тренировок и приёмов пищи
              на экране «Сегодня» — и здесь появится живая картина недели.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Btn kind="accept" size="sm" icon="today">Открыть «Сегодня»</Btn>
              <Btn kind="ghost" dark size="sm" icon="chat">Обсудить цели с коучем</Btn>
            </div>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card dark pad={24}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <Eyebrow dark style={{ marginBottom: 16 }}>Консистентность</Eyebrow>
          <Ring value={76} size={138} sw={12} color={M.green} dark label="76" sub="за неделю" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }}>
            <TrendArrow dir="up" />
            <span style={{ fontSize: 13, color: D.ink2 }}>
              <span style={{ color: M.green, fontWeight: 700 }}>+9%</span> к прошлой</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <Icon name="bolt" size={13} stroke={M.amber} fill={M.amber} />
            <span style={{ fontSize: 12.5, color: D.mut }}>Серия: 4 дня подряд</span>
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: D.line }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: D.ink2 }}>Выполнение плана по дням</span>
            <span style={{ fontSize: 12.5, color: D.mut2 }}>30 мая – 5 июня</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 14, minHeight: 132 }}>
            {days.map((d) => (
              <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: D.mut2, fontVariantNumeric: 'tabular-nums' }}>{d.v}</div>
                <div style={{ width: '100%', height: 96, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${d.v}%`, background: d.c, borderRadius: 6,
                    opacity: d.v < 30 ? 0.55 : 1 }} />
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

// ── Domain summary cards (Сегодня / Тренировки / Питание) ───────
function DomainCard({ icon, color, label, value, sub, link, sparse, progress }) {
  return (
    <Card dark pad={18} style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: `${color}1c` }}>
          <Icon name={icon} size={16} stroke={color} /></div>
        <span style={{ fontSize: 13, fontWeight: 700, color: D.ink2, flex: 1 }}>{label}</span>
        <Icon name="chevR" size={15} stroke={D.mut2} />
      </div>
      {sparse ? (
        <div style={{ fontSize: 13, color: D.mut, lineHeight: 1.45 }}>Пока недостаточно данных</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 27, fontWeight: 700, color, letterSpacing: -0.6,
              fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          </div>
          {progress != null && <div style={{ marginTop: 11 }}><Progress dark value={progress} color={color} h={6} /></div>}
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: progress != null ? 9 : 7, lineHeight: 1.4 }}>{sub}</div>
        </>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 12 }}>{link} →</div>
    </Card>
  );
}

function DomainRow({ sparse }) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <DomainCard icon="today" color={M.green} label="Сегодня" value="3 / 5" progress={60}
        sub="выполнено задач дня" link="К плану на сегодня" sparse={sparse} />
      <DomainCard icon="dumbbell" color={M.blue} label="Тренировки" value="2 / 3" progress={66}
        sub="стабильно эту неделю" link="К плану тренировок" sparse={sparse} />
      <DomainCard icon="fork" color={M.amber} label="Питание" value="Белок+" progress={80}
        sub="«Белок + овощи» · следование 80%" link="К плану питания" sparse={sparse} />
    </div>
  );
}

// ── Goals ───────────────────────────────────────────────────────
function GoalsCard({ empty }) {
  if (empty) {
    return (
      <Card dark pad={20} style={{ flex: 1.3 }}>
        <CardHead dark icon="flag" color={M.green} title="Активные цели" />
        <div style={{ borderRadius: 12, border: `1px dashed ${D.line2}`, padding: '26px 20px', textAlign: 'center' }}>
          <Icon name="flag" size={26} stroke={M.green} style={{ margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>Целей пока нет</div>
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: 6, maxWidth: 300, margin: '6px auto 0', lineHeight: 1.5 }}>
            Расскажите коучу, чего хотите достичь — он предложит цель и план под неё.</div>
          <Btn kind="accept" size="sm" icon="chat" style={{ marginTop: 14 }}>Обсудить цель</Btn>
        </div>
      </Card>
    );
  }
  const goals = [
    { t: 'Больше энергии днём', tag: 'Квартальная', v: 62, c: M.green, note: '62%', star: true },
    { t: '3 тренировки в неделю', tag: 'Неделя', v: 66, c: M.blue, note: '2 / 3' },
    { t: 'Белок 100 г/день', tag: 'Неделя', v: 80, c: M.green, note: '5 / 7 дней' },
    { t: 'Сон 7+ часов', tag: 'Неделя', v: 57, c: M.indigo, note: '4 / 7 дней' },
  ];
  return (
    <Card dark pad={20} style={{ flex: 1.3 }}>
      <CardHead dark icon="flag" color={M.green} title="Прогресс по целям"
        right={<span style={{ fontSize: 12.5, color: M.green, fontWeight: 600 }}>обсудить в чате →</span>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
        {goals.map((g, i) => (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {g.star && <Icon name="star" size={14} stroke={M.amber} fill={M.amber} />}
                <span style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>{g.t}</span>
                <Chip dark style={{ padding: '2px 8px', fontSize: 11 }}>{g.tag}</Chip>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: D.mut, fontVariantNumeric: 'tabular-nums' }}>{g.note}</span>
            </div>
            <Progress dark value={g.v} color={g.c} h={8} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 7-day wellbeing (mood + stress, no clinical scores) ─────────
function WellbeingCard({ sparse }) {
  const mood = [3, 4, 2, 4, 5, 3, 4];
  const stress = [2, 2, 4, 3, 2, 4, 3];
  const dlabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const moodFaces = ['😖', '🙁', '😐', '🙂', '😄'];
  return (
    <Card dark pad={18} style={{ flex: 1 }}>
      <CardHead dark icon="heart" color={M.amber} title="Самочувствие · 7 дней" />
      {sparse ? (
        <div style={{ fontSize: 13, color: D.mut, lineHeight: 1.5, padding: '8px 0' }}>
          Ежедневные чек-ины появятся здесь, как только вы начнёте отмечать настроение в «Сегодня».
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            {dlabels.map((d, i) => (
              <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 19, lineHeight: 1.1 }}>{moodFaces[mood[i] - 1]}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-end', height: 44 }}>
            {stress.map((s, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: '64%', height: `${s * 9}px`, background: s >= 4 ? M.amber : 'rgba(245,165,36,0.4)',
                  borderRadius: 3 }} />
                <span style={{ fontSize: 11, color: D.mut2 }}>{dlabels[i]}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
            <span style={{ fontSize: 12, color: D.mut, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>🙂</span> настроение</span>
            <span style={{ fontSize: 12, color: D.mut, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: M.amber, display: 'inline-block' }} /> уровень стресса</span>
          </div>
        </>
      )}
      <MedicalNote>История ваших чек-инов · это не клиническая оценка.</MedicalNote>
    </Card>
  );
}

// ── Cross-domain trends (with deferred domains under expander) ──
function CrossDomainTrends({ failed }) {
  if (failed) return <SectionError label="Кросс-доменный обзор не обновился" h={120} />;
  const trends = [
    { ic: 'moon', c: M.indigo, t: 'В дни с коротким сном тренировки чаще пропускаются', tag: 'Сон × Тренировки' },
    { ic: 'fork', c: M.green, t: 'Белок выше в дни силовых — хороший автоматизм', tag: 'Питание × Тренировки' },
    { ic: 'heart', c: M.amber, t: 'Стресс растёт к концу недели, активность падает', tag: 'Стресс × Активность' },
  ];
  return (
    <Card dark pad={18}>
      <CardHead dark icon="longevity" color={M.green} title="Недельный обзор · что заметила система"
        right={<Chip dark style={{ padding: '2px 9px', fontSize: 11 }}>паттерны</Chip>} />
      <div style={{ display: 'flex', gap: 14 }}>
        {trends.map((t, i) => (
          <div key={i} style={{ flex: 1, padding: '14px 15px', borderRadius: 13,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: `${t.c}1c`, marginBottom: 11 }}>
              <Icon name={t.ic} size={16} stroke={t.c} /></div>
            <div style={{ fontSize: 13, color: D.ink2, lineHeight: 1.45 }}>{t.t}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: D.mut2, marginTop: 9, letterSpacing: 0.2 }}>{t.tag}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '11px 14px',
        borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: `1px dashed ${D.line}`, cursor: 'pointer' }}>
        <Icon name="chevR" size={15} stroke={D.mut} />
        <span style={{ flex: 1, fontSize: 12.5, color: D.mut }}>
          Ещё 2 домена отложены — мало данных (вес, гидратация)</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: D.mut2 }}>показать</span>
      </div>
    </Card>
  );
}

// ── Documents (metadata only) ───────────────────────────────────
function DocumentsCard({ sparse }) {
  const docs = [
    { t: 'Анализы крови', when: '14 мая', status: 'Обработан', tone: 'green' },
    { t: 'Выписка от врача', when: '2 мая', status: 'В обработке', tone: 'amber' },
  ];
  return (
    <Card dark pad={18} style={{ flex: 1 }}>
      <CardHead dark icon="doc" color={M.blue} title="Документы"
        right={<Chip dark style={{ padding: '2px 9px', fontSize: 11 }}>
          <Icon name="shield" size={11} stroke={D.mut} />по согласию</Chip>} />
      {sparse ? (
        <div style={{ borderRadius: 12, border: `1px dashed ${D.line2}`, padding: '20px', textAlign: 'center' }}>
          <Icon name="doc" size={22} stroke={M.blue} style={{ margin: '0 auto 9px' }} />
          <div style={{ fontSize: 13, color: D.mut, lineHeight: 1.5, maxWidth: 260, margin: '0 auto' }}>
            Документов пока нет. Их можно загрузить в Профиле.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {docs.map((d) => (
            <div key={d.t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
              borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: 'rgba(58,141,255,0.14)' }}>
                <Icon name="doc" size={15} stroke={M.blue} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: D.ink }}>{d.t}</div>
                <div style={{ fontSize: 12, color: D.mut2, marginTop: 2 }}>загружен {d.when}</div>
              </div>
              <Chip tone={d.tone} style={{ padding: '2px 9px', fontSize: 11 }}>{d.status}</Chip>
            </div>
          ))}
        </div>
      )}
      <MedicalNote>Показываем только метаданные — содержание не анализируется на этом экране.</MedicalNote>
    </Card>
  );
}

// ── Coach prompts ───────────────────────────────────────────────
function CoachChips() {
  const chips = ['Обсудить эту неделю', 'Почему просел сон?', 'Можно ли добавить тренировку?', 'Цель на следующую неделю'];
  return (
    <Card dark pad={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar who="coach" size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: D.ink }}>Поговорить с коучем</div>
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: 2 }}>Любые изменения плана — через чат</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 14 }}>
        {chips.map((c) => (
          <span key={c} style={{ padding: '9px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            color: D.ink2, background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.line2}`, cursor: 'pointer' }}>
            {c}</span>
        ))}
      </div>
    </Card>
  );
}

// ── Screen ──────────────────────────────────────────────────────
function LongevityScreen({ state = 'done' }) {
  const sparse = state === 'sparse';
  const partial = state === 'partial';
  const top = (
    <TopBar dark sub="Неделя · 30 мая – 5 июня" title="Динамика"
      right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${D.line}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevR" size={16} stroke={D.mut} style={{ transform: 'rotate(180deg)' }} /></div>
        <Chip dark>Эта неделя</Chip>
        <div style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${D.line}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevR" size={16} stroke={D.mut} /></div>
      </div>} />
  );

  let body;
  if (state === 'loading') {
    body = <LoadingScreen label="Загружаем обзор недели" layout="longevity" />;
  } else if (state === 'error') {
    body = <ErrorScreen title="Обзор недоступен"
      msg="Не удалось собрать недельный обзор. Данные на месте — попробуйте обновить через минуту."
      retry="Обновить" secondary="Открыть чат" />;
  } else {
    body = (
      <div style={{ padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {partial && <PartialBanner>Сигналы устройств и часть трендов не обновились. Остальное актуально.</PartialBanner>}
        <ConsistencyHero sparse={sparse} />
        <DomainRow sparse={sparse} />
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <GoalsCard empty={sparse} />
          <WellbeingCard sparse={sparse} />
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {partial ? <div style={{ flex: 1 }}><Card dark pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(58,141,255,0.14)' }}>
                <Icon name="shield" size={15} stroke={M.blue} /></div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: D.ink, flex: 1 }}>Wellness-сигналы устройств</span></div>
            <SectionError label="Сигналы устройств не обновились" h={96} />
          </Card></div>
            : <div style={{ flex: 1 }}><ConsentSignals state={sparse ? 'connect' : 'data'} /></div>}
          <div style={{ flex: 1 }}><DocumentsCard sparse={sparse} /></div>
        </div>
        {!sparse && <CrossDomainTrends failed={partial} />}
        <CoachChips />
      </div>
    );
  }

  return (
    <AppShell theme="dark" active="longevity">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {top}
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { LongevityScreen, Spark, TrendArrow });
