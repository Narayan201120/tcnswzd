import { useEffect, useState } from "react";

export const ROUTE_IDS = ["decision", "accuracy", "buying-notes"] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

function routeFromHash(): RouteId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return ROUTE_IDS.find((route) => route === id) ?? "decision";
}

// Hash routing keeps the app deployable as a static site with no server
// rewrites, and gives every view a shareable URL.
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(routeFromHash);
  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}
