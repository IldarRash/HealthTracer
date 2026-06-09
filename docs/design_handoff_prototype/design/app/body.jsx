/* body.jsx — body analysis: composition (% fat, muscle, water), a muscle
   strength map (front/back figures), trend, and the chat result card that
   writes the estimate into the profile. Muscle map is a dark "instrument". */

// strength tone → color
const ST = { strong: M.green, mid: M.amber, weak: M.red };
const ST_DIM = { strong: 'rgba(25,195,125,0.30)', mid: 'rgba(245,165,36,0.30)', weak: 'rgba(240,80,106,0.30)' };

// Alina's profile: legs/core strong, upper body lagging
const MUSCLES = {
  delts: 'mid', chest: 'weak', biceps: 'weak', forearms: 'weak', abs: 'strong', obliques: 'mid',
  quads: 'strong', shins: 'mid',
  traps: 'mid', reardelts: 'mid', lats: 'mid', triceps: 'weak', lowerback: 'mid', glutes: 'strong',
  hams: 'strong', calves: 'mid',
};

// one muscle blob
function Mz({ cx, cy, rx, ry, k, rot = 0 }) {
  const s = MUSCLES[k] || 'mid';
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
      fill={ST_DIM[s]} stroke={ST[s]} strokeWidth="1.4" />
  );
}

// stylised human figure with muscle overlay
function BodyFigure({ side = 'front', label }) {
  // base body color
  const base = 'rgba(255,255,255,0.05)';
  const bstroke = 'rgba(255,255,255,0.16)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width="170" height="380" viewBox="0 0 220 440">
        {/* base silhouette (shared, symmetric) */}
        <g fill={base} stroke={bstroke} strokeWidth="1.5">
          <ellipse cx="110" cy="40" rx="20" ry="23" />
          <rect x="100" y="60" width="20" height="16" rx="6" />
          {/* torso */}
          <path d="M70 86 Q110 74 150 86 L146 196 Q110 210 74 196 Z" />
          {/* arms */}
          <rect x="48" y="92" width="22" height="74" rx="11" />
          <rect x="150" y="92" width="22" height="74" rx="11" />
          <rect x="46" y="160" width="19" height="70" rx="9" />
          <rect x="155" y="160" width="19" height="70" rx="9" />
          {/* pelvis */}
          <path d="M74 192 L146 192 L140 226 Q110 236 80 226 Z" />
          {/* legs */}
          <rect x="80" y="222" width="27" height="98" rx="13" />
          <rect x="113" y="222" width="27" height="98" rx="13" />
          <rect x="84" y="312" width="21" height="92" rx="10" />
          <rect x="115" y="312" width="21" height="92" rx="10" />
        </g>

        {/* muscle overlay */}
        {side === 'front' ? (
          <g>
            <Mz cx="73" cy="98" rx="14" ry="12" k="delts" />
            <Mz cx="147" cy="98" rx="14" ry="12" k="delts" />
            <Mz cx="95" cy="116" rx="15" ry="13" k="chest" />
            <Mz cx="125" cy="116" rx="15" ry="13" k="chest" />
            <Mz cx="58" cy="124" rx="9" ry="20" k="biceps" />
            <Mz cx="162" cy="124" rx="9" ry="20" k="biceps" />
            <Mz cx="55" cy="192" rx="8" ry="24" k="forearms" />
            <Mz cx="165" cy="192" rx="8" ry="24" k="forearms" />
            <Mz cx="110" cy="158" rx="16" ry="30" k="abs" />
            <Mz cx="86" cy="160" rx="7" ry="24" k="obliques" />
            <Mz cx="134" cy="160" rx="7" ry="24" k="obliques" />
            <Mz cx="93" cy="262" rx="13" ry="38" k="quads" />
            <Mz cx="127" cy="262" rx="13" ry="38" k="quads" />
            <Mz cx="94" cy="356" rx="9" ry="32" k="shins" />
            <Mz cx="126" cy="356" rx="9" ry="32" k="shins" />
          </g>
        ) : (
          <g>
            <Mz cx="110" cy="92" rx="24" ry="14" k="traps" />
            <Mz cx="74" cy="100" rx="13" ry="11" k="reardelts" />
            <Mz cx="146" cy="100" rx="13" ry="11" k="reardelts" />
            <Mz cx="92" cy="140" rx="14" ry="26" k="lats" />
            <Mz cx="128" cy="140" rx="14" ry="26" k="lats" />
            <Mz cx="57" cy="124" rx="9" ry="20" k="triceps" />
            <Mz cx="163" cy="124" rx="9" ry="20" k="triceps" />
            <Mz cx="110" cy="182" rx="16" ry="16" k="lowerback" />
            <Mz cx="96" cy="216" rx="14" ry="15" k="glutes" />
            <Mz cx="124" cy="216" rx="14" ry="15" k="glutes" />
            <Mz cx="93" cy="266" rx="13" ry="34" k="hams" />
            <Mz cx="127" cy="266" rx="13" ry="34" k="hams" />
            <Mz cx="94" cy="356" rx="9" ry="30" k="calves" />
            <Mz cx="126" cy="356" rx="9" ry="30" k="calves" />
          </g>
        )}
      </svg>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
        color: D.mut }}>{label}</span>
    </div>
  );
}

