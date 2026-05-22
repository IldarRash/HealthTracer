const surfaces = ["API health", "Workspace status", "Future proposal inspector"];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Developer shell</p>
        <h1>AI Health Coach</h1>
        <p>
          Minimal web surface for debugging foundation state before product
          domains are implemented.
        </p>
        <ul>
          {surfaces.map((surface) => (
            <li key={surface}>{surface}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
