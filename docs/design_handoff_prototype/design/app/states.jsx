/* states.jsx — shared scaffolding for the data screens.
   Unified light interface: loading skeletons, full-screen error / empty,
   banners, revision facts, coach notes, history, expanders are LIGHT (they're
   interface). The metric module (ConsentSignals) and media tiles (MediaCard)
   stay DARK — they're "instrument" inlays floating on the light page.
   Exports to window at the bottom. */

// one-time keyframes for shimmer + soft entrance
(function injectAnim() {
  if (document.getElementById('ht-anim')) return;
  const s = document.createElement('style');
  s.id = 'ht-anim';
  s.textContent = `
    @keyframes htShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    @keyframes htSpin { to { transform: rotate(360deg) } }
    @keyframes htPulse { 0%,100%{opacity:.55} 50%{opacity:1} }
    @keyframes htBob { 0%,100%{ transform: translateY(-7px) scale(1) } 50%{ transform: translateY(7px) scale(1.04) } }
    @keyframes htSweep { 0%{ transform: translateX(-120%) } 100%{ transform: translateX(420%) } }
    @keyframes htScrub { 0%{ width:8% } 100%{ width:92% } }
  `;
  document.head.appendChild(s);
})();

const SHIMMER = {
  background: `linear-gradient(90deg, rgba(0,0,0,0.045) 25%, rgba(0,0,0,0.085) 38%, rgba(0,0,0,0.045) 60%)`,
  backgroundSize: '200% 100%',
  animation: 'htShimmer 1.5s linear infinite',
};

// ── Skeleton block ──────────────────────────────────────────────
function Sk({ w = '100%', h = 14, r = 7, style }) {
  return <div style={{ width: w, height: h, borderRadius: r, ...SHIMMER, ...style }} />;
}
function SkLines({ n = 3, gap = 9, last = '60%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: n }).map((_, i) =>
        <Sk key={i} h={11} w={i === n - 1 ? last : '100%'} />)}
    </div>
  );
}
function SkCard({ h = 150, head = true, pad = 18 }) {
  return (
    <Card pad={pad}>
      {head && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Sk w={26} h={26} r={8} /><Sk w={130} h={12} /></div>}
      <Sk h={h} r={12} />
    </Card>
  );
}

// soft inline spinner
function Spinner({ size = 18, color = M.green, sw = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'htSpin 0.9s linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={sw} />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

// ── Full-screen LOADING ─────────────────────────────────────────
function LoadingScreen({ label = 'Загружаем обзор', layout = 'longevity' }) {
  return (
    <div style={{ padding: '20px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18, color: L.mut }}>
        <Spinner /><span style={{ fontSize: 13.5, animation: 'htPulse 1.6s ease-in-out infinite' }}>{label}…</span>
      </div>
      {layout === 'longevity' ? (
        <>
          <SkCard h={120} />
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ flex: 1 }}><SkCard h={70} /></div>)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <div style={{ flex: '1.3 1 0' }}><SkCard h={130} /></div>
            <div style={{ flex: '1 1 0' }}><SkCard h={130} /></div>
          </div>
        </>
      ) : (
        <>
          <SkCard h={90} />
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <div style={{ flex: '1.4 1 0' }}><SkCard h={150} /></div>
            <div style={{ flex: '1 1 0' }}><SkCard h={150} /></div>
          </div>
          <div style={{ marginTop: 16 }}><SkCard h={160} /></div>
        </>
      )}
    </div>
  );
}

// ── Full-screen ERROR ───────────────────────────────────────────
function ErrorScreen({ title = 'Обзор недоступен', msg, retry = 'Повторить', secondary }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 20px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: M.redDim,
          border: `1px solid rgba(240,80,106,0.25)` }}>
          <Icon name="info" size={28} stroke={M.red} sw={1.8} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: L.ink, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ fontSize: 14, color: L.mut, marginTop: 9, lineHeight: 1.5 }}>
          {msg || 'Не удалось загрузить данные. Это на нашей стороне — попробуйте обновить через минуту.'}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22 }}>
          <Btn kind="primary" icon="spark">{retry}</Btn>
          {secondary && <Btn kind="ghost" icon="chat">{secondary}</Btn>}
        </div>
      </div>
    </div>
  );
}

