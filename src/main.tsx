import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { QuickWindow } from "./features/helper/QuickWindow";
import { SplashHost } from "./features/splash/SplashHost";
import { SplashScreen } from "./features/splash/SplashScreen";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The start screen is a small window of its own that loads this same page with `?splash`.
const params = new URLSearchParams(window.location.search);
const isSplash = params.has("splash");
// The taskbar helper's small window loads it too, with `?quick=note` or `?quick=park`.
const quick = params.get("quick");

createRoot(root).render(
  <StrictMode>
    {isSplash ? (
      <SplashScreen />
    ) : quick === "note" || quick === "park" ? (
      <QuickWindow mode={quick} />
    ) : (
      <ErrorBoundary>
        <App />
        <SplashHost />
      </ErrorBoundary>
    )}
  </StrictMode>,
);
