/* workouts.jsx — dark, read-only active training program ("Тренировки").
   Plan + revision facts + coach notes + today's session as WATCHABLE exercise
   videos + weekly day list + revision history + weekly progress / advanced
   tools. States: loading / empty / error / done / video (exercise player). */

// compact week-day row
function WDayRow({ day, date, icon, color, title, meta, status, changed, today, last }) {
  const stMap = {
    done: { t: 'Выполнено', c: M.green, chip: 'green' },
    today: { t: 'Сегодня', c: M.blue, chip: 'blue' },
    plan: { t: 'Запланировано', c: D.mut, chip: 'neutral' },
    rest: { t: 'Отдых', c: D.mut2, chip: 'neutral' },
  };
  const st = stMap[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '13px 8px',
      borderBottom: last ? 'none' : `1px solid ${D.line}`,
      background: today ? 'rgba(58,141,255,0.05)' : 'transparent', borderRadius: today ? 10 : 0 }}>
      <div style={{ width: 48, flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: today ? M.blue : D.ink }}>{day}</div>
        <div style={{ fontSize: 11.5, color: D.mut2, marginTop: 2 }}>{date}</div>
      </div>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: status === 'rest' ? 'rgba(255,255,255,0.04)' : `${color}1f` }}>
        <Icon name={icon} size={17} stroke={status === 'rest' ? D.mut2 : color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: status === 'rest' ? D.mut : D.ink }}>{title}</span>
          {changed && <Chip tone="amber" style={{ padding: '2px 8px', fontSize: 11 }}>изменено</Chip>}
        </div>
        {meta && <div style={{ fontSize: 12.5, color: D.mut, marginTop: 3 }}>{meta}</div>}
      </div>
      <Chip tone={st.chip} dark={st.chip === 'neutral'}>
        {status === 'done' && <Icon name="checkSm" size={12} stroke={M.green} sw={2.4} />}{st.t}</Chip>
    </div>
  );
}

const TODAY_EX = [
  { title: 'Приседания со штангой', meta: '4 × 8 · RPE 7', duration: '3:20', tags: ['Ноги', 'Спина'], poster: 0 },
  { title: 'Жим лёжа', meta: '4 × 8 · RPE 7', duration: '2:45', tags: ['Грудь', 'Трицепс'], poster: 5 },
  { title: 'Румынская тяга', meta: '3 × 10', duration: '2:10', tags: ['Бицепс бедра'], poster: 2 },
  { title: 'Жим гантелей сидя', meta: '3 × 12', duration: '1:55', tags: ['Плечи'], poster: 3 },
];

