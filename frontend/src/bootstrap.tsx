/**
 * Ilovaning haqiqiy boshlanishi.
 *
 * `main.tsx` bu modulni interfeys so'zlari yuklangandan KEYIN chaqiradi —
 * sababi `main.tsx` da yozilgan.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ConfirmHost from "./components/Confirm";
import PromptHost from "./components/Prompt";
import ErrorBoundary from "./components/ErrorBoundary";
import { RealtimeProvider } from "./realtime/RealtimeContext";
import { fetchSystemBranding } from "./api/branding";

void fetchSystemBranding();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Oxirgi to'siq: bundan tashqarida xato bo'lsa odam oq ekran ko'rardi. */}
    <ErrorBoundary scope="app">
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>
            <App />
            {/* Tasdiqlash oynasi - `window.confirm` o'rniga, bir marta. */}
            <ConfirmHost />
            {/* Matn kiritish oynasi - `window.prompt` o'rniga, bir marta. */}
            <PromptHost />
          </RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