// ── Muscle map card (DARK instrument) ───────────────────────────
function MuscleMap() {
  const groups = [
    { tone: 'strong', label: 'Сильные', list: 'Квадрицепсы · ягодицы · пресс · бицепс бедра' },
    { tone: 'mid', label: 'Средние', list: 'Плечи · спина · трапеции · икры · косые' },
    { tone: 'weak', label: 'Отстают', list: 'Грудь · бицепс · трицепс · предплечья' },
  ];
  return (
    <Card dark pad={22}>
      <CardHead dark icon="dumbbell" color={M.green} title="Карта мышц · сила по группам"
        right={<Chip dark style={{ padding: '2px 9px', fontSize: 11 }}>оценка по фото</Chip>} />
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0,
          padding: '8px 8px 4px', borderRadius: 16, background: 'rgba(255,255,255,0.025)',
          border: `1px solid ${D.line}` }}>
          <BodyFigure side="front" label="Спереди" />
          <div style={{ width: 1, background: D.line, margin: '14px 2px' }} />
          <BodyFigure side="back" label="Сзади" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <div key={g.tone} style={{ padding: '14px 16px', borderRadius: 13,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: ST[g.tone],
                    boxShadow: `0 0 0 4px ${ST_DIM[g.tone]}` }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: D.ink, flex: 1 }}>{g.label}</span>
                </div>
                <div style={{ fontSize: 13, color: D.ink2, lineHeight: 1.5 }}>{g.list}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, padding: '12px 15px',
            borderRadius: 12, background: 'rgba(25,195,125,0.10)', border: `1px solid rgba(25,195,125,0.26)` }}>
            <Icon name="spark" size={17} stroke={M.green} />
            <span style={{ flex: 1, fontSize: 12.5, color: D.ink2, lineHeight: 1.45 }}>
              Коуч уже добавил больше работы на грудь и руки в программу тренировок — чтобы подтянуть отстающие зоны.</span>
          </div>
        </div>
      </div>
      <MedicalNote dark>Оценка визуальная, по фотографиям — не замер состава тела и не диагноз.</MedicalNote>
    </Card>
  );
}