// ── PARTIAL error banner ────────────────────────────────────────
function PartialBanner({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16,
      borderRadius: 13, background: M.amberDim, border: `1px solid rgba(245,165,36,0.3)` }}>
      <Icon name="info" size={18} stroke={M.amber} />
      <span style={{ flex: 1, fontSize: 13.5, color: L.ink2 }}>
        {children || 'Некоторые секции не обновились. Показываем то, что удалось загрузить.'}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#b5780f', whiteSpace: 'nowrap', cursor: 'pointer' }}>
        Обновить →</span>
    </div>
  );
}

// section that failed inside an otherwise-live screen
function SectionError({ label = 'Не удалось загрузить', h = 90 }) {
  return (
    <div style={{ height: h, borderRadius: 12, border: `1px dashed ${L.line2}`,
      background: 'rgba(240,80,106,0.05)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Icon name="info" size={18} stroke={M.red} />
      <span style={{ fontSize: 12.5, color: L.mut }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#b5780f', cursor: 'pointer' }}>Обновить →</span>
    </div>
  );
}

// ── Persistent "change via chat" hint ───────────────────────────
function ChangeBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', marginBottom: 16,
      borderRadius: 13, background: 'rgba(123,123,255,0.08)', border: `1px solid rgba(123,123,255,0.28)` }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(123,123,255,0.16)' }}>
        <Icon name="lock" size={15} stroke="#5b5bd6" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>Это просмотр плана. </span>
        <span style={{ fontSize: 13.5, color: L.mut }}>Изменения вносит коуч — расскажите ему в чате, что хотите поменять.</span>
      </div>
      <Btn kind="soft" size="sm" icon="chat">Открыть чат</Btn>
    </div>
  );
}

// ── Daily-execution callout (→ Today) ───────────────────────────
function DailyExecCard({ icon, color, title, text, cta = 'Перейти в «Сегодня»' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: 16, borderRadius: 16,
      background: `${color}12`, border: `1px solid ${color}33` }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: `${color}22` }}>
        <Icon name={icon} size={20} stroke={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: L.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: L.mut, marginTop: 2, lineHeight: 1.4 }}>{text}</div>
      </div>
      <Btn kind="soft" size="sm" icon="today">{cta}</Btn>
    </div>
  );
}

// ── Revision facts ("why this revision") ────────────────────────
function RevisionFacts({ rev = 'v8', when = 'сегодня, 09:14', source = 'Принято в чате', why, accent = M.blue }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden', borderTop: `2px solid ${accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
        borderBottom: `1px solid ${L.line}` }}>
        <Icon name="info" size={16} stroke={accent} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: L.ink, flex: 1 }}>Почему именно эта версия</span>
        <Chip tone="blue" style={{ padding: '2px 9px', fontSize: 11.5 }}>{rev} · активная</Chip>
      </div>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13.5, color: L.ink2, lineHeight: 1.55 }}>{why}</div>
        <div style={{ display: 'flex', gap: 26, marginTop: 15 }}>
          {[['Обновлено', when], ['Источник', source], ['Версия', rev]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                color: L.mut2 }}>{k}</div>
              <div style={{ fontSize: 13, color: L.ink2, marginTop: 4, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Coach notes ─────────────────────────────────────────────────
function CoachNotes({ children }) {
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Avatar who="coach" size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: L.mut, marginBottom: 5 }}>Заметка коуча</div>
          <div style={{ fontSize: 13.5, color: L.ink2, lineHeight: 1.55 }}>{children}</div>
        </div>
      </div>
    </Card>
  );
}

// ── Medical disclaimer line ─────────────────────────────────────
function MedicalNote({ children, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
      <Icon name="info" size={13} stroke={dark ? D.mut2 : L.mut2} />
      <span style={{ fontSize: 11.5, color: dark ? D.mut2 : L.mut2, lineHeight: 1.4 }}>
        {children || 'Это не клиническая оценка — только ваши отметки самочувствия.'}</span>
    </div>
  );
}

