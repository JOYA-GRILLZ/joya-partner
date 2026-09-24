import { supabase } from "./supabaseClient";

/* ============================================================
   AUTHENTIFICATION (étape 2)
   Les fonctions de données métier (commandes, commissions, retraits,
   candidatures, etc.) seront ajoutées ici aux étapes 3 à 6.
   ============================================================ */

// Clé sessionStorage (PAS window.storage — une API navigateur standard,
// propre à cet onglet, jamais synchronisée nulle part) utilisée uniquement
// pour ponter le délai entre l'inscription et la confirmation d'email :
// use_partner_code() exige d'être authentifié, ce qui n'est vrai qu'après
// confirmation si celle-ci est activée sur le projet Supabase.
const PENDING_CODE_KEY = "joya_pending_referral_code";

export async function signUpClient(email, password, firstName, lastName, referralCode) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      // Sans ceci, Supabase utilise le "Site URL" global du dashboard, qui
      // ne s'adapte pas automatiquement selon qu'on est en dev (localhost)
      // ou en prod (domaine Vercel) — d'où le lien de confirmation qui
      // pouvait pointer vers le mauvais endroit. Ce domaine doit aussi
      // figurer dans Authentication → URL Configuration → Redirect URLs
      // côté dashboard Supabase, sinon Supabase refusera la redirection
      // avant même d'atteindre l'app.
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;

  if (referralCode) {
    if (data.session) {
      // Email déjà confirmé (ou confirmation désactivée sur le projet) :
      // une session existe immédiatement, on applique le code tout de suite.
      const { error: codeError } = await supabase.rpc("use_partner_code", {
        p_code: referralCode,
        p_context: "signup",
      });
      if (codeError) throw codeError;
    } else {
      // Pas de session immédiate (confirmation email requise) : on garde le
      // code de côté pour l'appliquer automatiquement à la première connexion.
      sessionStorage.setItem(PENDING_CODE_KEY, referralCode);
    }
  }

  return data;
}

