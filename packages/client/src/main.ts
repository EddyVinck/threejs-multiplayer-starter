import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Expected #app root element");
}

app.innerHTML = `
  <main class="shell">
    <h1>Game Jam Boilerplate</h1>
    <p>Workspace scaffolding is ready for the upcoming gameplay modules.</p>
  </main>
`;