// ── Collapsible revision history ────────────────────────────────
function RevisionHistory({ open = false, rows }) {
  const data = rows || [
    { rev: 'v8', when: 'Сегодня', note: 'Силовая перенесена с чт на пт', active: true },
    { rev: 'v7', when: '28 мая', note: 'Добавлен день мобилити' },
    { rev: 'v6', when: '14 мая', note: 'Снижен объём после недели разъездов' },
    { rev: 'v5', when: '2 мая', note: 'Старт программы' },
  ];
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div className="htRow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
        cursor: 'pointer', borderBottom: open ? `1px solid ${L.line}` : 'none' }}>
        <Icon name="doc" size={16} stroke={L.mut} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: L.ink, flex: 1 }}>История версий плана</span>
        <span style={{ fontSize: 12.5, color: L.mut2 }}>{data.length} версии</span>
        <Icon name={open ? 'chevD' : 'chevR'} size={16} stroke={L.mut} />
      </div>
      {open && (
        <div>
          {data.map((r, i) => (
            <div key={r.rev} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
              borderBottom: i === data.length - 1 ? 'none' : `1px solid ${L.line}`,
              background: r.active ? 'rgba(58,141,255,0.06)' : 'transparent' }}>
              <Chip tone={r.active ? 'blue' : 'neutral'}
                style={{ padding: '2px 9px', minWidth: 34, justifyContent: 'center' }}>{r.rev}</Chip>
              <span style={{ flex: 1, fontSize: 13.5, color: r.active ? L.ink : L.ink2 }}>{r.note}</span>
              {r.active && <Chip tone="green" style={{ padding: '2px 8px', fontSize: 11 }}>активная</Chip>}
              <span style={{ fontSize: 12.5, color: L.mut2, width: 64, textAlign: 'right' }}>{r.when}</span>
            </div>
          ))}
          <div style={{ padding: '12px 18px', fontSize: 12, color: L.mut2, lineHeight: 1.4 }}>
            Прошлые тренировки остаются привязаны к той версии плана, что была активна в тот момент.</div>
        </div>
      )}
    </Card>
  );
}

// ── Generic collapsible ─────────────────────────────────────────
function Expander({ icon = 'spark', title, hint, open = false, children }) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div className="htRow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer',
        borderBottom: open ? `1px solid ${L.line}` : 'none' }}>
        <Icon name={icon} size={16} stroke={L.mut} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: L.ink, flex: 1 }}>{title}</span>
        {hint && <span style={{ fontSize: 12, color: L.mut2 }}>{hint}</span>}
        <Icon name={open ? 'chevD' : 'chevR'} size={16} stroke={L.mut} />
      </div>
      {open && <div style={{ padding: 18 }}>{children}</div>}
    </Card>
  );
}

