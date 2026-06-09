/* proposal.jsx — the Proposal Card. The core "coach proposes, user decides"
   element. Renders in the light chat. Supports state + visual variant. */

function domainMeta(d) {
  return ({
    training: { icon: 'dumbbell', label: 'Тренировки', color: M.blue, tone: 'blue' },
    nutrition: { icon: 'fork', label: 'Питание', color: M.green, tone: 'green' },
    habit: { icon: 'spark', label: 'Привычка', color: M.indigo, tone: 'indigo' },
    recovery: { icon: 'moon', label: 'Восстановление', color: M.amber, tone: 'amber' },
  })[d] || { icon: 'spark', label: 'План', color: M.green, tone: 'green' };
}

// before → after row
function DiffRow({ from, to, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
      borderBottom: last ? 'none' : `1px solid ${L.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
          color: L.mut2, marginBottom: 4 }}>{from.k}</div>
        <div style={{ fontSize: 14, color: L.mut, textDecoration: 'line-through',
          textDecorationColor: 'rgba(0,0,0,0.25)' }}>{from.v}</div>
      </div>
      <Icon name="arrow" size={17} stroke={L.mut2} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
          color: M.green, marginBottom: 4 }}>{to.k}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: L.ink }}>{to.v}</div>
      </div>
    </div>
  );
}

function Why({ text }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 10,
      background: L.panel, marginBottom: 14 }}>
      <Icon name="info" size={16} stroke={L.mut} style={{ marginTop: 1 }} />
      <div style={{ fontSize: 13, lineHeight: 1.5, color: L.ink2 }}>
        <span style={{ fontWeight: 600 }}>Почему. </span>{text}</div>
    </div>
  );
}

/* ProposalCard
   props: variant 'A'|'B'|'C', state 'proposed'|'edit'|'accepted'|'rejected',
          domain, title, why, changes:[{from,to}], width */
function ProposalCard({ variant = 'A', state = 'proposed', domain = 'training',
  title, why, changes = [], compact, onAccept, onEdit, onReject, onUndo, onRestore }) {
  const dm = domainMeta(domain);
  const accent = dm.color;

  // ── chrome by variant
  const isB = variant === 'B';
  const isC = variant === 'C';

  const Header = () => {
    if (isC) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: L.panel, borderBottom: `1px solid ${L.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO,
            fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, color: L.mut, textTransform: 'uppercase' }}>
            <Icon name={dm.icon} size={14} stroke={accent} />Предложение · {dm.label}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: L.mut2 }}>#CHG-204</span>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: dm.tone ? `${accent}1f` : L.panel2 }}>
          <Icon name={dm.icon} size={17} stroke={accent} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
            color: L.mut2 }}>Предложение коуча</div>
        </div>
        <Chip tone={dm.tone}>{dm.label}</Chip>
      </div>
    );
  };

  // ── footer by state
  const Footer = () => {
    if (state === 'accepted') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          background: M.greenDim, borderTop: `1px solid ${L.line}` }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: M.green,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="checkSm" size={13} stroke="#04130c" sw={2.4} />
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0c6b45' }}>
            Принято · план обновлён <span style={{ fontWeight: 500, color: M.green }}>· v8</span>
          </div>
          <span onClick={onUndo} style={{ fontSize: 12.5, fontWeight: 600, color: '#0c6b45', cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 2 }}>Отменить</span>
        </div>
      );
    }
    if (state === 'rejected') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          background: L.panel, borderTop: `1px solid ${L.line}` }}>
          <Icon name="x" size={16} stroke={L.mut} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: L.mut }}>
            Отклонено · план без изменений</div>
          <span onClick={onRestore} style={{ fontSize: 12.5, fontWeight: 600, color: L.ink2, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 2 }}>Вернуть</span>
        </div>
      );
    }
    if (state === 'edit') {
      return (
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderTop: `1px solid ${L.line}` }}>
          <Btn kind="accept" icon="check" onClick={onAccept} style={{ flex: 1 }}>Применить изменения</Btn>
          <Btn kind="ghost" onClick={onReject}>Отмена</Btn>
        </div>
      );
    }
    // proposed
    return (
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderTop: `1px solid ${L.line}` }}>
        <Btn kind="accept" icon="check" onClick={onAccept} style={{ flex: 1 }}>Принять</Btn>
        <Btn kind="ghost" icon="edit" onClick={onEdit}>Изменить</Btn>
        <Btn kind="quiet" icon="x" onClick={onReject}>Отклонить</Btn>
      </div>
    );
  };

  const dim = state === 'rejected';

  const Body = () => (
    <div style={{ padding: isC ? '16px' : '12px 16px 16px' }}>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: L.ink,
        marginBottom: 12, lineHeight: 1.3 }}>{title}</div>
      {why && <Why text={why} />}

      {state === 'edit' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Eyebrow style={{ marginBottom: 2 }}>Отредактируйте перед применением</Eyebrow>
          {changes.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 96, fontSize: 12.5, fontWeight: 600, color: L.mut }}>{c.to.k}</div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                border: `1.5px solid ${accent}`, borderRadius: 10, background: '#fff' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: L.ink }}>{c.to.v}</span>
                <div style={{ flex: 1 }} />
                <Icon name="edit" size={14} stroke={L.mut2} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${L.line}`, padding: '2px 14px',
          opacity: dim ? 0.55 : 1 }}>
          {changes.map((c, i) => (
            <DiffRow key={i} from={c.from} to={c.to} last={i === changes.length - 1} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ borderRadius: 16, background: '#fff', overflow: 'hidden',
      border: `1px solid ${L.line2}`,
      boxShadow: state === 'proposed' || state === 'edit' ? '0 4px 20px rgba(0,0,0,0.06)' : 'none',
      borderLeft: isB ? `4px solid ${accent}` : undefined }}>
      <Header />
      <Body />
      <Footer />
    </div>
  );
}

Object.assign(window, { ProposalCard, domainMeta });
