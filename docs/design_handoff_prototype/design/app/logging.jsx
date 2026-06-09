/* logging.jsx — two NEW "coach proposes, user logs" scenarios in the light chat.
   1) FoodLogCard  — coach recognised food from a photo, estimated КБЖУ;
                     user can change ONLY the portion weight (grams) → live recalc.
   2) WorkoutLogCard — coach recognised a workout the user sent; shows estimated
                     calories burned; user can edit ONLY the duration → live recalc.
   Both are interactive React components (state + recalculation + logged state). */

// ── shared stepper (− value + ) used for grams / minutes ─────────
function Stepper({ value, setValue, step = 10, min, max, unit, accent = M.green }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const Btn2 = ({ label, to }) => (
    <button onClick={() => setValue(clamp(to))} style={{ width: 42, height: 42, flexShrink: 0,
      borderRadius: 12, border: `1px solid ${L.line2}`, background: '#fff', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: L.ink,
      fontFamily: FONT }}>
      <Icon name={label} size={18} sw={2.1} stroke={L.ink} />
    </button>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Btn2 label="minus" to={value - step} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5,
          padding: '8px 0', borderRadius: 12, border: `1.5px solid ${accent}`, background: `${accent}0d` }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: L.ink, letterSpacing: -0.5,
            fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: L.mut }}>{unit}</span>
        </div>
        <Btn2 label="plus" to={value + step} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: '100%', marginTop: 14, accentColor: accent, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: L.mut2,
        fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
        <span>{min} {unit}</span><span>{max} {unit}</span>
      </div>
    </div>
  );
}

// little "locked / read-only" pill to make clear what the user can't touch
function LockedHint({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: L.mut2 }}>
      <Icon name="lock" size={12} stroke={L.mut2} />{children}
    </div>
  );
}

/* ── FOOD LOG CARD ───────────────────────────────────────────────
   Coach recognised the dish + per-100g values; user changes only grams. */