// ── Body composition (DARK instrument) ──────────────────────────
function BodyComposition() {
  const trend = [27.8, 27.5, 27.6, 27.1, 26.8, 26.4, 26.1, 25.8];
  return (
    <Card dark pad={22}>
      <CardHead dark icon="heart" color={M.amber} title="Состав тела"
        right={<span style={{ fontSize: 12.5, color: D.mut2 }}>оценка · 5 июн</span>} />
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { v: 26, unit: '%', label: 'Жир', color: M.amber, sub: '−1.7% за 30 дней', good: true },
          { v: 38, unit: '%', label: 'Мышцы', color: M.green, sub: '+0.9% за 30 дней', good: true },
          { v: 54, unit: '%', label: 'Вода', color: M.blue, sub: 'в норме' },
        ].map((m) => (
          <div key={m.label} style={{ flex: 1, padding: '16px', borderRadius: 14, textAlign: 'center',
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.line}` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Ring value={m.v} size={96} sw={9} color={m.color} dark
                label={`${m.v}%`} track="rgba(255,255,255,0.07)" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: D.mut }}>{m.label}</div>
            <div style={{ fontSize: 12, color: m.good ? M.green : D.mut2, marginTop: 5, fontWeight: 500 }}>{m.sub}</div>
          </div>
        ))}
      </div>
      {/* weight + bmi + fat trend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 13, background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 18 }}>
          <Stat dark value="64.2" unit="кг" label="Вес" sub="−1.2 кг за 30 дней" />
          <div style={{ width: 1, alignSelf: 'stretch', background: D.line }} />
          <Stat dark value="22.4" label="ИМТ" sub="норма" />
        </div>
        <div style={{ flex: 1.2, padding: '14px 16px', borderRadius: 13, background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${D.line}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <Eyebrow dark>% жира · 8 недель</Eyebrow>
            <span style={{ fontSize: 12.5, color: M.green, fontWeight: 700 }}>↓ снижается</span>
          </div>
          <MiniBars dark data={trend.map((v) => ({ v: v - 22, c: M.amber }))} h={42} />
        </div>
      </div>
    </Card>
  );
}

// ── Body analysis screen (profile sub-screen) ───────────────────
function BodyAnalysisScreen() {
  return (
    <AppShell active="profile" contentBg={L.paper}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar sub="Профиль · из анализа по фото" title="Анализ тела"
          right={<Btn kind="soft" size="sm" icon="camera"
            onClick={() => window.__htNav && window.__htNav('chat')}>Обновить по фото</Btn>} />
        <div style={{ flex: 1, minHeight: 0, padding: '20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* provenance banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderRadius: 13,
            background: 'rgba(25,195,125,0.08)', border: `1px solid rgba(25,195,125,0.26)` }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: M.greenDim }}>
              <Icon name="camera" size={16} stroke={M.green} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: L.ink }}>Сохранено из чата · 5 июня. </span>
              <span style={{ fontSize: 13.5, color: L.mut }}>Анализ сделан по 3 фото (спереди, сбоку, сзади).</span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: M.green, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              История →</span>
          </div>
          <BodyComposition />
          <MuscleMap />
          <CoachNotes>Хорошая динамика: жир медленно снижается, мышцы растут — это именно то, что нужно для цели «энергия». Главный фокус на ближайший месяц — догнать верх тела: грудь, руки, спина.</CoachNotes>
        </div>
      </div>
    </AppShell>
  );
}

// ── Result card used inside chat (writes to profile) ────────────
function BodyAnalysisCard({ saved, onSave, onOpen }) {
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${L.line2}`,
      background: '#fff', boxShadow: '0 1px 2px rgba(24,23,18,0.05), 0 8px 22px rgba(24,23,18,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
        borderBottom: `1px solid ${L.line}`, background: L.panel }}>
        <Icon name="profile" size={17} stroke={M.green} />
        <span style={{ fontSize: 14, fontWeight: 700, color: L.ink, flex: 1 }}>Примерный анализ тела</span>
        <Chip tone="neutral" style={{ fontSize: 11 }}>по 3 фото</Chip>
      </div>
      <div style={{ padding: 18 }}>
        {/* headline metrics */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[['≈ 24–27', '%', 'Жир', M.amber], ['Средний', '', 'Мыш. тонус', M.green], ['64–65', 'кг', 'Вес*', L.ink]].map(
            ([v, u, l, c]) => (
              <div key={l} style={{ flex: 1, padding: '13px 12px', borderRadius: 13, background: L.panel,
                border: `1px solid ${L.line}`, textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: c, letterSpacing: -0.3 }}>
                  {v}{u && <span style={{ fontSize: 13, color: L.mut, marginLeft: 2 }}>{u}</span>}</div>
                <Eyebrow style={{ marginTop: 5 }}>{l}</Eyebrow>
              </div>
            ))}
        </div>
        {/* strong / weak */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: '13px 15px', borderRadius: 13, background: M.greenDim,
            border: `1px solid rgba(25,195,125,0.26)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <Icon name="check" size={14} stroke={M.green} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#137a4f' }}>Сильные зоны</span></div>
            <span style={{ fontSize: 13, color: L.ink2, lineHeight: 1.5 }}>Ноги, ягодицы, пресс — развиты хорошо</span>
          </div>
          <div style={{ flex: 1, padding: '13px 15px', borderRadius: 13, background: M.redDim,
            border: `1px solid rgba(240,80,106,0.26)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <Icon name="bolt" size={14} stroke={M.red} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#b32a45' }}>Зоны роста</span></div>
            <span style={{ fontSize: 13, color: L.ink2, lineHeight: 1.5 }}>Грудь, руки, верх спины — стоит подтянуть</span>
          </div>
        </div>
        {/* disclaimer */}
        <div style={{ display: 'flex', gap: 8, padding: '11px 14px', borderRadius: 11, background: L.panel,
          marginBottom: saved ? 0 : 16 }}>
          <Icon name="info" size={14} stroke={L.mut2} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: L.mut, lineHeight: 1.5 }}>
            Это визуальная оценка по фото с погрешностью ±3–4%, а не замер состава тела. <b>*</b>Вес — со слов,
            не измеряется по фото. Не медицинская диагностика.</span>
        </div>
        {/* action */}
        {saved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
            background: M.greenDim, border: `1px solid rgba(25,195,125,0.3)` }}>
            <CheckCircle done size={20} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#137a4f' }}>Сохранено в профиль · «Анализ тела»</span>
            <span onClick={onOpen} style={{ fontSize: 12.5, fontWeight: 600, color: M.green, cursor: 'pointer' }}>Открыть →</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="accept" icon="profile" onClick={onSave}>Сохранить в профиль</Btn>
            <Btn kind="ghost">Сравнить с прошлым</Btn>
            <Btn kind="quiet">Не сохранять</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { BodyFigure, MuscleMap, BodyComposition, BodyAnalysisScreen, BodyAnalysisCard });
