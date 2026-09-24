import React from "react";
import ReactDOM from "react-dom/client";
import App from "./JoyaPartner.jsx";
import { isSupabaseConfigured } from "./supabaseClient";

const root = ReactDOM.createRoot(document.getElementById("root"));

if (!isSupabaseConfigured) {
  // Ne remplace rien de l'app : ce cas ne s'affiche QUE si la configuration
  // manque réellement (variables d'environnement Vercel non renseignées).
  root.render(
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#111",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>Configuration Supabase manquante</h1>
        <p style={{ color: "#ccc", fontSize: 13.5, lineHeight: 1.6 }}>
          Les variables d'environnement <code>VITE_SUPABASE_URL</code> et{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> ne sont pas définies pour ce déploiement.
          <br />
          <br />
          Sur Vercel : Project → Settings → Environment Variables, ajoute les deux,
          puis redéploie (Deployments → ⋯ → Redeploy).
        </p>
      </div>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
