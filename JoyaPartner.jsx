import { useState, useEffect, useCallback } from "react";
import {
  signUpClient,
  applyPendingReferralCodeIfAny,
  signIn,
  signOut,
  getSession,
  onAuthStateChange,
  getCurrentRole,
  translateAuthError,
  getSettings,
  updateSettings,
  setPartnerCommissionRate,
  getMyProfile,
  getMyLatestPartnerCodeUsage,
  useNewOrderCode,
  getMyOrders,
  getMyPartnerApplication,
  submitPartnerApplication,
  getPendingPartnerApplications,
  approvePartnerApplication,
  rejectPartnerApplication,
  getAllPartners,
  setPartnerActive,
  setPartnerCode,
  getMyPartnerProfile,
  getMyPartnerBalance,
  getMyPartnerOrderStats,
  getMyReferredClients,
  getMyPartnerOrders,
  getMyCommissions,
  getMyPaymentMethod,
  setMyPaymentMethod,
  revealIban,
  getMyWithdrawals,
  requestWithdrawal,
  getAllWithdrawals,
  getPaymentMethodById,
  processWithdrawal,
  getAllOrders,
  createOrder,
  validateOrder,
  cancelOrder,
  getAllClients,
  getAllPartnerCodeUsages,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getOrderDocuments,
  addOrderDocument,
  deleteOrderDocument,
  searchPartners,
  searchClients,
  searchOrders,
  translateRpcError,
} from "./api";

/* ============================================================
   JOYA PARTNER — plateforme Client / Partenaire / Admin
   Authentification et rôle : Supabase Auth + current_app_role() (V5).
   Toutes les données métier (commandes, commissions, retraits,
   candidatures, notifications, documents, moyens de paiement...) sont
   lues/écrites directement via src/lib/api.js (tables, vues et RPC V5) —
   aucun état local ne sert plus de source de vérité métier.
   ============================================================ */

const INSTAGRAM_HANDLE = "joya_grillz";
const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;

const CANCEL_REASONS = [
  "Désistement du client",
  "Commande annulée par Joya",
  "Paiement non reçu",
  "Remboursement",
  "Erreur de commande",
  "Autre",
];

