/* onboarding.jsx — first-run flow (light, friendly) + documents consent screen. */

const ONB_STEPS = ['Знакомство', 'Цель', 'Контекст', 'Ограничения', 'Готово'];

function OnbPanel({ active = 1 }) {
  return (
    <div style={{ width: 380, flexShrink: 0, background: '#0e1113', color: D.ink,
      padding: '40px 38px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Mark size={26} /><span style={{ fontSize: 16.5, fontWeight: 700 }}>Health Tracer</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.2, marginBottom: 16 }}>
          Один коуч вместо десяти приложений.</div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: D.mut }}>
          Несколько вопросов — и я соберу твой первый план. Дальше будем менять его вместе:
          я предлагаю, ты решаешь.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ONB_STEPS.map((s, i) => {
          const done = i < active, cur = i === active;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: done ? M.green : cur ? 'transparent' : 'rgba(255,255,255,0.05)',
                border: cur ? `2px solid ${M.green}` : 'none' }}>
                {done ? <Icon name="checkSm" size={13} stroke="#04130c" sw={2.6} />
                  : <span style={{ fontSize: 12, fontWeight: 700, color: cur ? M.green : D.mut2 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 14, fontWeight: cur ? 700 : 500,
                color: done || cur ? D.ink : D.mut2 }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalOption({ icon, color, title, sub, sel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14,
      cursor: 'pointer', background: sel ? `${color}12` : '#fff',
      border: `1.5px solid ${sel ? color : L.line2}` }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: `${color}1f` }}>
        <Icon name={icon} size={22} stroke={color} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: L.ink }}>{title}</div>
        <div style={{ fontSize: 13, color: L.mut, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: sel ? 'none' : `2px solid ${L.line2}`, background: sel ? color : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {sel && <Icon name="checkSm" size={13} stroke="#04130c" sw={2.6} />}</div>
    </div>
  );
}

function OnboardingScreen({ step = 'goal' }) {
  const activeIdx = step === 'welcome' ? 0 : step === 'done' ? 4 : 1;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', fontFamily: FONT, background: L.bg }}>
      <OnbPanel active={activeIdx} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 60px' }}>
          <div style={{ width: '100%', maxWidth: 540 }}>
            {step === 'welcome' && (
              <div>
                <Avatar who="coach" size={54} />
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: L.ink, margin: '22px 0 12px' }}>
                  Привет! Будем знакомы.</div>
                <div style={{ fontSize: 15.5, color: L.mut, lineHeight: 1.6, marginBottom: 26 }}>
                  Я твой коуч по самочувствию — помогу с тренировками, питанием, сном и привычками.
                  Это поддержка по образу жизни, без медицинских диагнозов. Как тебя зовут?</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                  color: L.mut2, marginBottom: 8 }}>Имя</div>
                <div style={{ padding: '14px 16px', borderRadius: 13, border: `1.5px solid ${L.ink}`,
                  fontSize: 15.5, color: L.ink, fontWeight: 500 }}>Алина<span style={{
                    display: 'inline-block', width: 1.5, height: 18, background: L.ink, marginLeft: 1,
                    verticalAlign: 'middle' }} /></div>
              </div>
            )}
            {step === 'goal' && (
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Шаг 2 из 5</Eyebrow>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: L.ink, marginBottom: 6 }}>
                  Что для тебя сейчас главное?</div>
                <div style={{ fontSize: 14.5, color: L.mut, marginBottom: 22 }}>
                  Выбери одно — с этого соберём первую цель. Потом можно поменять.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <GoalOption icon="bolt" color={M.amber} title="Больше энергии"
                    sub="Меньше усталости днём, ровный тонус" sel />
                  <GoalOption icon="dumbbell" color={M.blue} title="Стать сильнее"
                    sub="Регулярные тренировки, прогресс в силе" />
                  <GoalOption icon="heart" color={M.green} title="Мягко привести форму"
                    sub="Без жёстких диет и насилия над собой" />
                  <GoalOption icon="moon" color={M.indigo} title="Сон и спокойствие"
                    sub="Лучше высыпаться, меньше стресса" />
                </div>
              </div>
            )}
            {step === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 22px',
                  background: M.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={32} stroke="#04130c" sw={2.4} /></div>
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.6, color: L.ink, marginBottom: 10 }}>
                  Первая цель готова</div>
                <div style={{ fontSize: 15, color: L.mut, lineHeight: 1.6, marginBottom: 24 }}>
                  Я собрал стартовый план под цель «больше энергии». Загляни в «Сегодня» — там уже
                  есть первый шаг.</div>
                <Card pad={18} style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Icon name="star" size={19} stroke={M.amber} fill={M.amber} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: L.ink }}>Больше энергии днём</span>
                  </div>
                  <div style={{ fontSize: 13, color: L.mut, marginTop: 8 }}>
                    3 тренировки · белок 100 г · сон 7+ ч</div>
                </Card>
              </div>
            )}
          </div>
        </div>
        {/* footer nav */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${L.line}`, padding: '16px 60px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Btn kind="quiet">{step === 'welcome' ? '' : 'Назад'}</Btn>
          <div style={{ display: 'flex', gap: 6 }}>
            {ONB_STEPS.map((_, i) => <div key={i} style={{ width: i === activeIdx ? 22 : 7, height: 7,
              borderRadius: 4, background: i === activeIdx ? L.ink : L.line2, transition: 'all .2s' }} />)}
          </div>
          <Btn kind={step === 'done' ? 'accept' : 'primary'} icon={step === 'done' ? 'arrow' : undefined}>
            {step === 'done' ? 'В приложение' : 'Далее'}</Btn>
        </div>
      </div>
    </div>
  );
}

// standalone consent screen for medical/lab documents
function ConsentScreen() {
  const points = [
    ['shield', 'Только как контекст образа жизни', 'Данные помогают точнее подбирать тренировки, питание и восстановление — не для диагнозов или лечения.'],
    ['lock', 'Видно только вам', 'Документы приватны. Коуч использует их в рекомендациях, но не показывает третьим лицам.'],
    ['x', 'Отзывается в один тап', 'Согласие можно отключить, а файлы удалить в любой момент в профиле.'],
  ];
  return (
    <div style={{ width: '100%', height: '100%', fontFamily: FONT, background: L.panel,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Card pad={0} style={{ width: 520, overflow: 'hidden' }}>
        <div style={{ padding: '28px 30px 22px', borderBottom: `1px solid ${L.line}` }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: M.amberDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Icon name="doc" size={24} stroke={M.amber} /></div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: L.ink, marginBottom: 8 }}>
            Загрузить документ о здоровье</div>
          <div style={{ fontSize: 14.5, color: L.mut, lineHeight: 1.55 }}>
            Прежде чем продолжить — как мы обращаемся с этими данными. Пожалуйста, подтвердите согласие.</div>
        </div>
        <div style={{ padding: '22px 30px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {points.map(([ic, t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: L.panel2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={ic} size={17} stroke={L.ink2} /></div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: L.ink, marginBottom: 3 }}>{t}</div>
                  <div style={{ fontSize: 13, color: L.mut, lineHeight: 1.5 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderRadius: 12,
            background: L.panel, margin: '22px 0 18px' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: M.green, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="checkSm" size={13} stroke="#04130c" sw={2.6} /></div>
            <span style={{ fontSize: 13.5, color: L.ink2, lineHeight: 1.4 }}>
              Я согласна на использование данных как контекста для рекомендаций по образу жизни.</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="accept" full>Согласиться и продолжить</Btn>
            <Btn kind="ghost">Не сейчас</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { OnboardingScreen, ConsentScreen });
