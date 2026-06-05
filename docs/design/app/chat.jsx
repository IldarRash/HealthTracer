/* chat.jsx — light ChatGPT-style chat: the main screen + all states. */

// message text block from coach
function Para({ children, style }) {
  return <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.6, color: L.ink2, ...style }}>{children}</p>;
}

function UserMsg({ children, photo }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
      <div style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {photo && (
          <div style={{ width: 190, height: 132, borderRadius: 16, overflow: 'hidden',
            border: `1px solid ${L.line}`, background:
            'repeating-linear-gradient(135deg,#efe9e1,#efe9e1 9px,#e7ddcf 9px,#e7ddcf 18px)',
            display: 'flex', alignItems: 'flex-end', padding: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: '#8a8070',
              background: 'rgba(255,255,255,0.8)', padding: '2px 6px', borderRadius: 5 }}>фото обеда.jpg</span>
          </div>
        )}
        {children && <div style={{ background: L.bubble, borderRadius: '18px 18px 4px 18px',
          padding: '11px 16px', fontSize: 15, lineHeight: 1.55, color: L.ink }}>{children}</div>}
      </div>
    </div>
  );
}

function CoachMsg({ children }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      <Avatar who="coach" size={30} />
      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>{children}</div>
    </div>
  );
}

// composer
function Composer({ variant = 'default' }) {
  const disabled = variant === 'limit';
  return (
    <div style={{ padding: '14px 0 18px' }}>
      {variant === 'photo' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '6px 8px 6px 6px',
          marginBottom: 10, borderRadius: 12, border: `1px solid ${L.line}`, background: '#fff' }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background:
            'repeating-linear-gradient(135deg,#efe9e1,#efe9e1 7px,#e7ddcf 7px,#e7ddcf 14px)' }} />
          <span style={{ fontSize: 13, color: L.ink2, fontWeight: 500 }}>фото обеда.jpg</span>
          <Icon name="x" size={15} stroke={L.mut2} style={{ marginLeft: 4, marginRight: 4 }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 10px 10px 16px',
        borderRadius: 26, border: `1px solid ${disabled ? L.line : L.line2}`,
        background: disabled ? L.panel : '#fff', boxShadow: disabled ? 'none' : '0 2px 14px rgba(0,0,0,0.04)' }}>
        <Icon name="clip" size={21} stroke={L.mut} style={{ marginBottom: 7 }} />
        <Icon name="camera" size={21} stroke={L.mut} style={{ marginBottom: 7 }} />
        <div style={{ flex: 1, fontSize: 15, color: disabled ? L.mut2 : L.mut, padding: '9px 2px' }}>
          {disabled ? 'Лимит сообщений на сегодня исчерпан' : 'Напишите коучу или прикрепите фото…'}
        </div>
        <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: disabled ? L.line2 : L.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="send" size={18} stroke="#fff" sw={2} />
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11.5, color: L.mut2, marginTop: 9 }}>
        Коуч предлагает — решение всегда за вами. Это поддержка по образу жизни, не медицинская консультация.
      </div>
    </div>
  );
}

// shell for a chat screen: scroll column + composer
function ChatScreen({ children, composer = 'default', scrollPad = 28 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${L.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: L.ink }}>Коуч</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: M.green }} />
          <span style={{ fontSize: 12.5, color: L.mut }}>на связи</span>
        </div>
        <Chip tone="neutral">Контекст: цель «энергия»</Chip>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: `${scrollPad}px 28px 8px`, height: '100%' }}>
          {children}
        </div>
      </div>
      <div style={{ flexShrink: 0, borderTop: `1px solid ${L.line}`, background: L.bg }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px' }}>
          <Composer variant={composer} />
        </div>
      </div>
    </div>
  );
}

// thinking shimmer
function ThinkingBlock({ label = 'Коуч думает…' }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
      <Avatar who="coach" size={30} />
      <div style={{ paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <span style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%',
              background: L.mut2, opacity: i === 1 ? 1 : 0.4 }} />)}
          </span>
          <span style={{ fontSize: 13.5, color: L.mut, fontWeight: 500 }}>{label}</span>
        </div>
        {[92, 78].map((w, i) => <div key={i} style={{ height: 11, width: `${w}%`, borderRadius: 6,
          marginBottom: 8, background: 'linear-gradient(90deg,#efefec,#f7f7f5,#efefec)' }} />)}
      </div>
    </div>
  );
}

// ── Screen factories ────────────────────────────────────────────