export async function applyPendingReferralCodeIfAny() {
  const code = sessionStorage.getItem(PENDING_CODE_KEY);
  if (!code) return null;
  sessionStorage.removeItem(PENDING_CODE_KEY);
  const { error } = await supabase.rpc("use_partner_code", {
    p_code: code,
    p_context: "signup",
  });
  if (error) throw error;
  return code;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// Reflète directement current_app_role() côté base : renvoie 'client',
// 'partner', 'admin', ou null si le compte est désactivé ou introuvable.
// C'est la V5 qui décide, jamais une hypothèse côté frontend.
export async function getCurrentRole() {
  const { data, error } = await supabase.rpc("current_app_role");
  if (error) throw error;
  return data;
}

// Traduit les messages d'erreur Supabase les plus courants en français
// compréhensible, sans exposer de détail technique inutile.
export function translateAuthError(error) {
  const msg = error?.message || "";
  if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (msg.includes("User already registered")) return "Un compte existe déjà avec cet email.";
  if (msg.includes("Password should be at least")) return "Le mot de passe est trop court (6 caractères minimum).";
  if (msg.includes("Code partenaire invalide")) return "Ce code de parrainage est invalide.";
  return msg || "Une erreur est survenue.";
}

// Réglages globaux (taux de remise client, etc.) — lisibles par tout
// utilisateur connecté (settings_select_all_authenticated).
export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

// Modifie les 3 réglages globaux de la V5. Pas de RPC dédiée : la V5 protège
// directement la table via RLS (settings_update_admin, exige
// current_app_role() = 'admin') — un update Postgrest classique suffit,
// refusé nativement par la base pour tout non-admin.
export async function updateSettings({ defaultCommissionRate, clientDiscountRate, minWithdrawal }) {
  const { data, error } = await supabase
    .from("settings")
    .update({
      default_commission_rate: defaultCommissionRate,
      client_discount_rate: clientDiscountRate,
      min_withdrawal: minWithdrawal,
    })
    .eq("id", 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Taux de commission PERSONNALISÉ d'un partenaire précis — distinct du taux
// global ci-dessus. Écrit exclusivement partner_profiles.commission_rate_override
// via la RPC dédiée (jamais un update direct de la table).
export async function setPartnerCommissionRate(partnerId, rate) {
  const { data, error } = await supabase.rpc("admin_set_commission_rate", {
    p_partner_id: partnerId,
    p_rate: rate,
  });
  if (error) throw error;
  return data;
}

/* ============================================================
   ESPACE CLIENT (étape 3)
   Chaque fonction lit/écrit UNIQUEMENT via les tables, vues et RPC déjà
   prévues par la V5 — la RLS fait le filtrage, jamais un filtre côté front.
   ============================================================ */

// Profil de l'utilisateur connecté (colonnes non sensibles uniquement,
// conformément au GRANT de la V5 — profiles_select_own_or_admin).
export async function getMyProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, role, is_active, created_at")
    .single();
  if (error) throw error;
  return data;
}

// Dernier code partenaire utilisé par le client (signup ou nouvelle
// commande) — reflète littéralement partner_code_usages, sans rien inventer.
export async function getMyLatestPartnerCodeUsage() {
  const { data, error } = await supabase
    .from("partner_code_usages")
    .select("partner_id, code_used, context, used_at")
    .order("used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Nom d'affichage du partenaire : via partner_directory, la seule vue
  // consultable par un client (jamais partner_profiles directement, RLS
  // réservée aux partenaires/admin).
  const { data: partner, error: partnerError } = await supabase
    .from("partner_directory")
    .select("id, company_name, partner_code")
    .eq("id", data.partner_id)
    .maybeSingle();
  if (partnerError) throw partnerError;

  return { ...data, partner };
}

// Applique un nouveau code partenaire pour une prochaine commande (le
// client peut en changer à chaque fois — voir use_partner_code côté V5).
export async function useNewOrderCode(code) {
  const { data, error } = await supabase.rpc("use_partner_code", {
    p_code: code,
    p_context: "new_order_intent",
  });
  if (error) throw error;
  return data;
}

// Historique réel des commandes du client — RLS filtre déjà sur
// client_id = auth.uid(), aucun filtre supplémentaire nécessaire ici.
// partner_code_used est déjà figé sur la commande, pas besoin de jointure.
export async function getMyOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("id, amount, client_discount_rate, client_paid_amount, partner_code_used, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Candidature partenaire la plus récente du client (s'il en a déposé une).
export async function getMyPartnerApplication() {
  const { data, error } = await supabase
    .from("partner_applications")
    .select("id, company_name, instagram_handle, payment_type, status, rejection_reason, submitted_at, reviewed_at")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Dépôt réel d'une candidature partenaire — submit_partner_application()
// vérifie elle-même le rôle, l'absence de candidature en attente, et les
// champs obligatoires ; on relaie simplement ses erreurs.
export async function submitPartnerApplication({ companyName, instagramHandle, paymentType, paypal, iban }) {
  const { data, error } = await supabase.rpc("submit_partner_application", {
    p_company_name: companyName,
    p_instagram_handle: instagramHandle || null,
    p_payment_type: paymentType,
    p_paypal: paymentType === "paypal" ? paypal : null,
    p_iban: paymentType === "iban" ? iban : null,
  });
  if (error) throw error;
  return data;
}

// Traduit les messages d'erreur renvoyés par les fonctions RPC de la V5.
export function translateRpcError(error) {
  const msg = error?.message || "";
  if (msg.includes("Code partenaire invalide")) return "Ce code partenaire n'existe pas ou n'est plus actif.";
  if (msg.includes("Une candidature est déjà en attente")) return "Tu as déjà une candidature en attente de validation.";
  if (msg.includes("Le nom de l'entreprise est obligatoire")) return "Le nom de l'entreprise est obligatoire.";
  if (msg.includes("Adresse PayPal requise")) return "Merci de renseigner ton adresse PayPal.";
  if (msg.includes("IBAN requis")) return "Merci de renseigner ton IBAN.";
  if (msg.includes("Cette candidature a déjà été traitée")) return "Cette candidature a déjà été traitée entre-temps.";
  if (msg.includes("ce compte n'est plus un client")) return "Ce candidat n'est plus un compte client (rôle changé entre-temps).";
  if (msg.includes("ce compte candidat est désactivé")) return "Ce compte candidat est désactivé.";
  if (msg.includes("Un motif de refus est obligatoire")) return "Un motif de refus est obligatoire.";
  if (msg.includes("Le code partenaire ne peut pas être vide")) return "Le code partenaire ne peut pas être vide.";
  if (msg.includes("Ce code partenaire est déjà utilisé")) return "Ce code est déjà utilisé par un autre partenaire.";
  return msg || "Une erreur est survenue.";
}

/* ============================================================
   ESPACE ADMIN — candidatures partenaires (étape 6)
   ============================================================ */

// Candidatures en attente + identité du candidat (jointe séparément depuis
// profiles, sans dépendre du nom exact d'une contrainte de clé étrangère).
// RLS (applications_select_own_or_admin) laisse déjà un admin tout voir.
export async function getPendingPartnerApplications() {
  const { data: apps, error } = await supabase
    .from("partner_applications")
    .select("id, applicant_id, company_name, instagram_handle, payment_type, status, submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  if (!apps || apps.length === 0) return [];

  const applicantIds = [...new Set(apps.map((a) => a.applicant_id))];
  const { data: applicants, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", applicantIds);
  if (profileError) throw profileError;

  const byId = Object.fromEntries((applicants || []).map((p) => [p.id, p]));
  return apps.map((a) => ({ ...a, applicant: byId[a.applicant_id] || null }));
}

// Approbation réelle — la RPC vérifie elle-même le rôle admin de
// l'appelant ET le rôle/statut actuel du candidat ; le frontend ne décide
// jamais rien, il ne fait que relayer le résultat ou l'erreur.
export async function approvePartnerApplication(applicationId) {
  const { data, error } = await supabase.rpc("admin_approve_partner_application", {
    p_application_id: applicationId,
  });
  if (error) throw error;
  return data;
}

// Rejet réel — même principe, motif obligatoire vérifié aussi côté serveur.
export async function rejectPartnerApplication(applicationId, reason) {
  const { data, error } = await supabase.rpc("admin_reject_partner_application", {
    p_application_id: applicationId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

/* ============================================================
   ESPACE ADMIN — liste des partenaires (étape 7)
   ============================================================ */

// Tous les partenaires (actifs ET inactifs — un admin doit pouvoir
// réactiver quelqu'un). Deux requêtes séparées (partner_profiles + profiles)
// plutôt qu'une jointure PostgREST, pour ne dépendre d'aucun nom de
// contrainte de clé étrangère. Ne renvoie QUE des colonnes qui existent
// réellement : company_name, instagram_handle, partner_code,
// commission_rate_override (partner_profiles) ; first_name, last_name,
// email, is_active (profiles). Pas de "taux effectif" ici : il dépend de
// settings.default_commission_rate, à combiner côté appelant avec getSettings().
export async function getAllPartners() {
  const { data: partnerProfiles, error } = await supabase
    .from("partner_profiles")
    .select("profile_id, company_name, instagram_handle, partner_code, commission_rate_override, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!partnerProfiles || partnerProfiles.length === 0) return [];

  const ids = partnerProfiles.map((p) => p.profile_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, is_active")
    .in("id", ids);
  if (profileError) throw profileError;

  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  return partnerProfiles.map((pp) => {
    const profile = byId[pp.profile_id] || null;
    return {
      // id = profiles.id = partner_profiles.profile_id : c'est exactement
      // ce que p_target_id (admin_set_active) et p_partner_id
      // (admin_set_commission_rate) attendent.
      id: pp.profile_id,
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      email: profile?.email ?? "",
      isActive: profile?.is_active ?? true,
      companyName: pp.company_name,
      instagramHandle: pp.instagram_handle,
      partnerCode: pp.partner_code,
      commissionRateOverride: pp.commission_rate_override,
      createdAt: pp.created_at,
    };
  });
}

// Suspension/réactivation réelle — passe exclusivement par la RPC dédiée
// (jamais un update direct de profiles.is_active depuis le frontend).
export async function setPartnerActive(partnerId, active) {
  const { data, error } = await supabase.rpc("admin_set_active", {
    p_target_id: partnerId,
    p_active: active,
  });
  if (error) throw error;
  return data;
}

// Attribution/modification manuelle du code partenaire par l'admin — le
// code n'est plus généré automatiquement à l'approbation (voir
// admin_approve_partner_application côté V5, désormais mise à jour).
export async function setPartnerCode(partnerId, code) {
  const { data, error } = await supabase.rpc("admin_set_partner_code", {
    p_partner_id: partnerId,
    p_code: code,
  });
  if (error) throw error;
  return data;
}

// Helper interne (non exporté) : récupère un lot de profils par id, sous
// forme de dictionnaire { id: profil }. Réutilisé par plusieurs fonctions
// admin ci-dessous pour joindre une identité sans jamais supposer de nom
// de contrainte de clé étrangère.
async function getProfilesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, is_active")
    .in("id", uniqueIds);
  if (error) throw error;
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

/* ============================================================
   ESPACE PARTENAIRE (identité, solde, statistiques)
   ============================================================ */

// Identité + profil partenaire du compte connecté (fusion profiles +
// partner_profiles, RLS restreignant chacune à sa propre ligne).
export async function getMyPartnerProfile() {
  const [{ data: profile, error: e1 }, { data: pp, error: e2 }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, is_active").single(),
    supabase
      .from("partner_profiles")
      .select("profile_id, company_name, instagram_handle, partner_code, commission_rate_override, created_at")
      .single(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { ...profile, ...pp };
}

// Solde — calcul financier ENTIÈREMENT server-side (vue v_partner_balances
// via la RPC), jamais recalculé en JS. Sans argument, get_my_balance()
// renvoie la ligne du partenaire connecté.
export async function getMyPartnerBalance() {
  const { data, error } = await supabase.rpc("get_my_balance");
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

// Statistiques de commandes — même principe, calcul server-side.
export async function getMyPartnerOrderStats() {
  const { data, error } = await supabase.rpc("get_my_order_stats");
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

// Identité des clients liés au partenaire (via ses commandes ou ses codes
// utilisés) — passe par la vue dédiée partner_related_clients, seule
// autorisée : un partenaire n'a pas accès direct à profiles pour un client.
export async function getMyReferredClients() {
  const { data, error } = await supabase.from("partner_related_clients").select("id, first_name, last_name");
  if (error) throw error;
  return data;
}

// Propres commandes du partenaire (RLS : orders_select le restreint déjà à
// partner_id = auth.uid()).
export async function getMyPartnerOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("id, client_id, amount, client_discount_rate, client_paid_amount, partner_code_used, status, cancel_reason, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Commissions officielles du partenaire — jamais recalculées, uniquement
// relues (RLS commissions_select les restreint déjà à ses propres commandes).
export async function getMyCommissions() {
  const { data, error } = await supabase.from("commissions").select("order_id, commission_rate, commission_amount, status");
  if (error) throw error;
  return data;
}

/* ============================================================
   MOYEN DE PAIEMENT (partenaire)
   ============================================================ */

// Moyen de paiement courant du partenaire connecté — iban_encrypted n'est
// jamais sélectionné (exclu du GRANT côté V5) : seul reveal_iban() y donne
// accès, à la demande explicite, jamais préchargé.
export async function getMyPaymentMethod() {
  const { data, error } = await supabase
    .from("partner_payment_methods")
    .select("id, partner_id, method_type, paypal_email, is_current, created_at")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setMyPaymentMethod({ type, paypal, iban }) {
  const { data, error } = await supabase.rpc("set_partner_payment_method", {
    p_type: type,
    p_paypal: type === "paypal" ? paypal : null,
    p_iban: type === "iban" ? iban : null,
  });
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

// Révélation en clair d'un IBAN — chaque appel est audité côté serveur
// (audit_logs). À n'appeler qu'à la demande explicite de l'utilisateur,
// jamais automatiquement au chargement d'un écran.
export async function revealIban(paymentMethodId) {
  const { data, error } = await supabase.rpc("reveal_iban", { p_payment_method_id: paymentMethodId });
  if (error) throw error;
  return data;
}

/* ============================================================
   RETRAITS — partenaire
   ============================================================ */

export async function getMyWithdrawals() {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("id, amount, status, refuse_reason, requested_at, processed_at")
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Le montant officiel, le solde disponible, le minimum, la concurrence et
// le statut sont TOUS déterminés par request_withdrawal() côté serveur —
// le frontend n'effectue qu'une validation UX basique (montant non vide,
// nombre positif) avant l'appel, jamais une vérification de solde en JS.
export async function requestWithdrawal(amount) {
  const { data, error } = await supabase.rpc("request_withdrawal", { p_amount: amount });
  if (error) throw error;
  return data;
}

/* ============================================================
   RETRAITS — admin
   ============================================================ */

export async function getAllWithdrawals() {
  const { data: rows, error } = await supabase
    .from("withdrawals")
    .select("id, partner_id, amount, status, refuse_reason, payment_method_id, requested_at, processed_at")
    .order("requested_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];
  const byId = await getProfilesByIds(rows.map((w) => w.partner_id));
  return rows.map((w) => ({ ...w, partner: byId[w.partner_id] || null }));
}

// Moyen de paiement PRÉCIS utilisé par un retrait donné (withdrawals.payment_method_id) —
// pas nécessairement le moyen "courant" du partenaire s'il en a changé depuis.
// Mêmes colonnes non sensibles, jamais iban_encrypted.
export async function getPaymentMethodById(paymentMethodId) {
  const { data, error } = await supabase
    .from("partner_payment_methods")
    .select("id, partner_id, method_type, paypal_email, is_current, created_at")
    .eq("id", paymentMethodId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Traitement réel — seule la RPC décide si la transition est valide
// (statut actuel, motif obligatoire en cas de refus, etc.).
export async function processWithdrawal(withdrawalId, newStatus, refuseReason = null) {
  const { data, error } = await supabase.rpc("admin_process_withdrawal", {
    p_withdrawal_id: withdrawalId,
    p_new_status: newStatus,
    p_refuse_reason: refuseReason,
  });
  if (error) throw error;
  return data;
}

/* ============================================================
   COMMANDES — admin
   ============================================================ */

// partner_code_used, client_discount_rate, client_paid_amount et status
// sont TOUS figés/calculés côté serveur (trigger fn_before_order_insert) —
// jamais recalculés ici, uniquement relus tels quels après insertion.
export async function getAllOrders() {
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, client_id, partner_id, partner_code_used, amount, client_discount_rate, client_paid_amount, status, cancel_reason, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const profilesById = await getProfilesByIds([...rows.map((o) => o.client_id), ...rows.map((o) => o.partner_id)]);

  const orderIds = rows.map((o) => o.id);
  const { data: commissions, error: cErr } = await supabase
    .from("commissions")
    .select("order_id, commission_rate, commission_amount, status")
    .in("order_id", orderIds);
  if (cErr) throw cErr;
  const commissionByOrder = Object.fromEntries((commissions || []).map((c) => [c.order_id, c]));

  return rows.map((o) => ({
    ...o,
    client: o.client_id ? profilesById[o.client_id] || null : null,
    partner: profilesById[o.partner_id] || null,
    // La commission OFFICIELLE — jamais recalculée, uniquement relue depuis
    // la table commissions (remplie automatiquement par fn_create_commission).
    commission: commissionByOrder[o.id] || null,
  }));
}

// Création réelle : seuls client_id (facultatif), partner_id et amount sont
// fournis. Tout le reste (partner_code_used, client_discount_rate, status,
// created_by, created_at) est calculé/figé par le trigger côté serveur,
// quelle que soit la valeur qu'on enverrait pour ces champs.
export async function createOrder({ clientId, partnerId, amount }) {
  const { data, error } = await supabase
    .from("orders")
    .insert({ client_id: clientId || null, partner_id: partnerId, amount })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function validateOrder(orderId) {
  const { data, error } = await supabase.rpc("admin_validate_order", { p_order_id: orderId });
  if (error) throw error;
  return data;
}

export async function cancelOrder(orderId, reason) {
  const { data, error } = await supabase.rpc("admin_cancel_order", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
  return data;
}

/* ============================================================
   CLIENTS — admin
   ============================================================ */

// Uniquement des colonnes réellement présentes dans profiles, filtrées sur
// role='client'. Rien d'inventé (pas de "total dépensé" stocké en base —
// calculé à l'affichage à partir de getAllOrders()).
export async function getAllClients() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, is_active, created_at")
    .eq("role", "client")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Dernier code partenaire utilisé par chaque client — reflète littéralement
// partner_code_usages (RLS : un admin voit tout). Utile pour afficher
// "partenaire actuel" sans rien inventer.
export async function getAllPartnerCodeUsages() {
  const { data, error } = await supabase
    .from("partner_code_usages")
    .select("client_id, partner_id, code_used, context, used_at")
    .order("used_at", { ascending: false });
  if (error) throw error;
  return data;
}

/* ============================================================
   RECHERCHE ADMIN (requêtes ciblées, pas de chargement global)
   ============================================================ */

// Recherche partenaires par nom/prénom (profiles) OU entreprise/code
// (partner_profiles) — deux tables distinctes, fusionnées par id. RLS :
// un admin voit tout dans les deux.
export async function searchPartners(query) {
  const clean = query.trim();
  if (!clean) return [];

  const [{ data: byCompanyCode, error: e1 }, { data: byName, error: e2 }] = await Promise.all([
    supabase
      .from("partner_profiles")
      .select("profile_id, company_name, partner_code")
      .or(`company_name.ilike.%${clean}%,partner_code.ilike.%${clean}%`)
      .limit(10),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "partner")
      .or(`first_name.ilike.%${clean}%,last_name.ilike.%${clean}%`)
      .limit(10),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const ids = [...new Set([...(byCompanyCode || []).map((m) => m.profile_id), ...(byName || []).map((m) => m.id)])];
  if (ids.length === 0) return [];

  const [{ data: pps, error: e3 }, { data: profs, error: e4 }] = await Promise.all([
    supabase.from("partner_profiles").select("profile_id, company_name, partner_code").in("profile_id", ids),
    supabase.from("profiles").select("id, first_name, last_name").in("id", ids),
  ]);
  if (e3) throw e3;
  if (e4) throw e4;
  const profById = Object.fromEntries((profs || []).map((p) => [p.id, p]));

  return (pps || []).map((pp) => ({
    id: pp.profile_id,
    companyName: pp.company_name,
    partnerCode: pp.partner_code,
    firstName: profById[pp.profile_id]?.first_name ?? "",
    lastName: profById[pp.profile_id]?.last_name ?? "",
  }));
}

// Recherche clients par nom/prénom/email — RLS profiles_select_own_or_admin
// laisse un admin tout voir.
export async function searchClients(query) {
  const clean = query.trim();
  if (!clean) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("role", "client")
    .or(`first_name.ilike.%${clean}%,last_name.ilike.%${clean}%,email.ilike.%${clean}%`)
    .limit(10);
  if (error) throw error;
  return data;
}

// Recherche commandes par code partenaire utilisé (identifiant réellement
// lisible/tapable par un humain — contrairement à un UUID de commande).
export async function searchOrders(query) {
  const clean = query.trim();
  if (!clean) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id, amount, partner_code_used, status, created_at")
    .ilike("partner_code_used", `%${clean}%`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

// RLS (notifications_select_own) restreint déjà strictement à
// recipient_id = auth.uid() — aucun filtre supplémentaire nécessaire, et
// aucun moyen pour un utilisateur de lire celles d'un autre.
export async function getMyNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, message, notif_type, related_order_id, related_withdrawal_id, is_read, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(ids) {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
  if (error) throw error;
}

/* ============================================================
   DOCUMENTS DE COMMANDE
   ============================================================ */

const DOCUMENTS_BUCKET = "order-documents";

export async function getOrderDocuments(orderId) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, order_id, doc_type, file_name, storage_path, mime_type, file_size_bytes, uploaded_at")
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Ajout réel en 2 temps : (1) admin_add_document() crée la ligne de
// métadonnées et génère storage_path côté serveur (jamais le frontend qui
// choisit le chemin) ; (2) upload du fichier réel à ce chemin exact. Si
// l'upload échoue, la ligne de métadonnées est annulée pour ne jamais
// laisser une entrée qui prétend avoir un fichier inexistant.
export async function addOrderDocument(orderId, docType, file) {
  const { data: doc, error: rpcError } = await supabase.rpc("admin_add_document", {
    p_order_id: orderId,
    p_doc_type: docType,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_file_size_bytes: file.size,
  });
  if (rpcError) throw rpcError;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(doc.storage_path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    try {
      await supabase.rpc("admin_delete_document", { p_document_id: doc.id });
    } catch {
      // best-effort ; l'erreur d'upload d'origine est celle qui remonte.
    }
    throw uploadError;
  }

  return doc;
}

// Suppression réelle : admin_delete_document() supprime la ligne et
// retourne le storage_path, puis on supprime le fichier réel dans Storage.
export async function deleteOrderDocument(documentId) {
  const { data: storagePath, error } = await supabase.rpc("admin_delete_document", { p_document_id: documentId });
  if (error) throw error;
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    if (removeError) {
      // La métadonnée est déjà supprimée en base (cohérent) ; le fichier
      // pourrait rester orphelin dans le bucket — signalé sans faire
      // échouer l'opération, la source de vérité (la base) reste cohérente.
      console.warn("Fichier Storage non supprimé :", removeError.message);
    }
  }
}
