# Web UI Class Reference

Quick mapping for Frontend Implementer and UI Polish Implementer. Full rationale in `chat-primary-web-visual-direction.md`.

## Chat route (no page header)

```tsx
<AppShell variant="chat">
  <AppShellHeader brand="AI Health Coach" nav={<AppNav />} />
  <AppShellMain variant="chat">
    <div className="chat-single">
      {/* ChatWorkspace — no thread sidebar */}
      <ChatTranscript>...</ChatTranscript>
      <ChatComposer>...</ChatComposer>
    </div>
  </AppShellMain>
</AppShell>
```

## Structured route (Workouts, Goals, Nutrition)

```tsx
<AppShell>
  <AppShellHeader brand="AI Health Coach" nav={<AppNav />} />
  <AppShellMain variant="dashboard">
    <PageHeader title="Workouts" description="..." />
    <PageContent>...</PageContent>
  </AppShellMain>
</AppShell>
```

## Profile dashboard

```tsx
<DashboardGrid className="dashboard-grid--profile">
  <article className="dashboard-hero">
    <p className="dashboard-hero__label">Weekly consistency</p>
    <div className="metric-ring" style={{ "--ring-progress": 72 } as CSSProperties} />
    <p className="dashboard-hero__value">72%</p>
    <p className="dashboard-hero__subtitle">Based on your logged workouts and active goals this week.</p>
    <div className="trend-strip">...</div>
  </article>
  <DashboardCard className="dashboard-card--span-5" label="Goals" title="Active goals" value="2" />
  ...
  <section className="dashboard-section">Profile details</section>
</DashboardGrid>
```

## Inline proposal in chat

```tsx
<ProposalConfirmation
  className="confirmation-card--inline"
  status={proposal.status}
  title={proposal.title}
  meta={<span className="proposal-domain-pill proposal-domain-pill--workout">Workout</span>}
  badges={<Badge>Pending</Badge>}
  actions={
    <>
      <Button className="button-coach">Accept change</Button>
      <Button variant="secondary">Decline</Button>
    </>
  }
>
  <p className="proposal-reason">{proposal.reason}</p>
  {accepted && (
    <p className="confirmation-card__success">
      Plan updated. <a className="confirmation-card__link" href="/training">View workouts →</a>
    </p>
  )}
</ProposalConfirmation>
```

## Copy replacements

| Remove | Use |
|--------|-----|
| `Phase N …` eyebrows | Omit or use product area label |
| `assistant` / `user` role labels | Omit or "Coach" |
| `intent / targetDomain` | Domain pill + title only |
| `validationStatus` badge in chat | Inline notice when blocked |
| Recovery score, strain, HRV readiness | Weekly consistency, adherence, coaching focus |