function ChatEmpty() {
  const chips = ['Что съесть перед тренировкой?', 'Сдвинь силовую на завтра',
    'Я плохо спал — что делать?', 'Загрузить анализы'];
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default" scrollPad={0}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 40 }}>
          <Avatar who="coach" size={56} />
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.6, color: L.ink, margin: '20px 0 8px' }}>
            С чего начнём, Алина?
          </div>
          <div style={{ fontSize: 15, color: L.mut, maxWidth: 420, lineHeight: 1.55 }}>
            Расскажите, как прошёл день, что съели или как спали. Я предложу следующий шаг —
            а применять или нет, решаете вы.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
            maxWidth: 480, marginTop: 28 }}>
            {chips.map((c) => (
              <span key={c} style={{ padding: '10px 16px', borderRadius: 999, border: `1px solid ${L.line2}`,
                background: '#fff', fontSize: 13.5, fontWeight: 500, color: L.ink2, cursor: 'pointer' }}>{c}</span>
            ))}
          </div>
        </div>
      </ChatScreen>
    </AppShell>
  );
}

function ChatDialog({ proposalVariant = 'A', proposalState = 'proposed' }) {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg photo>Обед сегодня. Нормально под завтрашнюю силовую?</UserMsg>
        <CoachMsg>
          <Para>Баланс хороший — белок и овощи на месте. Углеводов чуть меньше, чем
            пригодится перед силовой завтра. Можно добавить простой источник энергии утром:</Para>
          <ProposalCard
            variant={proposalVariant}
            state={proposalState}
            domain="nutrition"
            title="Добавить перекус перед тренировкой"
            why="Завтра силовая в 8:30. Лёгкие углеводы за час до неё помогут держать темп и не «сдуться» к концу."
            changes={[
              { from: { k: 'Завтра · перекус', v: 'Не запланирован' },
                to: { k: 'Завтра · 7:30', v: 'Банан + овсянка, 30 г' } },
            ]}
          />
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

function ChatThinking() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="photo">
        <UserMsg photo>Вот ужин</UserMsg>
        <ThinkingBlock label="Коуч анализирует фото…" />
      </ChatScreen>
    </AppShell>
  );
}

function ChatError() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg>Перепланируй мне неделю под поездку</UserMsg>
        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <Avatar who="coach" size={30} />
          <div style={{ flex: 1, borderRadius: 14, border: `1px solid rgba(240,80,106,0.35)`,
            background: M.redDim, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <Icon name="info" size={17} stroke={M.red} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#b32a45' }}>Не получилось ответить</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: L.ink2, marginBottom: 12 }}>
              Соединение прервалось, пока я готовил предложение. Ваше сообщение сохранено — можно повторить.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn kind="soft" icon="arrow" size="sm">Повторить</Btn>
              <Btn kind="quiet" size="sm">Изменить запрос</Btn>
            </div>
          </div>
        </div>
      </ChatScreen>
    </AppShell>
  );
}

function ChatCrisis() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg>Последние дни всё валится из рук, нет сил и смысла что-то делать</UserMsg>
        <CoachMsg>
          <Para style={{ marginBottom: 14 }}>Спасибо, что написали это. Звучит, будто сейчас правда тяжело —
            и важнее всего, как вы себя чувствуете, а не план тренировок.</Para>
          <div style={{ borderRadius: 16, border: `1px solid ${L.line2}`, overflow: 'hidden',
            background: 'linear-gradient(180deg,#fbf7f1,#ffffff)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px',
              borderBottom: `1px solid ${L.line}` }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#efe4d4',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="heart" size={17} stroke="#9a7b46" />
              </div>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: L.ink }}>Сделаем паузу вместе</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: L.ink2, marginBottom: 14 }}>
                Я рядом и могу помочь снизить нагрузку — сегодня без планов и галочек. Если хочется,
                можем просто поговорить или сделать одно очень маленькое доброе для себя действие.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Поставить неделю на «бережный режим»', 'Просто поговорить', 'Дыхание на 2 минуты'].map((t) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                    borderRadius: 11, border: `1px solid ${L.line}`, background: '#fff', cursor: 'pointer' }}>
                    <Icon name="chevR" size={15} stroke="#9a7b46" />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '14px 14px 4px', marginTop: 6,
                borderTop: `1px solid ${L.line}` }}>
                <Icon name="info" size={15} stroke={L.mut2} style={{ marginTop: 1 }} />
                <div style={{ fontSize: 12, lineHeight: 1.5, color: L.mut }}>
                  Если есть мысли причинить себе вред, пожалуйста, обратитесь к близкому человеку или
                  в местную службу поддержки. Я помогаю с самочувствием, но не заменяю специалиста.
                </div>
              </div>
            </div>
          </div>
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

Object.assign(window, { ChatEmpty, ChatDialog, ChatThinking, ChatError, ChatCrisis,
  ChatScreen, UserMsg, CoachMsg, Para, Composer, ThinkingBlock });