function ActivePlanHeader({ empty }) {
  if (empty) {
    return (
      <Card dark pad={22}>
        <div style={{ borderRadius: 14, border: `1px dashed ${D.line2}`, padding: '30px 24px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 15, margin: '0 auto 16px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(58,141,255,0.12)' }}>
            <Icon name="dumbbell" size={26} stroke={M.blue} /></div>
          <div style={{ fontSize: 19, fontWeight: 700, color: D.ink, letterSpacing: -0.3 }}>Активного плана пока нет</div>
          <div style={{ fontSize: 13.5, color: D.mut, marginTop: 9, lineHeight: 1.5, maxWidth: 400, margin: '9px auto 0' }}>
            План тренировок рождается из принятого предложения коуча. Расскажите в чате о цели и
            ограничениях — коуч соберёт программу, а вы примете её одним нажатием.</div>
          <Btn kind="accept" icon="chat" style={{ marginTop: 18 }}>Открыть чат с коучем</Btn>
        </div>
      </Card>
    );
  }
  const week = [
    { d: 'Пн', v: 100, c: M.green }, { d: 'Вт', v: 80, c: M.green }, { d: 'Ср', v: 0, c: D.mut2 },
    { d: 'Чт', v: 90, c: M.blue }, { d: 'Пт', v: 40, c: M.amber }, { d: 'Сб', v: 30, c: M.indigo }, { d: 'Вс', v: 0, c: D.mut2 },
  ];
  return (
    <Card dark pad={22}>
      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Chip tone="blue" style={{ padding: '3px 10px' }}>Активный план</Chip>
            <Chip dark style={{ padding: '3px 10px' }}>версия v8</Chip>
          </div>
          <div style={{ fontSize: 25, fontWeight: 700, color: D.ink, letterSpacing: -0.5 }}>
            Сила + выносливость · 8 недель</div>
          <div style={{ fontSize: 13.5, color: D.mut, marginTop: 8, lineHeight: 1.55, maxWidth: 520 }}>
            Три силовые в неделю с фокусом на базовые движения, лёгкое кардио для восстановления
            и день мобилити. Прогрессия по самочувствию, без жёстких дедлайнов.</div>
          <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
            {[['3', 'тренировки / нед', M.blue], ['2 / 3', 'выполнено', M.green], ['185', 'минут движения', M.amber]].map(([v, l, c]) => (
              <div key={l}>
                <div style={{ fontSize: 24, fontWeight: 700, color: c, letterSpacing: -0.6,
                  fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <Eyebrow dark style={{ marginTop: 5 }}>{l}</Eyebrow>
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: D.line }} />
        <div style={{ width: 230, flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, color: D.mut, marginBottom: 14 }}>Эта неделя</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 86 }}>
            {week.map((d) => (
              <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(6, d.v)}%`, background: d.c, borderRadius: 4,
                    opacity: d.v === 0 ? 0.3 : 1 }} /></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: D.mut2 }}>{d.d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TodaySession() {
  return (
    <Card dark pad={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Chip tone="blue" style={{ padding: '3px 10px' }}>Сегодня · Чт</Chip>
        <span style={{ fontSize: 16, fontWeight: 700, color: D.ink }}>Силовая · низ тела + грудь</span>
        <span style={{ fontSize: 12.5, color: D.mut2, marginLeft: 'auto' }}>45 мин · 5 упражнений</span>
      </div>
      <div style={{ fontSize: 12.5, color: D.mut, marginBottom: 16 }}>
        Посмотрите технику перед подходом — затем отмечайте выполнение в «Сегодня».</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {TODAY_EX.map((e, i) => (
          <MediaCard key={i} kind="exercise" icon="dumbbell" color={M.blue} title={e.title}
            meta={e.meta} duration={e.duration} tags={e.tags} poster={e.poster} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '12px 15px',
        borderRadius: 12, background: 'rgba(58,141,255,0.07)', border: `1px solid rgba(58,141,255,0.2)` }}>
        <Icon name="info" size={16} stroke={M.blue} />
        <span style={{ flex: 1, fontSize: 13, color: D.ink2 }}>
          Ещё «Жим гантелей сидя» и «Планка» — всего 5 упражнений в сессии.</span>
        <Btn kind="soft" dark size="sm" icon="today">Отметить в «Сегодня»</Btn>
      </div>
    </Card>
  );
}

function WeekList() {
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
    <Card dark pad={16}>
      <CardHead dark icon="today" title="Дни недели"
        right={<span style={{ fontSize: 12.5, color: D.mut2 }}>30 мая – 8 июня</span>} />
      {days.map((d, i) => <WDayRow key={d.day} {...d} last={i === days.length - 1} />)}
    </Card>
  );
}

// weekly progress + adaptation pack + advanced tools
function WeeklyProgress() {
  return (
    <Card dark pad={20}>
      <CardHead dark icon="longevity" color={M.green} title="Недельный прогресс"
        right={<span style={{ fontSize: 12.5, color: D.mut2 }}>сводка перед коучем</span>} />
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        {[['Объём', '↑ 8%', M.blue, 'к прошлой неделе'], ['Восстановление', 'Среднее', M.amber, 'сон просел в ср/сб'],
          ['Готовность', 'Высокая', M.green, 'можно держать нагрузку']].map(([l, v, c, s]) => (
          <div key={l} style={{ flex: 1, padding: '14px 15px', borderRadius: 13, background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${D.line}` }}>
            <Eyebrow dark>{l}</Eyebrow>
            <div style={{ fontSize: 19, fontWeight: 700, color: c, marginTop: 8 }}>{v}</div>
            <div style={{ fontSize: 12, color: D.mut, marginTop: 5, lineHeight: 1.4 }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 13,
        background: 'rgba(123,123,255,0.06)', border: `1px solid rgba(123,123,255,0.2)`, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(123,123,255,0.16)' }}>
          <Icon name="spark" size={17} stroke={M.indigo} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: D.ink }}>Пакет адаптаций готов к обсуждению</div>
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: 2, lineHeight: 1.4 }}>
            +1 подход в жиме, чуть больше кардио. Это превратится в предложение в чате — план не меняется здесь.</div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: M.indigo, whiteSpace: 'nowrap' }}>Превью →</span>
      </div>
      <Expander icon="spark" title="Продвинутые инструменты" hint="не меняют план">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['Сгенерировать сводку недели', 'Соберёт прогресс в текст для коуча'],
            ['Обновить сводку', 'Пересчитать с последними данными'],
            ['Посмотреть превью адаптаций', 'Что коуч может предложить дальше']].map(([t, s]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: D.ink }}>{t}</div>
                <div style={{ fontSize: 12, color: D.mut2, marginTop: 2 }}>{s}</div>
              </div>
              <Btn kind="ghost" dark size="sm">Запустить</Btn>
            </div>
          ))}
        </div>
      </Expander>
    </Card>
  );
}

