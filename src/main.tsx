import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SplashHost } from "./features/splash/SplashHost";
import { SplashScreen } from "./features/splash/SplashScreen";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The start screen is a small window of its own that loads this same page with `?splash`.
const isSplash = new URLSearchParams(window.location.search).has("splash");

createRoot(root).render(
  <StrictMode>
    {isSplash ? (
      <SplashScreen />
    ) : (
      <ErrorBoundary>
        <App />
        <SplashHost />
      </ErrorBoundary>
    )}
  </StrictMode>,
);
