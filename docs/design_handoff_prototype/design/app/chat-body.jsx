/* chat-body.jsx — chat scenario: user asks for a body estimate, coach asks for
   photos from several angles, then returns an approximate analysis and offers to
   save it into the profile. Reuses chat shell atoms from chat.jsx. */

// labelled photo thumbnail (hatched placeholder, like UserMsg photo)
function PhotoThumb({ label, w = 132, h = 168 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
      border: `1px solid ${L.line}`, position: 'relative',
      background: 'repeating-linear-gradient(135deg,#efe9e1,#efe9e1 9px,#e7ddcf 9px,#e7ddcf 18px)',
      display: 'flex', alignItems: 'flex-end', padding: 8 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="profile" size={40} stroke="#b9b0a0" sw={1.4} />
      </div>
      <span style={{ position: 'relative', fontFamily: MONO, fontSize: 10.5, color: '#8a8070',
        background: 'rgba(255,255,255,0.85)', padding: '2px 7px', borderRadius: 5 }}>{label}</span>
    </div>
  );
}

// user message carrying a strip of angle photos
function PhotoStripMsg({ caption }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 22 }}>
      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 9 }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <PhotoThumb label="спереди.jpg" />
          <PhotoThumb label="сбоку.jpg" />
          <PhotoThumb label="сзади.jpg" />
        </div>
        {caption && <div style={{ background: L.bubble, borderRadius: '18px 18px 4px 18px',
          padding: '11px 16px', fontSize: 15, lineHeight: 1.55, color: L.ink }}>{caption}</div>}
      </div>
    </div>
  );
}

// how-to-photograph guidance card (coach asks for photos)
function PhotoGuide({ onShoot, onUpload }) {
  const shots = [
    { ic: 'profile', t: 'Спереди', d: 'руки чуть в стороны' },
    { ic: 'profile', t: 'Сбоку', d: 'профиль, спина прямая' },
    { ic: 'profile', t: 'Сзади', d: 'та же поза, со спины' },
  ];
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${L.line2}`, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
        borderBottom: `1px solid ${L.line}`, background: L.panel }}>
        <Icon name="camera" size={17} stroke={M.green} />
        <span style={{ fontSize: 14, fontWeight: 700, color: L.ink, flex: 1 }}>Нужно 3 фото с разных ракурсов</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {shots.map((s, i) => (
            <div key={s.t} style={{ flex: 1, padding: '14px 12px', borderRadius: 13, textAlign: 'center',
              background: L.panel, border: `1px solid ${L.line}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, margin: '0 auto 10px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1px solid ${L.line2}`,
                position: 'relative' }}>
                <Icon name="profile" size={20} stroke={L.ink2} />
                <span style={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: '50%',
                  background: M.green, color: '#04130c', fontSize: 11, fontWeight: 800, display: 'flex',
                  alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: L.ink }}>{s.t}</div>
              <div style={{ fontSize: 11.5, color: L.mut, marginTop: 3, lineHeight: 1.35 }}>{s.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {['Облегающая одежда или нижнее бельё — так оценка точнее',
            'Хороший ровный свет, нейтральный фон',
            'Телефон на уровне пояса, целиком в кадре'].map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="checkSm" size={15} stroke={M.green} sw={2.4} />
              <span style={{ fontSize: 13, color: L.ink2 }}>{t}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '11px 14px', marginTop: 14, borderRadius: 11,
          background: 'rgba(58,141,255,0.07)', border: `1px solid rgba(58,141,255,0.2)` }}>
          <Icon name="lock" size={14} stroke={M.blue} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: L.mut, lineHeight: 1.5 }}>
            Фото используются только для оценки и хранятся приватно. Их можно удалить в любой момент — в профиль
            попадут лишь цифры, не снимки.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn kind="accept" icon="camera" onClick={onShoot}>Сделать фото</Btn>
          <Btn kind="ghost" icon="clip" onClick={onUpload}>Загрузить из галереи</Btn>
        </div>
      </div>
    </div>
  );
}

// 1 — user asks, coach requests photos
function ChatBodyAsk() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg>Можешь оценить моё телосложение? Хочу узнать примерный процент жира и какие мышцы отстают.</UserMsg>
        <CoachMsg>
          <Para>Конечно. По фото я могу прикинуть процент жира, общий мышечный тонус и какие группы стоит
            подтянуть. Это оценка на глаз, не замер — но как ориентир работает хорошо.</Para>
          <Para style={{ marginBottom: 14 }}>Пришлите, пожалуйста, три снимка с разных ракурсов:</Para>
          <PhotoGuide />
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

// 2 — photos uploaded, coach analysing
function ChatBodyUpload() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <PhotoStripMsg caption="Вот, со всех сторон" />
        <ThinkingBlock label="Коуч анализирует фото · оцениваю состав и мышцы…" />
      </ChatScreen>
    </AppShell>
  );
}

// 3 — result + save to profile
function ChatBodyResult({ saved = false }) {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <PhotoStripMsg />
        <CoachMsg>
          <Para style={{ marginBottom: 14 }}>Готово. Вот что я вижу по снимкам — телосложение спортивное,
            ноги и кор заметно сильнее верха. Жир в норме и, судя по динамике, снижается.</Para>
          <BodyAnalysisCard saved={saved} />
          {!saved && <Para style={{ marginTop: 14, marginBottom: 0, fontSize: 13.5, color: L.mut }}>
            Если сохраню — добавлю это в профиль и учту при планировании тренировок: чуть больше работы на грудь,
            руки и спину.</Para>}
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

Object.assign(window, { ChatBodyAsk, ChatBodyUpload, ChatBodyResult, PhotoGuide, PhotoStripMsg, PhotoThumb });