function formatEUR(n) {
  return (Math.round((n || 0) * 100) / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function isThisMonth(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  } catch {
    return false;
  }
}

/* ---------------- Shared style tokens ---------------- */
const C = {
  black: "#0a0a0a",
  black2: "#121212",
  surface: "#161616",
  surfaceAlt: "#1c1c1c",
  border: "#2a2a2a",
  white: "#f5f5f3",
  dim: "#9a9a9a",
  red: "#c81e2c",
  redDark: "#8f1420",
  chrome1: "#e4e7eb",
  chrome2: "#8a90a0",
};

const font = {
  display: "'Oswald', sans-serif",
  body: "'Inter', sans-serif",
};

function StatusBadge({ status }) {
  const map = {
    attente: { label: "En attente", bg: "#3a2f14", fg: "#e0b84a" },
    validee: { label: "Validée", bg: "#12331e", fg: "#4ade80" },
    annulee: { label: "Annulée", bg: "#3a1414", fg: "#f87171" },
    payee: { label: "Payé", bg: "#12331e", fg: "#4ade80" },
    refusee: { label: "Refusé", bg: "#3a1414", fg: "#f87171" },
  };
  const s = map[status] || map.attente;
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", style, disabled, type = "button" }) {
  const base = {
    fontFamily: font.body,
    fontWeight: 600,
    fontSize: 14,
    padding: "12px 22px",
    borderRadius: 8,
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "transform .15s ease, filter .15s ease",
  };
  const variants = {
    primary: { background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, color: "#fff" },
    ghost: { background: "transparent", color: C.white, border: `1px solid ${C.border}` },
    chrome: {
      background: `linear-gradient(135deg, ${C.chrome1}, ${C.chrome2})`,
      color: "#111",
    },
    danger: { background: "#2a1414", color: "#f87171", border: "1px solid #4a1f1f" },
    subtle: { background: C.surfaceAlt, color: C.white, border: `1px solid ${C.border}` },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = "brightness(1.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginBottom: 6, fontFamily: font.body }}>
        {label}
      </span>
      <input
        {...props}
        style={{
          width: "100%",
          background: C.black2,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "12px 14px",
          color: C.white,
          fontSize: 14.5,
          fontFamily: font.body,
          outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={(e) => (e.target.style.borderColor = C.red)}
        onBlur={(e) => (e.target.style.borderColor = C.border)}
      />
    </label>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Logo({ size = 26 }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: font.display }}>
      <span
        style={{
          fontSize: size,
          fontWeight: 600,
          letterSpacing: 1,
          background: `linear-gradient(135deg, ${C.chrome1}, ${C.chrome2})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        JOYA
      </span>
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: 1, color: C.red }}>
        PARTNER
      </span>
    </div>
  );
}

/* ---------------- Notifications bell ---------------- */
function NotificationBell({ session }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setList(await getMyNotifications());
    } catch {
      // Échec silencieux ici : la cloche de notifications ne doit pas
      // bloquer le reste de l'interface ; l'utilisateur peut rouvrir le
      // panneau pour réessayer.
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const unread = list.filter((n) => !n.is_read).length;

  async function markAllRead() {
    const ids = list.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    setList((l) => l.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    try {
      await markAllNotificationsRead(ids);
    } catch {
      await load();
    }
  }

  async function markOneRead(id) {
    setList((l) => l.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await markNotificationRead(id);
    } catch {
      await load();
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative",
          background: "transparent",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          width: 38,
          height: 38,
          cursor: "pointer",
          color: C.white,
          fontSize: 16,
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: C.red,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 10,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            width: 300,
            maxHeight: 360,
            overflowY: "auto",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 10,
            zIndex: 60,
            boxShadow: "0 14px 40px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: "none", border: "none", color: C.dim, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}
              >
                Tout marquer lu
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ color: "#555", fontSize: 12.5, padding: "14px 4px", textAlign: "center" }}>Chargement…</div>
          ) : list.length === 0 ? (
            <div style={{ color: "#555", fontSize: 12.5, padding: "14px 4px", textAlign: "center" }}>Aucune notification.</div>
          ) : (
            list.map((n) => (
              <div
                key={n.id}
                onClick={() => markOneRead(n.id)}
                style={{
                  padding: "9px 8px",
                  borderRadius: 8,
                  marginBottom: 4,
                  background: n.is_read ? "transparent" : "#1c1414",
                  cursor: "pointer",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                <div>{n.message}</div>
                <div style={{ color: "#666", fontSize: 10.5, marginTop: 3 }}>{formatDate(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home"); // home | signup | clientSignup | login | partner | client | admin
  const [session, setSession] = useState(null); // {type:'client'|'partner'|'admin', id, email}
  const [toast, setToast] = useState(null);
  const [adminTab, setAdminTab] = useState("apercu");

  /* ---------------- Session réelle (Supabase Auth + current_app_role) ---------------- */
  const applySession = useCallback(async (authSession) => {
    if (!authSession) {
      setSession(null);
      return;
    }
    try {
      const role = await getCurrentRole();
      if (!role) {
        // current_app_role() renvoie NULL : profil introuvable OU compte
        // désactivé (is_active = false). Dans les deux cas, pas de session
        // applicative — on ne laisse jamais quelqu'un entrer "à moitié".
        await signOut();
        setSession(null);
        showToast("Ce compte est désactivé ou introuvable.", "error");
        return;
      }
      // Applique un éventuel code de parrainage laissé en attente lors de
      // l'inscription (cas où la confirmation d'email était requise).
      if (role === "client") {
        try {
          await applyPendingReferralCodeIfAny();
        } catch {
          // Ne bloque jamais la connexion pour ça — l'utilisateur pourra
          // réessayer le code manuellement depuis son espace client.
        }
      }
      setSession({ type: role, id: authSession.user.id, email: authSession.user.email });
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let unsubscribe;
    (async () => {
      const current = await getSession();
      await applySession(current);
      setLoading(false);
      unsubscribe = onAuthStateChange((sess) => {
        applySession(sess);
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [applySession]);

  // Bascule automatiquement vers le bon espace dès qu'une session
  // applicative est établie (après connexion ou inscription) — plus besoin
  // que chaque écran d'auth gère lui-même la navigation post-connexion.
  useEffect(() => {
    if (session && ["home", "login", "clientSignup"].includes(view)) {
      setView(session.type);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg, kind = "ok") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2800);
  }

  // Protection des espaces par rôle : même si une vue "protégée" était
  // atteinte par erreur, elle est systématiquement revérifiée ici contre
  // la session réelle — ce n'est pas juste un bouton caché dans l'UI.
  useEffect(() => {
    const roleForView = { partner: "partner", admin: "admin", client: "client" };
    const required = roleForView[view];
    if (required && session?.type !== required) {
      setView("home");
      showToast("Accès refusé pour cet espace.", "error");
    }
  }, [view, session]);

  if (loading) {
    return (
      <Shell>
        <div style={{ display: "flex", height: "60vh", alignItems: "center", justifyContent: "center", color: C.dim }}>
          Chargement…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TopBar
        session={session}
        onHome={() => setView("home")}
        onLogout={async () => {
          await signOut();
          setSession(null);
          setView("home");
        }}
      />
      {toast && <Toast toast={toast} />}

      {view === "home" && (
        <Home
          onSignup={() => setView("clientSignup")}
          onLogin={() => setView("login")}
        />
      )}

      {view === "clientSignup" && (
        <ClientSignup
          onDone={() => showToast("Compte créé ! Vérifie ta boîte mail si une confirmation est requise.")}
          onBack={() => setView("home")}
          onLogin={() => setView("login")}
        />
      )}

      {view === "login" && (
        <Login onDone={() => {}} onBack={() => setView("home")} />
      )}

      {view === "partner" && session?.type === "partner" && (
        <PartnerDashboard showToast={showToast} />
      )}

      {view === "client" && session?.type === "client" && (
        <ClientDashboard showToast={showToast} />
      )}

      {view === "admin" && session?.type === "admin" && (
        <AdminDashboard showToast={showToast} tab={adminTab} setTab={setAdminTab} />
      )}
    </Shell>
  );
}

/* ---------------- Shell / layout ---------------- */
function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 500px at 50% -10%, #1a1010 0%, ${C.black} 55%)`,
        color: C.white,
        fontFamily: font.body,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: #666; }
        ::selection { background: ${C.red}; color: #fff; }
      `}</style>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px" }}>{children}</div>
    </div>
  );
}

function TopBar({ session, onHome, onLogout }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 0",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 28,
      }}
    >
      <div onClick={onHome} style={{ cursor: "pointer" }}>
        <Logo />
      </div>
      {session && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationBell session={session} />
          <Btn variant="ghost" onClick={onLogout} style={{ padding: "8px 16px", fontSize: 13 }}>
            Se déconnecter
          </Btn>
        </div>
      )}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        zIndex: 50,
        background: toast.kind === "error" ? "#2a1414" : "#12331e",
        border: `1px solid ${toast.kind === "error" ? "#4a1f1f" : "#1f4a2e"}`,
        color: toast.kind === "error" ? "#f87171" : "#4ade80",
        padding: "12px 18px",
        borderRadius: 10,
        fontSize: 13.5,
        maxWidth: 320,
        boxShadow: "0 10px 30px rgba(0,0,0,.4)",
      }}
    >
      {toast.msg}
    </div>
  );
}

/* ---------------- Home ---------------- */
function Home({ onSignup, onLogin }) {
  const features = [
    { t: "Gagne des commissions", d: "Touche un pourcentage sur chaque vente réalisée grâce à toi." },
    { t: "Ton code personnel", d: "Un code unique à partager avec ta communauté." },
    { t: "Suivi de tes ventes", d: "Consulte en temps réel tes ventes et commissions." },
    { t: "Retraits de tes gains", d: "Demande le versement de ton solde disponible sur PayPal." },
  ];
  return (
    <div>
      <div style={{ textAlign: "center", padding: "60px 0 40px" }}>
        <h1
          style={{
            fontFamily: font.display,
            fontSize: "clamp(32px, 6vw, 54px)",
            fontWeight: 600,
            letterSpacing: 0.5,
            margin: "0 0 16px",
            lineHeight: 1.15,
          }}
        >
          Bienvenue chez <span style={{ color: C.red }}>Joya Grillz</span>
        </h1>
        <p style={{ color: C.dim, fontSize: 16, maxWidth: 460, margin: "0 auto 34px" }}>
          Crée ton compte pour suivre tes commandes — et deviens partenaire quand tu veux.
        </p>
      </div>

      <div style={{ maxWidth: 360, margin: "0 auto 18px" }}>
        <Btn onClick={onSignup} style={{ width: "100%" }}>
          Créer un compte
        </Btn>
      </div>

      <div style={{ textAlign: "center", marginBottom: 50 }}>
        <button
          onClick={onLogin}
          style={{ background: "none", border: "none", color: C.dim, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
        >
          Déjà un compte ? Se connecter
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, margin: "20px 0 60px" }}>
        {features.map((f) => (
          <Card key={f.t}>
            <div style={{ width: 34, height: 3, background: C.red, borderRadius: 2, marginBottom: 14 }} />
            <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{f.t}</div>
            <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.5 }}>{f.d}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Signup (partenaire) ---------------- */
// Conforme au fonctionnement réel de la V5 : le rôle "partner" ne s'obtient
// jamais directement à l'inscription — il faut d'abord un compte client,
// puis déposer une candidature (submit_partner_application), puis
// l'approbation d'un admin (admin_approve_partner_application). Le
// formulaire de candidature lui-même (accessible une fois connecté comme
// client) sera ajouté à l'étape 3.
function PaymentTypeChoice({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${active ? C.red : C.border}`,
        background: active ? "#2a1414" : C.black2,
        color: active ? "#fff" : C.dim,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ---------------- Signup (client) ---------------- */
function ClientSignup({ onDone, onBack, onLogin }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", code: "" });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    const cleanEmail = form.email.trim();
    const cleanPassword = form.password.trim();
    const cleanCode = form.code.trim();
    if (!form.firstName || !form.lastName || !cleanEmail || !cleanPassword) {
      setErr("Merci de remplir tous les champs.");
      return;
    }
    setErr("");
    setSubmitting(true);
    try {
      // Le code de parrainage est désormais facultatif : signUpClient()
      // n'appelle use_partner_code() que si un code non vide est fourni.
      await signUpClient(cleanEmail, cleanPassword, form.firstName.trim(), form.lastName.trim(), cleanCode || null);
      onDone();
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Créer un compte" subtitle="Rejoins Joya Grillz" onBack={onBack}>
      <form onSubmit={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Prénom" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="Léa" />
          <Field label="Nom" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder="D." />
        </div>
        <Field label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="toi@exemple.com" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        <Field label="Mot de passe" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="••••••••" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        <Field label="Code de parrainage (facultatif)" value={form.code} onChange={(e) => update("code", e.target.value)} placeholder="JOYA-MAX" />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <Btn type="submit" disabled={submitting} style={{ width: "100%", marginTop: 6 }}>
          {submitting ? "Création…" : "Créer mon compte"}
        </Btn>
      </form>
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button onClick={onLogin} style={{ background: "none", border: "none", color: C.dim, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
          Déjà un compte ? Se connecter
        </button>
      </div>
    </AuthCard>
  );
}

/* ---------------- Login ---------------- */
function Login({ onDone, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setChecking(true);
    try {
      // signIn() authentifie auprès de Supabase ; c'est ensuite l'écouteur
      // onAuthStateChange (dans App) qui détecte la session, interroge
      // current_app_role() et bascule automatiquement vers le bon espace.
      await signIn(email.trim(), password.trim());
      onDone();
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthCard title="Connexion" subtitle="Accède à ton espace Joya Partner" onBack={onBack}>
      <form onSubmit={submit}>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        <Field label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <Btn type="submit" disabled={checking} style={{ width: "100%", marginTop: 6 }}>
          {checking ? "Vérification…" : "Se connecter"}
        </Btn>
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children, onBack }) {
  return (
    <div style={{ maxWidth: 420, margin: "20px auto 60px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13, marginBottom: 18, padding: 0 }}>
        ← Retour
      </button>
      <div style={{ fontFamily: font.display, fontSize: 26, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ color: C.dim, fontSize: 13.5, marginBottom: 24 }}>{subtitle}</div>
      <Card>{children}</Card>
    </div>
  );
}

/* ---------------- Copy helper ---------------- */
function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div
        style={{
          flex: 1,
          background: C.black2,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13.5,
          color: C.chrome1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: font.body,
        }}
      >
        {value}
      </div>
      <Btn
        variant="subtle"
        style={{ padding: "10px 14px", fontSize: 13 }}
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copié ✓" : "Copier"}
      </Btn>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: font.display, fontSize: 24, fontWeight: 600, color: accent ? C.red : C.white }}>{value}</div>
    </Card>
  );
}

/* ---------------- Partner dashboard ---------------- */
/* ---------------- Partner dashboard ---------------- */
function PartnerDashboard({ showToast }) {
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [orderStats, setOrderStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [referredClients, setReferredClients] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [myCommissions, setMyCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, b, st, s, w, rc, mo, mc] = await Promise.all([
        getMyPartnerProfile(),
        getMyPartnerBalance(),
        getMyPartnerOrderStats(),
        getSettings(),
        getMyWithdrawals(),
        getMyReferredClients(),
        getMyPartnerOrders(),
        getMyCommissions(),
      ]);
      setProfile(p);
      setBalance(b);
      setOrderStats(st);
      setSettings(s);
      setWithdrawals(w);
      setReferredClients(rc);
      setMyOrders(mo);
      setMyCommissions(mc);
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const effectiveRate = profile?.commission_rate_override ?? settings?.default_commission_rate ?? null;
  const minWithdrawal = settings?.min_withdrawal ?? null;

  const clientName = (id) => {
    if (!id) return "—";
    const c = referredClients.find((c) => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const commissionForOrder = (orderId) => myCommissions.find((c) => c.order_id === orderId) || null;

  const clientRows = referredClients.map((c) => {
    const theirOrders = myOrders.filter((o) => o.client_id === c.id);
    const total = theirOrders.filter((o) => o.status !== "annulee").reduce((sum, o) => sum + Number(o.amount), 0);
    return { ...c, orderCount: theirOrders.length, total };
  });

  // Le montant officiel, le solde, le minimum et la concurrence sont tous
  // déterminés par request_withdrawal() côté serveur — ici, uniquement une
  // validation UX basique (montant renseigné et positif) avant l'appel.
  async function submitWithdrawal(e) {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) {
      showToast("Indique un montant valide.", "error");
      return;
    }
    setSubmittingWithdrawal(true);
    try {
      await requestWithdrawal(amt);
      showToast("Demande de retrait envoyée. En attente de validation par l'admin.");
      setWithdrawAmount("");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSubmittingWithdrawal(false);
    }
  }

  if (loading || !profile) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: C.dim }}>Chargement de ton espace…</div>;
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.dim, fontSize: 13.5 }}>Espace partenaire</div>
        <div style={{ fontFamily: font.display, fontSize: 28, fontWeight: 600 }}>Salut {profile.first_name} 👋</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
        <StatCard label="Solde disponible" value={balance ? formatEUR(balance.available_balance) : "—"} accent />
        <StatCard label="Commissions en attente" value={balance ? formatEUR(balance.pending_commission) : "—"} />
        <StatCard label="Retrait(s) en attente" value={balance ? formatEUR(balance.pending_withdrawals) : "—"} />
        <StatCard label="Total validé" value={balance ? formatEUR(balance.validated_total) : "—"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Clients" value={orderStats ? orderStats.clients_count : "—"} />
        <StatCard label="Commandes" value={orderStats ? orderStats.orders_count : "—"} />
        <StatCard label="CA généré" value={orderStats ? formatEUR(orderStats.revenue) : "—"} />
        <StatCard label="Taux de commission" value={effectiveRate != null ? `${effectiveRate}%` : "—"} />
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 8 }}>Ton code partenaire</div>
        {profile.partner_code ? (
          <CopyField value={profile.partner_code} />
        ) : (
          <div style={{ color: "#e0b84a", fontSize: 13, marginBottom: 4 }}>
            Ton code n'a pas encore été attribué — l'équipe Joya Grillz s'en occupe.
          </div>
        )}
        <form onSubmit={submitWithdrawal} style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 200px" }}>
            <Field
              label={minWithdrawal != null ? `Montant à retirer (min. ${formatEUR(minWithdrawal)})` : "Montant à retirer"}
              type="number"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={minWithdrawal != null ? String(minWithdrawal) : ""}
            />
          </div>
          <Btn type="submit" style={{ marginBottom: 14 }} disabled={submittingWithdrawal}>
            {submittingWithdrawal ? "Envoi…" : "Demander un retrait"}
          </Btn>
        </form>
      </Card>

      <PaymentMethodCard showToast={showToast} />

      <SectionTitle>Mes clients</SectionTitle>
      <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucun client rattaché à ton code pour le moment."
          head={["Prénom", "Nom", "Commandes", "Total commandé"]}
          rows={clientRows.map((c) => [c.first_name, c.last_name, c.orderCount, formatEUR(c.total)])}
        />
      </Card>

      <SectionTitle>Mes commandes</SectionTitle>
      <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucune commande pour le moment."
          head={["Date", "Client", "Montant", "Remise", "Code", "Commission", "Statut", "Motif"]}
          rows={myOrders.map((o) => {
            const c = commissionForOrder(o.id);
            return [
              formatDate(o.created_at),
              clientName(o.client_id),
              formatEUR(o.amount),
              `-${o.client_discount_rate}%`,
              o.partner_code_used,
              c ? `${formatEUR(c.commission_amount)} (${c.commission_rate}%)` : "—",
              <StatusBadge status={o.status} />,
              o.cancel_reason || "—",
            ];
          })}
        />
      </Card>

      <SectionTitle>Historique de tes retraits</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucune demande de retrait pour le moment."
          head={["Date", "Montant", "Statut", "Motif"]}
          rows={withdrawals.map((w) => [
            formatDate(w.requested_at),
            formatEUR(w.amount),
            <StatusBadge status={w.status} />,
            w.refuse_reason || "—",
          ])}
        />
      </Card>
    </div>
  );
}

function PaymentMethodCard({ showToast }) {
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState("paypal");
  const [paypal, setPaypal] = useState("");
  const [iban, setIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealedIban, setRevealedIban] = useState(null);
  const [revealing, setRevealing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMethod(await getMyPaymentMethod());
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit() {
    setType(method?.method_type || "paypal");
    setPaypal(method?.paypal_email || "");
    setIban("");
    setRevealedIban(null);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    if (type === "paypal" && !paypal.trim()) {
      showToast("Renseigne ton adresse PayPal.", "error");
      return;
    }
    if (type === "iban" && !iban.trim()) {
      showToast("Renseigne ton IBAN.", "error");
      return;
    }
    setSaving(true);
    try {
      await setMyPaymentMethod({ type, paypal: paypal.trim(), iban: iban.trim() });
      showToast("Moyen de paiement mis à jour.");
      setEditing(false);
      setRevealedIban(null);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  // reveal_iban() est audité côté serveur à CHAQUE appel — donc jamais
  // préchargé automatiquement, uniquement sur clic explicite.
  async function toggleReveal() {
    if (revealedIban) {
      setRevealedIban(null);
      return;
    }
    setRevealing(true);
    try {
      setRevealedIban(await revealIban(method.id));
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setRevealing(false);
    }
  }

  if (loading) {
    return <Card style={{ marginBottom: 20, color: C.dim }}>Chargement du moyen de paiement…</Card>;
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, marginBottom: 10 }}>💳 Mon moyen de paiement</div>
      {!editing ? (
        <div>
          {!method ? (
            <div style={{ color: C.dim, fontSize: 13.5, marginBottom: 14 }}>Aucun moyen de paiement enregistré.</div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, marginBottom: 6 }}>
                <span style={{ color: C.dim }}>Actuel : </span>
                <span style={{ fontWeight: 600 }}>{method.method_type === "iban" ? "🏦 Virement bancaire" : "💳 PayPal"}</span>
              </div>
              <div style={{ fontSize: 13, color: C.chrome1, marginBottom: 14 }}>
                {method.method_type === "paypal" ? (
                  method.paypal_email
                ) : (
                  <>
                    {revealedIban || "IBAN enregistré (masqué)"}
                    <button
                      onClick={toggleReveal}
                      disabled={revealing}
                      style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0, marginLeft: 8 }}
                    >
                      {revealing ? "…" : revealedIban ? "Masquer" : "Voir en clair"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <Btn variant="subtle" onClick={startEdit} style={{ fontSize: 13 }}>
            {method ? "Modifier" : "Ajouter"}
          </Btn>
        </div>
      ) : (
        <form onSubmit={save}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <PaymentTypeChoice label="💳 PayPal" active={type === "paypal"} onClick={() => setType("paypal")} />
            <PaymentTypeChoice label="🏦 Virement bancaire" active={type === "iban"} onClick={() => setType("iban")} />
          </div>
          {type === "paypal" ? (
            <Field label="Email PayPal" value={paypal} onChange={(e) => setPaypal(e.target.value)} placeholder="toi@paypal.com" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
          ) : (
            <Field label="IBAN" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Btn>
            <Btn variant="ghost" type="button" onClick={() => setEditing(false)} disabled={saving}>
              Annuler
            </Btn>
          </div>
        </form>
      )}
    </Card>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, margin: "8px 0 12px", color: C.chrome1 }}>{children}</div>
  );
}

/* ---------------- Client dashboard ---------------- */
function ClientDashboard({ showToast }) {
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [codeUsage, setCodeUsage] = useState(null);
  const [orders, setOrders] = useState([]);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  const [ordering, setOrdering] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);

  const [applying, setApplying] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, cu, o, app] = await Promise.all([
        getMyProfile(),
        getSettings(),
        getMyLatestPartnerCodeUsage(),
        getMyOrders(),
        getMyPartnerApplication(),
      ]);
      setProfile(p);
      setSettings(s);
      setCodeUsage(cu);
      setOrders(o);
      setApplication(app);
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function submitCode(e) {
    e.preventDefault();
    const clean = codeInput.trim();
    if (!clean) return;
    setSubmittingCode(true);
    try {
      await useNewOrderCode(clean);
      showToast(`Code ${clean.toUpperCase()} validé !`);
      setCodeInput("");
      setOrdering(false);
      await loadAll();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSubmittingCode(false);
    }
  }

  if (loading || !profile || !settings) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: C.dim }}>Chargement de ton espace…</div>
    );
  }

  const discountRate = settings.client_discount_rate;
  const partner = codeUsage?.partner;

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.dim, fontSize: 13.5 }}>Espace client</div>
        <div style={{ fontFamily: font.display, fontSize: 28, fontWeight: 600 }}>Bonjour {profile.first_name} 👋</div>
      </div>

      {partner && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>✅ Code partenaire validé !</div>
          <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>
            🎉 Merci de la part de {partner.company_name} et de Joya Grillz pour ta confiance.
            {" "}Tu bénéficies de <span style={{ color: C.red, fontWeight: 700 }}>-{discountRate}%</span> grâce à ton partenaire.
            <br />
            Pour passer ta commande, contacte directement Joya Grillz sur Instagram.
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <Btn variant="chrome">📲 Passer commande sur Instagram (@{INSTAGRAM_HANDLE})</Btn>
          </a>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Passer une nouvelle commande</div>
            <div style={{ color: C.dim, fontSize: 12.5 }}>Utilise le code d'un partenaire — le même ou un autre, sans limite.</div>
          </div>
          {!ordering && (
            <Btn variant="subtle" onClick={() => setOrdering(true)}>
              Passer une nouvelle commande
            </Btn>
          )}
        </div>
        {ordering && (
          <form onSubmit={submitCode} style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Field
                label="Code partenaire"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="JOYA-MAX"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
              />
            </div>
            <Btn type="submit" disabled={submittingCode} style={{ marginBottom: 14 }}>
              {submittingCode ? "Validation…" : "Valider le code"}
            </Btn>
          </form>
        )}
      </Card>

      <SectionTitle>Mes commandes</SectionTitle>
      <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucune commande pour le moment."
          head={["Date", "Montant", "Remise", "Code utilisé", "Statut"]}
          rows={orders.map((o) => [
            formatDate(o.created_at),
            formatEUR(o.amount),
            o.client_discount_rate != null ? `-${o.client_discount_rate}%` : "—",
            o.partner_code_used || "—",
            <StatusBadge status={o.status} />,
          ])}
        />
      </Card>

      <SectionTitle>Tes informations</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 14 }}>
          <div>
            <div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>Prénom</div>
            {profile.first_name}
          </div>
          <div>
            <div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>Nom</div>
            {profile.last_name}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ color: C.dim, fontSize: 12, marginBottom: 4 }}>Email</div>
            {profile.email}
          </div>
        </div>
      </Card>

      <SectionTitle>Devenir partenaire</SectionTitle>
      <PartnerApplicationCard
        application={application}
        applying={applying}
        setApplying={setApplying}
        showToast={showToast}
        onSubmitted={loadAll}
      />
    </div>
  );
}