// ── Exercise video player (focus state) ─────────────────────────
function ExerciseVideo() {
  const cues = [
    'Стопы на ширине плеч, штанга на трапециях',
    'Корпус прямой, взгляд вперёд, колени в направлении носков',
    'Опускайтесь до параллели бедра с полом',
    'Мощно встаньте, выдох в верхней точке',
  ];
  return (
    <div style={{ padding: '20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Btn kind="ghost" dark size="sm"><Icon name="chevR" size={15} stroke={D.ink2} style={{ transform: 'rotate(180deg)' }} />Назад к плану</Btn>
        <Chip dark style={{ padding: '3px 10px' }}>Упражнение 1 из 5</Chip>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.5 }}>
          <div style={{ position: 'relative', height: 420, borderRadius: 18, overflow: 'hidden',
            background: 'linear-gradient(135deg, #1c2733, #0c1114)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: `1px solid ${D.line}` }}>
            <Icon name="dumbbell" size={92} stroke={M.blue} sw={1.2} style={{ opacity: 0.22 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlayBadge size={76} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 22px 18px',
              background: 'linear-gradient(transparent, rgba(8,10,11,0.75))' }}>
              <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.2)', marginBottom: 12 }}>
                <div style={{ width: '32%', height: '100%', borderRadius: 4, background: M.blue }} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Icon name="pause" size={18} stroke="#fff" />
                <span style={{ fontSize: 12.5, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>1:04 / 3:20</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>HD · без звука</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {TODAY_EX.slice(0, 4).map((e, i) => (
              <div key={i} style={{ flex: 1, borderRadius: 11, overflow: 'hidden', cursor: 'pointer',
                border: `1px solid ${i === 0 ? M.blue : D.line}`, opacity: i === 0 ? 1 : 0.7 }}>
                <div style={{ height: 52, background: 'linear-gradient(135deg, #1c2733, #0f1518)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="dumbbell" size={20} stroke={M.blue} style={{ opacity: 0.5 }} /></div>
                <div style={{ padding: '7px 9px', fontSize: 11, color: D.mut, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <Card dark pad={20}>
            <div style={{ fontSize: 22, fontWeight: 700, color: D.ink, letterSpacing: -0.4 }}>Приседания со штангой</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Chip tone="blue" style={{ padding: '4px 11px' }}>4 подхода × 8</Chip>
              <Chip dark style={{ padding: '4px 11px' }}>RPE 7</Chip>
              <Chip dark style={{ padding: '4px 11px' }}>отдых 2 мин</Chip>
            </div>
            <div style={{ height: 1, background: D.line, margin: '18px 0' }} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: D.mut2, marginBottom: 12 }}>Ключевые точки техники</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {cues.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 11 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, fontSize: 12,
                    fontWeight: 700, color: M.blue, background: 'rgba(58,141,255,0.14)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                  <span style={{ fontSize: 13.5, color: D.ink2, lineHeight: 1.45 }}>{c}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card dark pad={16} style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 13,
            background: 'rgba(25,195,125,0.07)', borderColor: 'rgba(25,195,125,0.25)' }}>
            <Icon name="today" size={20} stroke={M.green} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: D.ink }}>Готовы выполнить?</div>
              <div style={{ fontSize: 12.5, color: D.mut, marginTop: 2 }}>Отметьте подходы на экране «Сегодня».</div>
            </div>
            <Btn kind="accept" size="sm" icon="today">В «Сегодня»</Btn>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WorkoutsScreen({ state = 'done' }) {
  const empty = state === 'empty';
  const top = <TopBar dark sub={empty ? 'План тренировок' : 'Активная версия · v8'} title="Тренировки"
    right={<Chip dark><Icon name="lock" size={13} stroke={D.mut} />Только просмотр</Chip>} />;

  let body;
  if (state === 'loading') {
    body = <LoadingScreen label="Загружаем план тренировок" layout="plan" />;
  } else if (state === 'error') {
    body = <ErrorScreen title="План недоступен"
      msg="Не удалось загрузить программу тренировок. Попробуйте обновить — данные не потеряны." secondary="Открыть чат" />;
  } else if (state === 'video') {
    body = <ExerciseVideo />;
  } else if (empty) {
    body = (
      <div style={{ padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ChangeBanner />
        <ActivePlanHeader empty />
        <WeeklyProgress />
      </div>
    );
  } else {
    body = (
      <div style={{ padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ChangeBanner />
        <ActivePlanHeader />
        <DailyExecCard icon="today" color={M.blue} title="Выполнение — на экране «Сегодня»"
          text="Запускайте и отмечайте тренировки в «Сегодня». Здесь — только просмотр программы." />
        <RevisionFacts rev="v8" when="сегодня, 09:14" source="Принято в чате"
          why="В четверг у вас встречи до вечера, а восстановление за последние дни ниже обычного. Силовую перенесли на пятницу, в четверг оставили лёгкую прогулку — так нагрузка ляжет на более свежий день." />
        <TodaySession />
        <CoachNotes>На жиме держите лопатки сведёнными и не гоните темп — нам важнее техника, чем вес. Если в пятницу будет мало сил, можно убрать последний подход.</CoachNotes>
        <WeekList />
        <RevisionHistory open />
        <WeeklyProgress />
      </div>
    );
  }

  return (
    <AppShell theme="dark" active="training">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {top}
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { WorkoutsScreen, WDayRow });
