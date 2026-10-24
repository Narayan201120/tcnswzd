import { ROUTE_IDS, type RouteId } from "../hooks/useHashRoute";

const TAB_LABELS: Record<RouteId, string> = {
  decision: "Decision",
  accuracy: "Accuracy",
  "buying-notes": "Buying notes",
};

export function Tabs({ route }: { route: RouteId }) {
  return (
    <nav aria-label="Views" className="tabs">
      {ROUTE_IDS.map((id) => (
        <a
          key={id}
          href={`#/${id}`}
          className="tab"
          aria-current={route === id ? "page" : undefined}
        >
          {TAB_LABELS[id]}
        </a>
      ))}
    </nav>
  );
}