// Dépose ou affiche le statut réel d'une candidature partenaire
// (submit_partner_application / partner_applications), conformément au
// fonctionnement V5 : jamais de création directe, toujours via candidature.
function PartnerApplicationCard({ application, applying, setApplying, showToast, onSubmitted }) {
  const [form, setForm] = useState({ companyName: "", instagramHandle: "", paymentType: "paypal", paypal: "", iban: "" });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      await submitPartnerApplication(form);
      setApplying(false);
      showToast("Candidature envoyée ! L'équipe Joya Grillz va l'examiner.");
      await onSubmitted();
    } catch (e) {
      setErr(translateRpcError(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Candidature en attente : rien à faire, on affiche juste le statut.
  if (application && application.status === "pending" && !applying) {
    return (
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>⏳ Candidature en attente</div>
        <div style={{ color: C.dim, fontSize: 13.5 }}>
          Ta candidature pour <strong>{application.company_name}</strong> (déposée le {formatDate(application.submitted_at)}) est en cours d'examen par l'équipe Joya Grillz.
        </div>
      </Card>
    );
  }

  // Candidature rejetée : motif affiché, possibilité d'en redéposer une.
  if (application && application.status === "rejected" && !applying) {
    return (
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 6, color: C.red }}>❌ Candidature refusée</div>
        <div style={{ color: C.dim, fontSize: 13.5, marginBottom: 14 }}>
          Motif : {application.rejection_reason}
        </div>
        <Btn variant="subtle" onClick={() => setApplying(true)}>Déposer une nouvelle candidature</Btn>
      </Card>
    );
  }

  if (application && application.status === "approved") {
    return (
      <Card>
        <div style={{ fontWeight: 600 }}>🎉 Candidature approuvée</div>
        <div style={{ color: C.dim, fontSize: 13.5 }}>Ton espace partenaire va s'activer — reconnecte-toi si besoin.</div>
      </Card>
    );
  }

  // Pas de candidature, ou nouvelle demande après un refus.
  if (!applying) {
    return (
      <Card>
        <div style={{ color: C.dim, fontSize: 13.5, marginBottom: 14 }}>
          Recommande Joya Grillz autour de toi et touche une commission sur chaque commande.
        </div>
        <Btn onClick={() => setApplying(true)}>Déposer ma candidature</Btn>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <Field label="Nom de l'entreprise" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="Max Barber Shop" required />
        <Field label="Nom d'utilisateur Instagram" value={form.instagramHandle} onChange={(e) => update("instagramHandle", e.target.value)} placeholder="@toncompte" />
        <div style={{ marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginBottom: 6 }}>Moyen de paiement</span>
          <div style={{ display: "flex", gap: 10 }}>
            <PaymentTypeChoice label="💳 PayPal" active={form.paymentType === "paypal"} onClick={() => update("paymentType", "paypal")} />
            <PaymentTypeChoice label="🏦 Virement bancaire" active={form.paymentType === "iban"} onClick={() => update("paymentType", "iban")} />
          </div>
        </div>
        {form.paymentType === "paypal" ? (
          <Field label="Email PayPal" value={form.paypal} onChange={(e) => update("paypal", e.target.value)} placeholder="toi@paypal.com" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        ) : (
          <Field label="IBAN" value={form.iban} onChange={(e) => update("iban", e.target.value)} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        )}
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn type="submit" disabled={submitting}>{submitting ? "Envoi…" : "Envoyer ma candidature"}</Btn>
          <Btn type="button" variant="subtle" onClick={() => setApplying(false)}>Annuler</Btn>
        </div>
      </form>
    </Card>
  );
}

function Table({ head, rows, empty }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "12px 18px",
                  color: C.dim,
                  fontWeight: 500,
                  fontSize: 12,
                  borderBottom: `1px solid ${C.border}`,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} style={{ padding: 22, color: "#555", textAlign: "center" }}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                {r.map((c, j) => (
                  <td key={j} style={{ padding: "12px 18px", whiteSpace: "nowrap" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Admin dashboard ---------------- */
function AdminDashboard({ showToast, tab, setTab }) {
  const tabs = [
    { k: "apercu", label: "Vue d'ensemble" },
    { k: "candidatures", label: "Candidatures" },
    { k: "partenaires", label: "Partenaires" },
    { k: "clients", label: "Clients" },
    { k: "ventes", label: "Commandes" },
    { k: "retraits", label: "Retraits" },
    { k: "parametres", label: "Paramètres" },
  ];
  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: C.dim, fontSize: 13.5 }}>Espace administrateur</div>
        <div style={{ fontFamily: font.display, fontSize: 28, fontWeight: 600 }}>Tableau de bord Joya</div>
      </div>

      <AdminSearch setTab={setTab} showToast={showToast} />

      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              background: tab === t.k ? C.red : "transparent",
              color: tab === t.k ? "#fff" : C.dim,
              border: `1px solid ${tab === t.k ? C.red : C.border}`,
              borderRadius: 20,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "apercu" && <AdminOverview showToast={showToast} />}
      {tab === "candidatures" && <AdminPartnerApplications showToast={showToast} />}
      {tab === "partenaires" && <AdminPartners showToast={showToast} />}
      {tab === "clients" && <AdminClients showToast={showToast} />}
      {tab === "ventes" && <AdminSales showToast={showToast} />}
      {tab === "retraits" && <AdminWithdrawals showToast={showToast} />}
      {tab === "parametres" && <AdminSettings showToast={showToast} />}
    </div>
  );
}

function AdminSearch({ setTab, showToast }) {
  const [q, setQ] = useState("");
  const [partnerHits, setPartnerHits] = useState([]);
  const [clientHits, setClientHits] = useState([]);
  const [orderHits, setOrderHits] = useState([]);
  const [searching, setSearching] = useState(false);

  // Requêtes ciblées uniquement, jamais un chargement complet des listes —
  // et débouncées (300ms) pour ne pas interroger la base à chaque frappe.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setPartnerHits([]);
      setClientHits([]);
      setOrderHits([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const [partners, clients, orders] = await Promise.all([
          searchPartners(query),
          searchClients(query),
          searchOrders(query),
        ]);
        setPartnerHits(partners);
        setClientHits(clients);
        setOrderHits(orders);
      } catch (e) {
        showToast(translateRpcError(e), "error");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, showToast]);

  const query = q.trim();
  const total = partnerHits.length + clientHits.length + orderHits.length;

  return (
    <div style={{ marginBottom: 18 }}>
      <Field label="Recherche globale" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom client, email, nom partenaire, entreprise, code…" />
      {query && (
        <Card style={{ marginTop: -6 }}>
          {searching ? (
            <div style={{ color: "#555", fontSize: 13 }}>Recherche…</div>
          ) : total === 0 ? (
            <div style={{ color: "#555", fontSize: 13 }}>Aucun résultat pour « {q} ».</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              {partnerHits.length > 0 && (
                <div>
                  <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 4 }}>Partenaires</div>
                  {partnerHits.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                      <span>
                        {p.firstName} {p.lastName} — {p.partnerCode || "sans code"}
                      </span>
                      <button onClick={() => setTab("partenaires")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>
                        Voir →
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {clientHits.length > 0 && (
                <div>
                  <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 4 }}>Clients</div>
                  {clientHits.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                      <span>
                        {c.first_name} {c.last_name} — {c.email}
                      </span>
                      <button onClick={() => setTab("clients")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>
                        Voir →
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {orderHits.length > 0 && (
                <div>
                  <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 4 }}>Commandes</div>
                  {orderHits.map((o) => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                      <span>
                        Commande du {formatDate(o.created_at)} — {formatEUR(o.amount)} ({o.partner_code_used})
                      </span>
                      <button onClick={() => setTab("ventes")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>
                        Voir →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function AdminOverview({ showToast }) {
  const [partners, setPartners] = useState([]);
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, c, o, w] = await Promise.all([getAllPartners(), getAllClients(), getAllOrders(), getAllWithdrawals()]);
        setPartners(p);
        setClients(c);
        setOrders(o);
        setWithdrawals(w);
      } catch (e) {
        showToast(translateRpcError(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement…</Card>;
  }

  // CA/commandes : simples sommes/comptages sur des montants déjà officiels
  // (orders.amount, tel que renvoyé par la base) — aucun calcul de
  // commission ni de taux ici. "Commissions à valider" = commandes encore
  // en attente (1 commande = 1 commission, jamais recalculée).
  const activeOrders = orders.filter((o) => o.status !== "annulee");
  const revenue = activeOrders.reduce((sum, o) => sum + Number(o.amount), 0);
  const monthOrders = activeOrders.filter((o) => isThisMonth(o.created_at));
  const monthRevenue = monthOrders.reduce((sum, o) => sum + Number(o.amount), 0);
  const commissionsToValidate = orders.filter((o) => o.status === "attente").length;
  const withdrawalsPending = withdrawals.filter((w) => w.status === "attente").length;

  return (
    <div>
      <SectionTitle>Depuis le début</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="CA généré" value={formatEUR(revenue)} accent />
        <StatCard label="Partenaires" value={partners.length} />
        <StatCard label="Clients" value={clients.length} />
        <StatCard label="Commandes" value={activeOrders.length} />
        <StatCard label="Commissions à valider" value={commissionsToValidate} />
        <StatCard label="Retraits en attente" value={withdrawalsPending} />
      </div>
      <SectionTitle>Ce mois-ci</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <StatCard label="CA généré" value={formatEUR(monthRevenue)} />
        <StatCard label="Commandes" value={monthOrders.length} />
      </div>
    </div>
  );
}

// Écran admin des candidatures partenaires — SEUL chemin réel vers le rôle
// partenaire. Aucune logique locale n'attribue jamais role='partner' ni ne
// crée partner_profiles ici : tout passe par les deux RPC de la V5, qui
// revérifient elles-mêmes (côté serveur) que l'appelant est bien admin et
// que le candidat est toujours dans un état valide.
function AdminPartnerApplications({ showToast }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingPartnerApplications();
      setApplications(data);
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(app) {
    setActioningId(app.id);
    try {
      await approvePartnerApplication(app.id);
      showToast(`Candidature de ${app.company_name} approuvée — le compte est maintenant partenaire.`);
      setExpandedId(null);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  async function reject(app) {
    const reason = rejectReason.trim();
    if (!reason) {
      showToast("Indique un motif de refus.", "error");
      return;
    }
    setActioningId(app.id);
    try {
      await rejectPartnerApplication(app.id, reason);
      showToast(`Candidature de ${app.company_name} refusée.`);
      setRejectingId(null);
      setRejectReason("");
      setExpandedId(null);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement des candidatures…</Card>;
  }

  if (applications.length === 0) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Aucune candidature en attente pour le moment.</Card>;
  }

  return (
    <div>
      {applications.map((app) => {
        const isOpen = expandedId === app.id;
        const isActioning = actioningId === app.id;
        const name = app.applicant ? `${app.applicant.first_name} ${app.applicant.last_name}` : "—";
        return (
          <Card key={app.id} style={{ marginBottom: 14 }}>
            <div
              onClick={() => setExpandedId(isOpen ? null : app.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }}
            >
              <div>
                <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600 }}>{app.company_name}</div>
                <div style={{ color: C.dim, fontSize: 12.5 }}>{name} · déposée le {formatDate(app.submitted_at)}</div>
              </div>
              <StatusBadge status="attente" />
            </div>

            {isOpen && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13.5, marginBottom: 18 }}>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Nom</div>
                    {name}
                  </div>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Email</div>
                    {app.applicant?.email || "—"}
                  </div>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Entreprise</div>
                    {app.company_name}
                  </div>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Instagram</div>
                    {app.instagram_handle ? `@${app.instagram_handle}` : "—"}
                  </div>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Moyen de paiement</div>
                    {app.payment_type === "iban" ? "Virement bancaire (IBAN)" : "PayPal"}
                  </div>
                  <div>
                    <div style={{ color: C.dim, fontSize: 11.5, marginBottom: 2 }}>Statut</div>
                    <StatusBadge status="attente" />
                  </div>
                </div>

                {rejectingId === app.id ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px" }}>
                      <Field
                        label="Motif de refus"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Explique brièvement le motif"
                      />
                    </div>
                    <Btn variant="subtle" style={{ marginBottom: 14 }} onClick={() => reject(app)} disabled={isActioning}>
                      {isActioning ? "…" : "Confirmer le refus"}
                    </Btn>
                    <Btn
                      variant="ghost"
                      style={{ marginBottom: 14 }}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                      disabled={isActioning}
                    >
                      Annuler
                    </Btn>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={() => approve(app)} disabled={isActioning}>
                      {isActioning ? "…" : "Approuver"}
                    </Btn>
                    <Btn variant="subtle" onClick={() => setRejectingId(app.id)} disabled={isActioning}>
                      Refuser
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AdminPartners({ showToast }) {
  const [partners, setPartners] = useState([]);
  const [defaultRate, setDefaultRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([getAllPartners(), getSettings()]);
      setPartners(p);
      setDefaultRate(s.default_commission_rate);
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(p) {
    setTogglingId(p.id);
    try {
      await setPartnerActive(p.id, !p.isActive);
      showToast(p.isActive ? `${p.firstName} suspendu.` : `${p.firstName} réactivé.`);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement des partenaires…</Card>;
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <Table
        empty="Aucun partenaire pour le moment."
        head={["Partenaire", "Email", "Entreprise", "Code partenaire", "Taux commission", "Statut"]}
        rows={partners.map((p) => [
          `${p.firstName} ${p.lastName}`,
          p.email,
          p.companyName || "—",
          <PartnerCodeEditor showToast={showToast} partner={p} onChanged={load} />,
          <PartnerRateEditor showToast={showToast} partner={p} defaultRate={defaultRate} onChanged={load} />,
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <span
              style={{
                background: p.isActive ? "#12331e" : "#3a1414",
                color: p.isActive ? "#4ade80" : "#f87171",
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {p.isActive ? "Actif" : "Suspendu"}
            </span>
            <Btn
              variant="subtle"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => toggleActive(p)}
              disabled={togglingId === p.id}
            >
              {togglingId === p.id ? "…" : p.isActive ? "Suspendre" : "Réactiver"}
            </Btn>
          </div>,
        ])}
      />
    </Card>
  );
}

// Le taux personnalisé d'un partenaire (partner_profiles.commission_rate_override)
// est distinct du taux global — il ne se modifie QUE via la RPC dédiée
// admin_set_commission_rate(), jamais via un update de settings.
// partner.id est ici réellement profiles.id = partner_profiles.profile_id
// (renvoyé tel quel par getAllPartners()) — exactement ce qu'attend p_partner_id.
// Code partenaire — attribué/modifié manuellement par l'admin, jamais
// généré automatiquement. Passe exclusivement par la RPC dédiée
// admin_set_partner_code(), qui empêche les codes vides et les doublons
// côté serveur (source de vérité, pas une simple vérification en JS).
function PartnerCodeEditor({ showToast, partner, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(partner.partnerCode || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const clean = value.trim();
    if (!clean) {
      showToast("Le code partenaire ne peut pas être vide.", "error");
      return;
    }
    setSaving(true);
    try {
      await setPartnerCode(partner.id, clean);
      showToast(`Code de ${partner.firstName} défini : ${clean.toUpperCase()}.`);
      setEditing(false);
      if (onChanged) await onChanged();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div>
        {partner.partnerCode ? (
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{partner.partnerCode}</div>
        ) : (
          <div style={{ color: "#e0b84a", fontSize: 12, marginBottom: 6 }}>Aucun code — à définir</div>
        )}
        <Btn variant="subtle" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setEditing(true)}>
          {partner.partnerCode ? "Modifier" : "Attribuer un code"}
        </Btn>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="STUDIOX"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        style={{ width: 100, background: C.black2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12.5 }}
      />
      <Btn variant="subtle" style={{ padding: "5px 10px", fontSize: 11 }} onClick={save} disabled={saving}>
        {saving ? "…" : "Enregistrer"}
      </Btn>
      <Btn variant="ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setEditing(false)} disabled={saving}>
        Annuler
      </Btn>
    </div>
  );
}

function PartnerRateEditor({ showToast, partner, defaultRate, onChanged }) {
  const [value, setValue] = useState(partner.commissionRateOverride != null ? String(partner.commissionRateOverride) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    let parsed = null;
    if (value.trim() !== "") {
      parsed = parseFloat(value);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        showToast("Taux invalide (entre 0 et 100).", "error");
        return;
      }
    }
    setSaving(true);
    try {
      await setPartnerCommissionRate(partner.id, parsed);
      showToast(
        parsed === null
          ? `${partner.firstName} utilise à nouveau le taux par défaut (${defaultRate}%).`
          : `Taux personnalisé de ${partner.firstName} mis à jour : ${parsed}%.`
      );
      if (onChanged) await onChanged();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 6, fontSize: 12.5 }}>
        {partner.commissionRateOverride != null ? (
          <span style={{ color: C.red, fontWeight: 700 }}>{partner.commissionRateOverride}% (personnalisé)</span>
        ) : (
          <span style={{ color: C.dim }}>{defaultRate != null ? `${defaultRate}% (défaut)` : "…"}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={defaultRate != null ? String(defaultRate) : ""}
          style={{ width: 62, background: C.black2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12.5 }}
        />
        <Btn variant="subtle" style={{ padding: "5px 10px", fontSize: 11 }} onClick={save} disabled={saving}>
          {saving ? "…" : "Enregistrer"}
        </Btn>
      </div>
    </div>
  );
}

function AdminClients({ showToast }) {
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [codeUsages, setCodeUsages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, o, cu] = await Promise.all([getAllClients(), getAllOrders(), getAllPartnerCodeUsages()]);
        setClients(c);
        setOrders(o);
        setCodeUsages(cu);
      } catch (e) {
        showToast(translateRpcError(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const latestCodeFor = (clientId) => codeUsages.find((u) => u.client_id === clientId) || null;

  const orderStatsFor = (clientId) => {
    const theirs = orders.filter((o) => o.client_id === clientId);
    const total = theirs.filter((o) => o.status !== "annulee").reduce((sum, o) => sum + Number(o.amount), 0);
    return { count: theirs.length, total };
  };

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement des clients…</Card>;
  }

  return (
    <div>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 22 }}>
        <Table
          empty="Aucun client inscrit pour le moment."
          head={["Client", "Email", "Date d'inscription", "Statut", "Dernier code utilisé", "Commandes", "Total commandé"]}
          rows={clients.map((c) => {
            const stats = orderStatsFor(c.id);
            const usage = latestCodeFor(c.id);
            return [
              `${c.first_name} ${c.last_name}`,
              c.email,
              formatDate(c.created_at),
              c.is_active ? "Actif" : "Suspendu",
              usage ? usage.code_used : "—",
              stats.count,
              formatEUR(stats.total),
            ];
          })}
        />
      </Card>

      <SectionTitle>Historique des commandes clients</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucune commande liée à un compte client pour le moment."
          head={["Date", "Client", "Code", "Montant", "Statut"]}
          rows={orders
            .filter((o) => o.client_id)
            .map((o) => {
              const c = clients.find((c) => c.id === o.client_id);
              return [
                formatDate(o.created_at),
                c ? `${c.first_name} ${c.last_name}` : "—",
                o.partner_code_used,
                formatEUR(o.amount),
                <StatusBadge status={o.status} />,
              ];
            })}
        />
      </Card>
    </div>
  );
}

const DOC_TYPES = { devis: "📄 Devis", facture: "🧾 Facture", autre: "📎 Autre document" };
const ALLOWED_DOC_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOC_SIZE_BYTES = 10485760; // 10 Mo — identique à la limite du bucket Storage V5

// Upload réel en 2 temps (voir addOrderDocument dans api.js) : la ligne de
// métadonnées ET le fichier réel dans Supabase Storage. Chargé uniquement
// à l'ouverture (pas de préchargement pour chaque commande de la liste).
function SaleDocuments({ orderId, showToast }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState("devis");
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await getOrderDocuments(orderId));
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!ALLOWED_DOC_MIME_TYPES.includes(file.type)) {
      showToast("Type de fichier non autorisé (PDF, JPEG ou PNG uniquement).", "error");
      setInputKey((k) => k + 1);
      return;
    }
    if (file.size > MAX_DOC_SIZE_BYTES) {
      showToast("Fichier trop volumineux (10 Mo maximum).", "error");
      setInputKey((k) => k + 1);
      return;
    }
    setUploading(true);
    try {
      await addOrderDocument(orderId, docType, file);
      showToast("Document ajouté.");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setUploading(false);
      setInputKey((k) => k + 1);
    }
  }

  async function removeDoc(id) {
    try {
      await deleteOrderDocument(id);
      showToast("Document supprimé.");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    }
  }

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", color: C.chrome1, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>
        📁 {open && docs.length > 0 ? `${docs.length} document${docs.length > 1 ? "s" : ""}` : "Documents"}
      </button>
      {open && (
        <div style={{ marginTop: 8, minWidth: 230, background: C.black2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
          {loading ? (
            <div style={{ color: "#555", fontSize: 11.5 }}>Chargement…</div>
          ) : docs.length === 0 ? (
            <div style={{ color: "#555", fontSize: 11.5, marginBottom: 8 }}>Aucun document.</div>
          ) : (
            docs.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, marginBottom: 6, gap: 6 }}>
                <span>
                  {DOC_TYPES[d.doc_type] || "📎"} {d.file_name} <span style={{ color: "#666" }}>({formatDate(d.uploaded_at)})</span>
                </span>
                <button onClick={() => removeDoc(d.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}>
                  Suppr.
                </button>
              </div>
            ))
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={uploading}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12 }}
            >
              <option value="devis">📄 Devis</option>
              <option value="facture">🧾 Facture</option>
              <option value="autre">📎 Autre document</option>
            </select>
            <input
              key={inputKey}
              type="file"
              accept={ALLOWED_DOC_MIME_TYPES.join(",")}
              onChange={handleFile}
              disabled={uploading}
              style={{ fontSize: 11, color: C.white }}
            />
            {uploading && <div style={{ color: C.dim, fontSize: 11 }}>Envoi en cours…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSales({ showToast }) {
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const [clientId, setClientId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);

  const [cancelingId, setCancelingId] = useState(null);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelCustom, setCancelCustom] = useState("");
  const [actioningId, setActioningId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, o, s] = await Promise.all([getAllClients(), getAllPartners(), getAllOrders(), getSettings()]);
      setClients(c);
      setPartners(p);
      setOrders(o);
      setSettings(s);
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPartner = partners.find((p) => p.id === partnerId);
  const defaultRate = settings?.default_commission_rate ?? 0;
  const discountRate = settings?.client_discount_rate ?? 0;
  const effectiveRate = selectedPartner ? selectedPartner.commissionRateOverride ?? defaultRate : defaultRate;
  const amt = parseFloat(amount) || 0;
  const previewDiscount = amount ? (amt * discountRate) / 100 : 0;
  const previewClientPaid = amount ? amt - previewDiscount : 0;
  const previewCommission = amount ? (amt * effectiveRate) / 100 : 0;

  // Seuls client_id, partner_id et amount sont transmis : partner_code_used,
  // client_discount_rate, client_paid_amount, status et la commission sont
  // TOUS calculés/figés côté serveur (trigger fn_before_order_insert +
  // fn_create_commission) — jamais recalculés ici, l'aperçu ci-dessous n'est
  // qu'indicatif.
  async function addSale(e) {
    e.preventDefault();
    if (!partnerId || !amount || amt <= 0) {
      showToast("Choisis un partenaire et un montant valide.", "error");
      return;
    }
    setCreating(true);
    try {
      await createOrder({ clientId: clientId || null, partnerId, amount: amt });
      showToast("Commande ajoutée avec succès.");
      setAmount("");
      setPartnerId("");
      setClientId("");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setCreating(false);
    }
  }

  async function validateSaleAction(o) {
    setActioningId(o.id);
    try {
      await validateOrder(o.id);
      showToast("Commande validée.");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  function openCancel(id) {
    setCancelingId(id);
    setCancelReason(CANCEL_REASONS[0]);
    setCancelCustom("");
  }

  async function confirmCancelAction(o) {
    const reason = cancelReason === "Autre" ? cancelCustom.trim() || "Autre" : cancelReason;
    setActioningId(o.id);
    try {
      await cancelOrder(o.id, reason);
      showToast("Commande annulée.");
      setCancelingId(null);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  const partnerName = (o) => (o.partner ? `${o.partner.first_name} ${o.partner.last_name}` : "—");
  const clientName = (o) => (o.client ? `${o.client.first_name} ${o.client.last_name}` : "—");

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement des commandes…</Card>;
  }

  return (
    <div>
      <Card style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Ajouter une commande manuellement</div>
        <form onSubmit={addSale}>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginBottom: 6 }}>Client existant (facultatif)</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ width: "100%", background: C.black2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.white, fontSize: 14.5 }}
            >
              <option value="">— Aucun compte client (commande manuelle) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} ({c.email})
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginBottom: 6 }}>Partenaire / code utilisé</span>
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                style={{ width: "100%", background: C.black2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.white, fontSize: 14.5 }}
              >
                <option value="">— Sélectionner —</option>
                {partners
                  .filter((p) => p.partnerCode)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.partnerCode})
                    </option>
                  ))}
              </select>
            </label>
            <Field label="Montant commande (€)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" />
          </div>
          <div style={{ color: C.dim, fontSize: 13, marginBottom: 6 }}>
            Aperçu — remise client ({discountRate}%) : <span style={{ color: C.white }}>{formatEUR(previewDiscount)}</span> — client paierait {formatEUR(previewClientPaid)}
          </div>
          <div style={{ color: C.dim, fontSize: 13, marginBottom: 4 }}>
            Aperçu — commission ({effectiveRate}%{selectedPartner?.commissionRateOverride != null ? " — taux personnalisé" : " — taux par défaut"}) :{" "}
            <span style={{ color: C.red, fontWeight: 700 }}>{formatEUR(previewCommission)}</span>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 14 }}>
            Aperçu indicatif — les montants officiels sont ceux calculés par le serveur juste après la création.
          </div>
          <Btn type="submit" disabled={partners.filter((p) => p.partnerCode).length === 0 || creating}>
            {creating ? "Ajout…" : "Ajouter la commande"}
          </Btn>
          {partners.length === 0 && (
            <div style={{ color: "#e0b84a", fontSize: 12.5, marginTop: 10 }}>Aucun partenaire — approuve d'abord une candidature partenaire.</div>
          )}
          {partners.length > 0 && partners.filter((p) => p.partnerCode).length === 0 && (
            <div style={{ color: "#e0b84a", fontSize: 12.5, marginTop: 10 }}>
              Aucun partenaire n'a encore de code attribué — vas dans l'onglet Partenaires pour en attribuer un avant de créer une commande.
            </div>
          )}
        </form>
      </Card>

      <SectionTitle>Toutes les commandes</SectionTitle>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table
          empty="Aucune commande enregistrée."
          head={["Date", "Client", "Partenaire", "Code", "Montant", "Remise", "Commission", "Documents", "Statut", "Actions"]}
          rows={orders.map((o) => [
            formatDate(o.created_at),
            clientName(o),
            partnerName(o),
            o.partner_code_used,
            formatEUR(o.amount),
            `-${o.client_discount_rate}%`,
            o.commission ? `${formatEUR(o.commission.commission_amount)} (${o.commission.commission_rate}%)` : "—",
            <SaleDocuments orderId={o.id} showToast={showToast} />,
            <div>
              <StatusBadge status={o.status} />
              {o.cancel_reason && <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>{o.cancel_reason}</div>}
            </div>,
            o.status === "attente" ? (
              cancelingId === o.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 190 }}>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    style={{ background: C.black2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12 }}
                  >
                    {CANCEL_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {cancelReason === "Autre" && (
                    <input
                      value={cancelCustom}
                      onChange={(e) => setCancelCustom(e.target.value)}
                      placeholder="Motif"
                      style={{ background: C.black2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12 }}
                    />
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn variant="danger" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => confirmCancelAction(o)} disabled={actioningId === o.id}>
                      {actioningId === o.id ? "…" : "Confirmer"}
                    </Btn>
                    <Btn variant="subtle" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setCancelingId(null)} disabled={actioningId === o.id}>
                      Retour
                    </Btn>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="subtle" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => validateSaleAction(o)} disabled={actioningId === o.id}>
                    {actioningId === o.id ? "…" : "Valider"}
                  </Btn>
                  <Btn variant="danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openCancel(o.id)} disabled={actioningId === o.id}>
                    Annuler
                  </Btn>
                </div>
              )
            ) : (
              "—"
            ),
          ])}
        />
      </Card>
    </div>
  );
}

// Affiche le moyen de paiement d'UN retrait précis (withdrawals.payment_method_id).
// PayPal : l'email est directement lisible (non sensible). IBAN : jamais
// préchargé — reveal_iban() n'est appelé qu'au clic explicite, chaque appel
// étant audité côté serveur.
function AdminPaymentMethodReveal({ paymentMethodId, showToast }) {
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealedIban, setRevealedIban] = useState(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setMethod(await getPaymentMethodById(paymentMethodId));
      } catch (e) {
        showToast(translateRpcError(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentMethodId, showToast]);

  async function toggleReveal() {
    if (revealedIban) {
      setRevealedIban(null);
      return;
    }
    setRevealing(true);
    try {
      setRevealedIban(await revealIban(paymentMethodId));
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setRevealing(false);
    }
  }

  if (loading) return <span style={{ color: C.dim, fontSize: 12 }}>…</span>;
  if (!method) return "—";

  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 2 }}>{method.method_type === "iban" ? "Virement bancaire" : "PayPal"}</div>
      <div style={{ fontSize: 12.5 }}>
        {method.method_type === "paypal" ? method.paypal_email : revealedIban || "IBAN masqué"}
      </div>
      {method.method_type === "iban" && (
        <button
          onClick={toggleReveal}
          disabled={revealing}
          style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 10.5, textDecoration: "underline", padding: 0, marginTop: 2 }}
        >
          {revealing ? "…" : revealedIban ? "Masquer" : "Voir en clair"}
        </button>
      )}
    </div>
  );
}

function AdminWithdrawals({ showToast }) {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refusingId, setRefusingId] = useState(null);
  const [reason, setReason] = useState("");
  const [actioningId, setActioningId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWithdrawals(await getAllWithdrawals());
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const partnerName = (w) => (w.partner ? `${w.partner.first_name} ${w.partner.last_name}` : "—");

  // Le statut officiel, la validité de la transition et l'obligation d'un
  // motif en cas de refus sont TOUS vérifiés par admin_process_withdrawal()
  // côté serveur — le frontend ne fait que relayer le résultat.
  async function markPaid(w) {
    setActioningId(w.id);
    try {
      await processWithdrawal(w.id, "payee");
      showToast("Retrait marqué comme payé.");
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  function openRefuse(id) {
    setRefusingId(id);
    setReason("");
  }

  async function confirmRefuse(w) {
    const motif = reason.trim();
    if (!motif) {
      showToast("Indique un motif de refus.", "error");
      return;
    }
    setActioningId(w.id);
    try {
      await processWithdrawal(w.id, "refusee", motif);
      showToast("Retrait refusé.");
      setRefusingId(null);
      await load();
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setActioningId(null);
    }
  }

  if (loading) {
    return <Card style={{ color: C.dim, textAlign: "center" }}>Chargement des retraits…</Card>;
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <Table
        empty="Aucune demande de retrait."
        head={["Date", "Partenaire", "Montant", "Moyen de paiement", "Statut", "Actions"]}
        rows={withdrawals.map((w) => [
          formatDate(w.requested_at),
          partnerName(w),
          formatEUR(w.amount),
          <AdminPaymentMethodReveal paymentMethodId={w.payment_method_id} showToast={showToast} />,
          <div>
            <StatusBadge status={w.status} />
            {w.refuse_reason && <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>{w.refuse_reason}</div>}
          </div>,
          w.status === "attente" ? (
            refusingId === w.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 190 }}>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motif du refus"
                  style={{ background: C.black2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.white, fontSize: 12 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="danger" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => confirmRefuse(w)} disabled={actioningId === w.id}>
                    {actioningId === w.id ? "…" : "Confirmer"}
                  </Btn>
                  <Btn variant="subtle" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setRefusingId(null)} disabled={actioningId === w.id}>
                    Retour
                  </Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="subtle" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => markPaid(w)} disabled={actioningId === w.id}>
                  {actioningId === w.id ? "…" : "Marquer payé"}
                </Btn>
                <Btn variant="danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openRefuse(w.id)} disabled={actioningId === w.id}>
                  Refuser
                </Btn>
              </div>
            )
          ) : (
            "—"
          ),
        ])}
      />
    </Card>
  );
}

function AdminSettings({ showToast }) {
  const [rate, setRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [min, setMin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setRate(String(s.default_commission_rate));
        setDiscount(String(s.client_discount_rate));
        setMin(String(s.min_withdrawal));
      } catch (e) {
        showToast(translateRpcError(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  async function save() {
    setSaving(true);
    try {
      await updateSettings({
        defaultCommissionRate: parseFloat(rate) || 0,
        clientDiscountRate: parseFloat(discount) || 0,
        minWithdrawal: parseFloat(min) || 0,
      });
      showToast("Paramètres enregistrés. Les commandes déjà enregistrées gardent leurs anciennes valeurs.");
    } catch (e) {
      showToast(translateRpcError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card style={{ maxWidth: 460, color: C.dim }}>Chargement des réglages…</Card>;
  }

  return (
    <Card style={{ maxWidth: 460 }}>
      <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Paramètres du programme</div>
      <Field label="Commission partenaire par défaut (%)" type="number" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} />
      <Field label="Remise client par défaut (%)" type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      <Field label="Minimum de retrait (€)" type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} />
      <Btn onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Btn>
    </Card>
  );
}
