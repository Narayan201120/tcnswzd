import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Tabs } from "./components/Tabs";
import { useHashRoute } from "./hooks/useHashRoute";
import { AccuracyView } from "./views/AccuracyView";
import { BuyingNotesView } from "./views/BuyingNotesView";
import { DecisionView } from "./views/DecisionView";

export default function App() {
  const route = useHashRoute();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <Tabs route={route} />
      <main className="app-main" id="main">
        {route === "decision" ? <DecisionView /> : null}
        {route === "accuracy" ? <AccuracyView /> : null}
        {route === "buying-notes" ? <BuyingNotesView /> : null}
      </main>
      <Footer />
    </div>
  );
}
