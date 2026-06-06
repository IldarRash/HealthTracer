/* paywall.jsx — Free vs Pro comparison + limit-reached upsell. Soft, non-pushy. */

function FeatureRow({ children, on = true, dark, pro }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '9px 0' }}>
      <div style={{ width: 19, height: 19, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: on ? (pro ? M.green : (dark ? 'rgba(255,255,255,0.1)' : L.panel2)) : 'transparent' }}>
        {on ? <Icon name="checkSm" size={12} stroke={pro ? '#04130c' : (dark ? D.ink : L.ink2)} sw={2.4} />
            : <Icon name="x" size={12} stroke={dark ? D.mut2 : L.mut2} sw={2} />}
      </div>
      <span style={{ fontSize: 13.5, lineHeight: 1.4, color: on ? (dark ? D.ink2 : L.ink2) : (dark ? D.mut2 : L.mut2) }}>
        {children}</span>
    </div>
  );
}

function PricingScreen() {
  return (
    <div style={{ width: '100%', height: '100%', fontFamily: FONT, background: L.panel,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 760 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Eyebrow style={{ marginBottom: 10 }}>Подписка</Eyebrow>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: L.ink, marginBottom: 8 }}>
            Свой темп — бесплатно или глубже с Pro</div>
          <div style={{ fontSize: 15, color: L.mut }}>Отмена в любой момент. Без давления и обязательств.</div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
          {/* Free */}
          <Card pad={26} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: L.ink }}>Бесплатно</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '12px 0 4px' }}>
              <span style={{ fontSize: 34, fontWeight: 700, color: L.ink, letterSpacing: -1 }}>0 ₽</span>
              <span style={{ fontSize: 14, color: L.mut }}>навсегда</span>
            </div>
            <div style={{ fontSize: 13, color: L.mut, marginBottom: 18 }}>Чтобы начать и попробовать</div>
            <div style={{ flex: 1 }}>
              <FeatureRow>10 сообщений коучу в день</FeatureRow>
              <FeatureRow>План на сегодня и привычки</FeatureRow>
              <FeatureRow>Недельные планы (просмотр)</FeatureRow>
              <FeatureRow>Базовая динамика недели</FeatureRow>
              <FeatureRow on={false}>Фото-разбор еды и тренировок</FeatureRow>
              <FeatureRow on={false}>Глубокие тренды и документы</FeatureRow>
            </div>
            <Btn kind="ghost" full style={{ marginTop: 18 }}>Текущий план</Btn>
          </Card>

          {/* Pro */}
          <div style={{ flex: 1, borderRadius: 16, background: '#0e1113', color: D.ink,
            padding: 26, display: 'flex', flexDirection: 'column', position: 'relative',
            border: `1px solid ${M.green}`, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ position: 'absolute', top: 18, right: 18 }}>
              <Chip tone="green">Популярно</Chip></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mark size={20} /><span style={{ fontSize: 16, fontWeight: 700 }}>Tracer Pro</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '12px 0 4px' }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>590 ₽</span>
              <span style={{ fontSize: 14, color: D.mut }}>/ месяц</span>
            </div>
            <div style={{ fontSize: 13, color: D.mut, marginBottom: 18 }}>Когда хочется идти глубже</div>
            <div style={{ flex: 1 }}>
              <FeatureRow dark pro>Безлимит сообщений коучу</FeatureRow>
              <FeatureRow dark pro>Фото-разбор еды и тренировок</FeatureRow>
              <FeatureRow dark pro>Глубокая динамика и тренды</FeatureRow>
              <FeatureRow dark pro>Приоритетные предложения коуча</FeatureRow>
              <FeatureRow dark pro>Документы и согласия</FeatureRow>
              <FeatureRow dark pro>Экспорт планов</FeatureRow>
            </div>
            <Btn kind="accept" full style={{ marginTop: 18 }}>Открыть Pro · 7 дней бесплатно</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitReachedScreen() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="limit">
        <UserMsg>Помоги собрать ужин из того, что есть в холодильнике</UserMsg>
        <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
          <Avatar who="coach" size={30} />
          <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', border: `1px solid ${L.line2}`,
            background: 'linear-gradient(180deg,#fbf8f3,#ffffff)' }}>
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: M.amberDim, display: 'flex',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bolt" size={17} stroke={M.amber} fill={M.amber} /></div>
                <span style={{ fontSize: 15, fontWeight: 700, color: L.ink }}>На сегодня сообщения закончились</span>
              </div>
              <div style={{ fontSize: 14, color: L.ink2, lineHeight: 1.55, marginBottom: 16 }}>
                Ты использовала все 10 сообщений на бесплатном плане. Они обновятся завтра утром —
                или открой Pro, чтобы общаться без лимита уже сейчас.</div>
              <div style={{ display: 'flex', gap: 9, marginBottom: 6 }}>
                {['Безлимит сообщений', 'Фото-разбор', 'Глубокие тренды'].map((t) => (
                  <div key={t} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px',
                    borderRadius: 11, border: `1px solid ${L.line}`, background: '#fff' }}>
                    <Icon name="checkSm" size={14} stroke={M.green} sw={2.4} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: L.ink2 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: `1px solid ${L.line}`,
              background: 'rgba(255,255,255,0.6)' }}>
              <Btn kind="primary" icon="star" style={{ flex: 1 }}>Открыть Pro · 7 дней бесплатно</Btn>
              <Btn kind="quiet">Подождать до завтра</Btn>
            </div>
          </div>
        </div>
      </ChatScreen>
    </AppShell>
  );
}

Object.assign(window, { PricingScreen, LimitReachedScreen, FeatureRow });