// ── Consent / wellness-signals — DARK instrument inlay (3 states) ─
// state: 'data' | 'connect' | 'revoked'
function ConsentSignals({ state = 'data' }) {
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'rgba(58,141,255,0.18)' }}>
        <Icon name="shield" size={15} stroke={M.blue} /></div>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: D.ink, flex: 1 }}>Wellness-сигналы устройств</span>
      <Chip dark style={{ padding: '2px 9px', fontSize: 11 }}>
        <Icon name="shield" size={11} stroke={D.mut} />по согласию</Chip>
    </div>
  );
  if (state === 'connect' || state === 'revoked') {
    const revoked = state === 'revoked';
    return (
      <Card dark pad={18}>
        {head}
        <div style={{ borderRadius: 12, border: `1px dashed ${D.line2}`, padding: '20px 18px', textAlign: 'center' }}>
          <Icon name={revoked ? 'lock' : 'heart'} size={24} stroke={revoked ? M.amber : M.blue}
            style={{ margin: '0 auto 10px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>
            {revoked ? 'Согласие отозвано' : 'Подключите источники данных'}</div>
          <div style={{ fontSize: 12.5, color: D.mut, marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: '6px auto 0' }}>
            {revoked
              ? 'Вы отозвали доступ к сигналам с устройств. Их можно вернуть в Профиле в любой момент.'
              : 'Подключите часы или приложение здоровья, чтобы видеть тренды сна, пульса и активности.'}</div>
          <Btn kind="soft" dark size="sm" icon="profile" style={{ marginTop: 14 }}>
            {revoked ? 'Управлять согласием' : 'Подключить в Профиле'}</Btn>
        </div>
      </Card>
    );
  }
  const sig = [
    { ic: 'moon', c: M.indigo, t: 'Сон', v: '6 ч 48 м', s: 'в среднем' },
    { ic: 'heart', c: M.red, t: 'Пульс покоя', v: '58', s: 'уд/мин' },
    { ic: 'bolt', c: M.amber, t: 'Шаги', v: '8 240', s: 'в среднем' },
  ];
  return (
    <Card dark pad={18}>
      {head}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {sig.map((x) => (
          <div key={x.t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: `${x.c}26` }}>
              <Icon name={x.ic} size={15} stroke={x.c} /></div>
            <span style={{ flex: 1, fontSize: 13.5, color: D.ink2 }}>{x.t}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: D.ink, fontVariantNumeric: 'tabular-nums' }}>{x.v}</span>
            <span style={{ fontSize: 12, color: D.mut2, width: 56 }}>{x.s}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <MedicalNote dark>Только метаданные с устройств · не клиническая оценка.</MedicalNote>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: M.blue, whiteSpace: 'nowrap', cursor: 'pointer' }}>
          В Профиль →</span>
      </div>
    </Card>
  );
}

// ── Media card — exercise video / recipe (DARK media tile) ──────
function PlayBadge({ size = 46, color = '#fff' }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(8,10,11,0.55)',
      backdropFilter: 'blur(2px)', border: '1.5px solid rgba(255,255,255,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill={color}
        style={{ marginLeft: size * 0.05 }}><path d="M7 4.5v15l13-7.5z" /></svg>
    </div>
  );
}

function MediaCard({ kind = 'exercise', color = M.blue, icon = 'dumbbell', title, meta, duration,
  tags, poster = 0, done }) {
  const grads = [
    `linear-gradient(135deg, #1c2733, #0f1518)`,
    `linear-gradient(135deg, #25201c, #14110e)`,
    `linear-gradient(135deg, #1b2620, #0f1613)`,
    `linear-gradient(135deg, #221c2b, #120f17)`,
    `linear-gradient(135deg, #2a1c20, #160e10)`,
    `linear-gradient(135deg, #1c2330, #0e1218)`,
  ];
  return (
    <div className="htRow" style={{ borderRadius: 15, overflow: 'hidden', background: D.panel,
      border: `1px solid ${D.line}`, cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(6,8,9,0.18), 0 8px 22px rgba(6,8,9,0.16)' }}>
      <div style={{ position: 'relative', height: 132, background: grads[poster % grads.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={48} stroke={color} sw={1.4} style={{ opacity: 0.30 }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PlayBadge />
        </div>
        {duration && <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 8px',
          borderRadius: 7, background: 'rgba(8,10,11,0.6)', fontSize: 11.5, fontWeight: 600,
          color: '#fff', letterSpacing: 0.2 }}>{duration}</div>}
        {done && <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <Chip tone="green" style={{ padding: '2px 8px', fontSize: 11 }}>
            <Icon name="checkSm" size={11} stroke={M.green} sw={2.6} />готово</Chip></div>}
      </div>
      <div style={{ padding: '13px 15px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: D.ink, lineHeight: 1.3 }}>{title}</div>
        {meta && <div style={{ fontSize: 12.5, color: D.mut, marginTop: 4 }}>{meta}</div>}
        {tags && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
          {tags.map((t, i) => <Chip key={i} dark style={{ padding: '3px 8px', fontSize: 11 }}>{t}</Chip>)}
        </div>}
      </div>
    </div>
  );
}

Object.assign(window, {
  SHIMMER, Sk, SkLines, SkCard, Spinner, LoadingScreen, ErrorScreen, PartialBanner, SectionError,
  ChangeBanner, DailyExecCard, RevisionFacts, CoachNotes, MedicalNote, RevisionHistory, Expander,
  ConsentSignals, MediaCard, PlayBadge,
});