function FoodLogCard({ embedded }) {
  const [grams, setGrams] = React.useState(320);
  const [logged, setLogged] = React.useState(false);

  // per-100g of the recognised dish
  const per100 = { kcal: 147, p: 12.0, f: 3.8, c: 15.0 };
  const k = grams / 100;
  const r1 = (n) => Math.round(n * k);
  const r10 = (n) => (Math.round(n * k * 10) / 10);

  const macros = [
    { k: 'Белки', v: r10(per100.p), unit: 'г', c: M.green },
    { k: 'Жиры', v: r10(per100.f), unit: 'г', c: M.indigo },
    { k: 'Углеводы', v: r10(per100.c), unit: 'г', c: M.blue },
  ];

  return (
    <div style={{ borderRadius: 16, background: '#fff', overflow: 'hidden',
      border: `1px solid ${L.line2}`, boxShadow: logged ? 'none' : '0 4px 20px rgba(0,0,0,0.06)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: `${M.green}1f` }}>
          <Icon name="fork" size={17} stroke={M.green} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
            color: L.mut2 }}>Предложение коуча · записать в дневник</div>
        </div>
        <Chip tone="green">Питание</Chip>
      </div>

      <div style={{ padding: '12px 16px 16px' }}>
        {/* recognised product */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
            border: `1px solid ${L.line}`, background:
            'repeating-linear-gradient(135deg,#efe9e1,#efe9e1 7px,#e7ddcf 7px,#e7ddcf 14px)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: L.ink,
              lineHeight: 1.25 }}>Курица с рисом и овощами</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Icon name="spark" size={12} stroke={M.green} />
              <span style={{ fontSize: 12.5, color: L.mut }}>Распознано по фото · оценка примерная</span>
            </div>
          </div>
        </div>

        {/* calories headline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          borderRadius: 13, background: M.amberDim, marginBottom: 10 }}>
          <Icon name="bolt" size={22} stroke={M.amber} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: '#9a6b12' }}>Калорийность порции</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#8a5d0f', letterSpacing: -0.6,
                fontVariantNumeric: 'tabular-nums' }}>{r1(per100.kcal)}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#9a6b12' }}>ккал</span>
            </div>
          </div>
          <LockedHint>считает коуч</LockedHint>
        </div>

        {/* macro grid */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {macros.map((m) => (
            <div key={m.k} style={{ flex: 1, padding: '11px 12px', borderRadius: 12,
              border: `1px solid ${L.line}`, background: L.panel }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                color: L.mut2 }}>{m.k}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <span style={{ fontSize: 19, fontWeight: 700, color: m.c, letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums' }}>{m.v}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: L.mut }}>{m.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* the ONLY editable thing: grams */}
        {logged ? null : (
          <div style={{ borderRadius: 13, border: `1px solid ${L.line2}`, padding: '14px 15px',
            background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 13 }}>
              <Eyebrow>Вес порции — можно поправить</Eyebrow>
              <div style={{ display: 'flex', gap: 6 }}>
                {[200, 320, 450].map((g) => (
                  <button key={g} onClick={() => setGrams(g)} style={{ padding: '4px 10px',
                    borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                    border: `1px solid ${grams === g ? M.green : L.line2}`,
                    background: grams === g ? M.greenDim : '#fff',
                    color: grams === g ? '#0c6b45' : L.ink2 }}>{g} г</button>
                ))}
              </div>
            </div>
            <Stepper value={grams} setValue={setGrams} step={10} min={50} max={600} unit="г" accent={M.green} />
          </div>
        )}
      </div>

      {/* footer */}
      {logged ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          background: M.greenDim, borderTop: `1px solid ${L.line}` }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: M.green, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkSm" size={13} stroke="#04130c" sw={2.4} />
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0c6b45' }}>
            Записано в дневник · обед · {grams} г · {r1(per100.kcal)} ккал
          </div>
          <span onClick={() => setLogged(false)} style={{ fontSize: 12.5, fontWeight: 600, color: '#0c6b45',
            cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>Отменить</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderTop: `1px solid ${L.line}` }}>
          <Btn kind="accept" icon="check" style={{ flex: 1 }} onClick={() => setLogged(true)}>Записать в дневник</Btn>
          <Btn kind="quiet" icon="x">Не сейчас</Btn>
        </div>
      )}
    </div>
  );
}

/* ── WORKOUT LOG CARD ────────────────────────────────────────────
   Coach recognised the workout; shows estimated burn; user edits only minutes. */
function WorkoutLogCard({ embedded }) {
  const [mins, setMins] = React.useState(52);
  const [logged, setLogged] = React.useState(false);

  const rate = 7.6;               // kcal / min, strength session estimate
  const kcal = Math.round(mins * rate);
  const avgHr = Math.round(118 + mins * 0.18);   // gentle dependence for realism

  const facts = [
    { ic: 'heart', c: M.red, k: 'Средний пульс', v: `${avgHr}`, unit: 'уд/мин' },
    { ic: 'dumbbell', c: M.blue, k: 'Тип', v: 'Силовая', unit: '' },
    { ic: 'spark', c: M.indigo, k: 'Интенсивность', v: 'Средняя', unit: '' },
  ];

  return (
    <div style={{ borderRadius: 16, background: '#fff', overflow: 'hidden',
      border: `1px solid ${L.line2}`, boxShadow: logged ? 'none' : '0 4px 20px rgba(0,0,0,0.06)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: `${M.blue}1f` }}>
          <Icon name="dumbbell" size={17} stroke={M.blue} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
            color: L.mut2 }}>Предложение коуча · записать тренировку</div>
        </div>
        <Chip tone="blue">Тренировки</Chip>
      </div>

      <div style={{ padding: '12px 16px 16px' }}>
        {/* recognised workout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: `${M.blue}14`,
            border: `1px solid ${L.line}` }}>
            <Icon name="dumbbell" size={26} stroke={M.blue} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: L.ink,
              lineHeight: 1.25 }}>Силовая тренировка</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Icon name="spark" size={12} stroke={M.blue} />
              <span style={{ fontSize: 12.5, color: L.mut }}>Распознано из сообщения · оценка примерная</span>
            </div>
          </div>
        </div>

        {/* calories headline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          borderRadius: 13, background: M.amberDim, marginBottom: 10 }}>
          <Icon name="bolt" size={22} stroke={M.amber} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
              color: '#9a6b12' }}>Сожжено за тренировку</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#8a5d0f', letterSpacing: -0.6,
                fontVariantNumeric: 'tabular-nums' }}>{kcal}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#9a6b12' }}>ккал</span>
            </div>
          </div>
          <LockedHint>считает коуч</LockedHint>
        </div>

        {/* secondary facts */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {facts.map((f) => (
            <div key={f.k} style={{ flex: 1, padding: '11px 12px', borderRadius: 12,
              border: `1px solid ${L.line}`, background: L.panel }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={f.ic} size={13} stroke={f.c} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: 'uppercase', color: L.mut2 }}>{f.k}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: L.ink, letterSpacing: -0.3,
                  fontVariantNumeric: 'tabular-nums' }}>{f.v}</span>
                {f.unit && <span style={{ fontSize: 11.5, fontWeight: 600, color: L.mut }}>{f.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* the ONLY editable thing: duration */}
        {logged ? null : (
          <div style={{ borderRadius: 13, border: `1px solid ${L.line2}`, padding: '14px 15px',
            background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 13 }}>
              <Eyebrow>Длительность — можно поправить</Eyebrow>
              <div style={{ display: 'flex', gap: 6 }}>
                {[30, 45, 60].map((mm) => (
                  <button key={mm} onClick={() => setMins(mm)} style={{ padding: '4px 10px',
                    borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                    border: `1px solid ${mins === mm ? M.blue : L.line2}`,
                    background: mins === mm ? M.blueDim : '#fff',
                    color: mins === mm ? '#1f5fb0' : L.ink2 }}>{mm} мин</button>
                ))}
              </div>
            </div>
            <Stepper value={mins} setValue={setMins} step={5} min={10} max={120} unit="мин" accent={M.blue} />
          </div>
        )}
      </div>

      {/* footer */}
      {logged ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          background: M.greenDim, borderTop: `1px solid ${L.line}` }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: M.green, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkSm" size={13} stroke="#04130c" sw={2.4} />
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0c6b45' }}>
            Тренировка записана · {mins} мин · {kcal} ккал
          </div>
          <span onClick={() => setLogged(false)} style={{ fontSize: 12.5, fontWeight: 600, color: '#0c6b45',
            cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>Отменить</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderTop: `1px solid ${L.line}` }}>
          <Btn kind="accept" icon="check" style={{ flex: 1 }} onClick={() => setLogged(true)}>Записать тренировку</Btn>
          <Btn kind="quiet" icon="x">Не сейчас</Btn>
        </div>
      )}
    </div>
  );
}

/* ── chat scenario screens ───────────────────────────────────────*/
function ChatFoodLog() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg photo>Пообедал. Запишешь в дневник?</UserMsg>
        <CoachMsg>
          <Para>Вижу на фото курицу с рисом и овощами. Прикинул калорийность и КБЖУ —
            числа считаю я, вам нужно только поправить вес порции, если он другой. Готов записать в дневник.</Para>
          <FoodLogCard />
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

function ChatWorkoutLog() {
  return (
    <AppShell theme="light" active="chat">
      <ChatScreen composer="default">
        <UserMsg photo>Закончил силовую в зале</UserMsg>
        <CoachMsg>
          <Para>Поздравляю! Распознал силовую тренировку. Оценил, сколько примерно сожжено —
            это считаю я. Проверьте только длительность, и я запишу её в ваши тренировки.</Para>
          <WorkoutLogCard />
        </CoachMsg>
      </ChatScreen>
    </AppShell>
  );
}

// isolated card frames for the canvas (card on a neutral chat surface)
function LogCardFrame({ which }) {
  return (
    <div style={{ width: '100%', height: '100%', background: L.panel, display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: FONT, padding: 40 }}>
      <div style={{ width: 520 }}>
        {which === 'workout' ? <WorkoutLogCard /> : <FoodLogCard />}
      </div>
    </div>
  );
}

Object.assign(window, { FoodLogCard, WorkoutLogCard, ChatFoodLog, ChatWorkoutLog, LogCardFrame, Stepper });
