require("dotenv").config();
const express  = require("express");
const axios    = require("axios");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbyka_9NNspo0RpNO2I-Tb3UEWQbr61qwkzmGX3YvNwt7YcBPrS9027d-Xu9vPjLiGIE/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || "";
const GMAIL_USER      = process.env.GMAIL_USER      || "contact@mohstechnologie.com";
const GMAIL_PASS      = process.env.GMAIL_PASS      || ""; // Mot de passe d'application Google

// ══════════════════════════════════════════════════════════════════════════════
// GMAIL SMTP — Transporteur Nodemailer
// ══════════════════════════════════════════════════════════════════════════════
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

// ══════════════════════════════════════════════════════════════════════════════
// GÉNÉRATION ID SÉCURISÉ  ex: MT-X7K2P
// ══════════════════════════════════════════════════════════════════════════════
function genererID() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MT-${code}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PACKS
// ══════════════════════════════════════════════════════════════════════════════
const PACKS = {
  "1": { nom: "Pack 1 – Essentiel",   telegram: 15000, whatsapp: 30000 },
  "2": { nom: "Pack 2 – Avancée",     telegram: 20000, whatsapp: 40000 },
  "3": { nom: "Pack 3 – Assistant",   telegram: 25000, whatsapp: 50000 },
  "4": { nom: "Pack 4 – Commercial",  telegram: 35000, whatsapp: 100000 },
};

// ══════════════════════════════════════════════════════════════════════════════
// APPEL GOOGLE SHEET
// ══════════════════════════════════════════════════════════════════════════════
async function callSheet(action, data = {}) {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }), redirect: "follow"
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch(e) {
    console.error("❌ Sheet:", e.message);
    return { status: "error", message: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
async function send(chatId, text, extra = {}) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "Markdown", ...extra
    });
  } catch(e) { console.error("❌ Telegram:", e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENVOI MAIL VIA GMAIL SMTP
// ══════════════════════════════════════════════════════════════════════════════
async function envoyerMailBienvenue({ email, nom, id, pack, montant, plateforme, date_fin, lienPaiement }) {
  if (!GMAIL_PASS) {
    console.log("⚠️ GMAIL_PASS non configuré — mail non envoyé");
    return false;
  }

  const lienHtml = lienPaiement
    ? `<p style="text-align:center;margin:30px 0;">
        <a href="${lienPaiement}" style="background:#F5A623;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          💳 Payer mon abonnement
        </a>
       </p>`
    : `<p style="color:#888;font-size:13px;text-align:center;padding:10px 20px;background:#fff8e1;border-radius:8px;">
        ⏳ Le lien de paiement sera disponible très prochainement. Nous vous contacterons dès son activation.
       </p>`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 40px 30px;text-align:center;">
            <h1 style="color:#F5A623;margin:0;font-size:28px;letter-spacing:2px;">⚙️ MOHS TECHNOLOGIE</h1>
            <p style="color:#aaa;margin:8px 0 0;font-size:14px;">Solutions Digitales & Bots Intelligents</p>
          </td>
        </tr>

        <!-- BIENVENUE -->
        <tr>
          <td style="padding:40px 40px 20px;">
            <h2 style="color:#1a1a2e;margin:0 0 16px;">Bienvenue, ${nom} ! 🎉</h2>
            <p style="color:#555;line-height:1.7;margin:0 0 16px;">
              Votre abonnement a bien été enregistré sur la plateforme <strong>MOHS TECHNOLOGIE</strong>. 
              Voici le récapitulatif de votre souscription :
            </p>
          </td>
        </tr>

        <!-- FICHE CLIENT -->
        <tr>
          <td style="padding:0 40px 30px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;border:1px solid #e8eaf6;overflow:hidden;">
              <tr style="background:#1a1a2e;">
                <td colspan="2" style="padding:14px 20px;color:#F5A623;font-weight:bold;font-size:14px;letter-spacing:1px;">
                  📋 DÉTAILS DE VOTRE ABONNEMENT
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;width:40%;">🆔 ID Client</td>
                <td style="padding:14px 20px;border-bottom:1px solid #eee;">
                  <span style="background:#1a1a2e;color:#F5A623;padding:4px 12px;border-radius:20px;font-family:monospace;font-weight:bold;">${id}</span>
                </td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding:14px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">📦 Pack souscrit</td>
                <td style="padding:14px 20px;color:#1a1a2e;font-weight:bold;font-size:14px;border-bottom:1px solid #eee;">${pack}</td>
              </tr>
              <tr>
                <td style="padding:14px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">📱 Plateforme</td>
                <td style="padding:14px 20px;color:#1a1a2e;font-size:14px;border-bottom:1px solid #eee;">${plateforme}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding:14px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">💰 Montant mensuel</td>
                <td style="padding:14px 20px;color:#F5A623;font-weight:bold;font-size:16px;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td>
              </tr>
              <tr>
                <td style="padding:14px 20px;color:#888;font-size:14px;">📅 Valide jusqu'au</td>
                <td style="padding:14px 20px;color:#1a1a2e;font-weight:bold;font-size:14px;">${date_fin}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BOUTON PAIEMENT -->
        <tr>
          <td style="padding:0 40px 30px;">
            ${lienHtml}
          </td>
        </tr>

        <!-- MESSAGE -->
        <tr>
          <td style="padding:0 40px 30px;">
            <p style="color:#555;line-height:1.7;font-size:14px;margin:0;">
              Conservez votre <strong>ID Client (${id})</strong> — il vous sera utile pour toute demande de support ou renouvellement.
            </p>
            <p style="color:#555;line-height:1.7;font-size:14px;margin:12px 0 0;">
              Pour toute question, contactez-nous à <a href="mailto:contact@mohstechnologie.com" style="color:#F5A623;">contact@mohstechnologie.com</a>
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1a1a2e;padding:24px 40px;text-align:center;">
            <p style="color:#F5A623;margin:0 0 6px;font-weight:bold;font-size:14px;">⚙️ MOHS TECHNOLOGIE</p>
            <p style="color:#666;margin:0;font-size:12px;">contact@mohstechnologie.com</p>
            <p style="color:#444;margin:8px 0 0;font-size:11px;">© ${new Date().getFullYear()} MOHS TECHNOLOGIE — Tous droits réservés</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"MOHS TECHNOLOGIE" <${GMAIL_USER}>`,
      to:      email,
      subject: `✅ Bienvenue chez MOHS TECHNOLOGIE — ${pack}`,
      html
    });
    console.log(`✅ Mail envoyé à ${email}`);
    return true;
  } catch(e) {
    console.error("❌ Gmail SMTP:", e.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GÉNÉRER LIEN FEDAPAY
// ══════════════════════════════════════════════════════════════════════════════
async function genererLienPaiement(idClient, montant, nom, pack) {
  if (!FEDAPAY_API_KEY) return null;
  try {
    const res = await fetch("https://api.fedapay.com/v1/transactions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${FEDAPAY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: montant, currency: { iso: "XOF" },
        description: `MOHS BOT — ${pack} — ${nom}`,
        merchant_reference: `MOHSBOT_${idClient}`,
        callback_url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/paiement-confirme`
      })
    });
    const data = await res.json();
    if (data.v1 && data.v1.token) return `https://process.fedapay.com/${data.v1.token}`;
    return null;
  } catch(e) { console.error("❌ FedaPay:", e.message); return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function menuAdmin() {
  return `👑 *MOHS BOT — Panneau Admin*

👥 *Clients :*
\`nouveau [nom] [tel] [email] [pack1/2/3/4] [telegram/whatsapp]\`
\`client [ID]\` → fiche client
\`clients\` → tous les clients
\`actifs\` → clients actifs
\`expires\` → clients expirés
\`alerte\` → expirent dans 7 jours

💰 *Abonnements :*
\`renouveler [ID]\` → renouvellement manuel
\`suspendre [ID]\` → suspendre un client
\`reactiver [ID]\` → réactiver un client

📊 *Stats :*
\`stats\` → tableau de bord complet

ℹ️ *Aide :*
\`packs\` → voir tous les packs et prix`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
app.get("/", (req, res) => res.send("✅ MOHS BOT Admin opérationnel"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text   = message.text.trim();
    const prenom = message.from?.first_name || "";

    // 🔒 Accès réservé à l'admin
    if (!isAdmin(chatId)) {
      await send(chatId, `👋 Bonjour ${prenom} !\n\nBienvenue sur *MOHS TECHNOLOGIE* 🤖\n\nCe service est réservé à un usage interne.\nPour toute demande : contact@mohstechnologie.com`);
      return;
    }

    // ── /start ────────────────────────────────────────────────────────────────
    if (text === "/start") {
      await send(chatId, `👋 Bonjour *${prenom}* ! Bienvenue dans ton espace admin.\n\n` + menuAdmin());
      return;
    }

    // ── PACKS ─────────────────────────────────────────────────────────────────
    if (text.toLowerCase() === "packs") {
      let msg = `📦 *CATALOGUE MOHS TECHNOLOGIE*\n\n`;
      for (const [k, p] of Object.entries(PACKS)) {
        msg += `*Pack ${k} — ${p.nom}*\n`;
        msg += `  📱 Telegram : ${p.telegram.toLocaleString("fr-FR")} FCFA/mois\n`;
        msg += `  💬 WhatsApp : ${p.whatsapp.toLocaleString("fr-FR")} FCFA/mois\n\n`;
      }
      await send(chatId, msg);
      return;
    }

    // ── NOUVEAU CLIENT ────────────────────────────────────────────────────────
    // Format : nouveau Paul 22901234567 paul@gmail.com 2 telegram
    if (text.toLowerCase().startsWith("nouveau ")) {
      const parts = text.split(" ").filter(p => p.trim());
      if (parts.length < 6) {
        await send(chatId, "⚠️ Format :\n`nouveau [nom] [téléphone] [email] [pack 1/2/3/4] [telegram/whatsapp]`\n\nEx:\n`nouveau Paul 22901234567 paul@gmail.com 2 telegram`");
        return;
      }

      const [, nom, telephone, email, packNum, plateforme = "telegram"] = parts;

      if (!email.includes("@")) {
        await send(chatId, "⚠️ Email invalide. Ex: `paul@gmail.com`");
        return;
      }

      const packInfo = PACKS[packNum];
      if (!packInfo) {
        await send(chatId, "⚠️ Pack invalide. Choisir entre 1, 2, 3 ou 4.\nTape `packs` pour voir les détails.");
        return;
      }

      const idClient = genererID();
      await send(chatId, `⏳ Enregistrement de *${nom}* en cours...`);

      const montant = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const result  = await callSheet("add_client", {
        id: idClient, nom, telephone, email,
        pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant
      });

      if (result.status !== "ok") {
        await send(chatId, `❌ Erreur : ${result.message}`);
        return;
      }

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) lienPaiement = await genererLienPaiement(idClient, montant, nom, packInfo.nom);

      // Envoyer mail de bienvenue
      const mailEnvoye = await envoyerMailBienvenue({
        email, nom, id: idClient,
        pack: packInfo.nom, montant,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        date_fin: result.date_fin,
        lienPaiement
      });

      let msg = `✅ *Client enregistré !*\n\n`;
      msg += `🆔 ID : \`${idClient}\`\n`;
      msg += `👤 Nom : ${nom}\n`;
      msg += `📞 Tél : ${telephone}\n`;
      msg += `📧 Email : ${email}\n`;
      msg += `📦 Pack : ${packInfo.nom}\n`;
      msg += `📱 Plateforme : ${plateforme}\n`;
      msg += `💰 Montant : ${montant.toLocaleString("fr-FR")} FCFA/mois\n`;
      msg += `📅 Valide jusqu'au : *${result.date_fin}*\n\n`;
      msg += mailEnvoye
        ? `📧 Mail de bienvenue envoyé ✅`
        : `⚠️ Mail non envoyé — vérifie GMAIL_PASS sur Render`;

      if (lienPaiement) msg += `\n\n💳 Lien FedaPay :\n${lienPaiement}`;

      await send(chatId, msg);
      return;
    }

    // ── VOIR UN CLIENT ────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("client ")) {
      const recherche = text.split(" ").slice(1).join(" ").trim();
      const result    = await callSheet("get_client", { id: recherche, telephone: recherche });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }

      const c      = result;
      const emoji  = c.statut === "ACTIF" ? "🟢" : c.statut === "EXPIRÉ" ? "🔴" : "🟡";
      const alertJ = c.jours_restants <= 3 ? "🚨" : c.jours_restants <= 7 ? "⚠️" : "";

      let msg = `👤 *Fiche Client*\n\n`;
      msg += `${emoji} Statut : *${c.statut}*\n`;
      msg += `🆔 ID : \`${c.id}\`\n`;
      msg += `👤 Nom : ${c.nom}\n`;
      msg += `📞 Tél : ${c.telephone || "—"}\n`;
      msg += `📧 Email : ${c.email || "—"}\n`;
      msg += `📦 Pack : ${c.pack}\n`;
      msg += `📱 Plateforme : ${c.plateforme}\n`;
      msg += `💰 Montant : ${Number(c.montant).toLocaleString("fr-FR")} FCFA/mois\n`;
      msg += `📅 Début : ${c.date_debut}\n`;
      msg += `📅 Fin : ${c.date_fin}\n`;
      msg += `⏳ Jours restants : *${c.jours_restants}* ${alertJ}\n\n`;
      msg += `⚙️ Actions :\n• \`renouveler ${c.id}\`\n• \`suspendre ${c.id}\`\n• \`reactiver ${c.id}\``;

      await send(chatId, msg);
      return;
    }

    // ── LISTE CLIENTS ─────────────────────────────────────────────────────────
    if (["clients", "actifs", "expires", "alerte"].includes(text.toLowerCase())) {
      const filtreMap = { "clients": "tous", "actifs": "actifs", "expires": "expires", "alerte": "alerte" };
      const filtre    = filtreMap[text.toLowerCase()];
      const result    = await callSheet("get_clients", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, `📋 Aucun client trouvé.`); return; }

      let msg = `📋 *Clients — ${filtre.toUpperCase()}* (${result.total})\n\n`;
      result.clients.forEach(c => {
        const emoji  = c.statut === "ACTIF" ? "🟢" : c.statut === "EXPIRÉ" ? "🔴" : "🟡";
        const alerte = c.jours_restants <= 3 ? " 🚨" : c.jours_restants <= 7 ? " ⚠️" : "";
        msg += `${emoji} \`${c.id}\` *${c.nom}* — ${c.pack.replace("Pack ","P")}\n`;
        msg += `   ⏳ ${c.jours_restants}j restants${alerte} | ${c.plateforme}\n`;
      });
      msg += `\n_Tape \`client [ID]\` pour les détails_`;
      await send(chatId, msg);
      return;
    }

    // ── RENOUVELER ────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("renouveler ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("renouveler", { id_client: id, moyen: "Manuel" });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }
      await send(chatId, `✅ *Renouvellement effectué !*\n\n👤 ${result.nom}\n🆔 \`${id}\`\n📅 Nouvelle date de fin : *${result.nouvelle_fin}*\n💰 ${Number(result.montant).toLocaleString("fr-FR")} FCFA`);
      return;
    }

    // ── SUSPENDRE ─────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("suspendre ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }
      await send(chatId, `🔴 *Client suspendu*\n\n👤 ${result.nom}\n🆔 \`${id}\`\n\nTape \`reactiver ${id}\` pour réactiver.`);
      return;
    }

    // ── RÉACTIVER ─────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("reactiver ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }
      await send(chatId, `🟢 *Client réactivé*\n\n👤 ${result.nom}\n🆔 \`${id}\``);
      return;
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    if (text.toLowerCase() === "stats") {
      const result = await callSheet("get_stats");
      if (result.status !== "ok") { await send(chatId, "⚠️ Erreur stats."); return; }
      let msg = `📊 *MOHS TECHNOLOGIE — Tableau de bord*\n\n`;
      msg += `👥 *Abonnés :*\n  🟢 Actifs : *${result.actifs}*\n  🔴 Expirés : *${result.expires}*\n  🟡 Suspendus : *${result.suspendus}*\n  📊 Total : *${result.total}*\n\n`;
      msg += `💰 *CA Total : ${Number(result.ca_total).toLocaleString("fr-FR")} FCFA*\n\n`;
      msg += `📦 *Par pack :*\n`;
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += `  • ${pack} : ${v.nb} client(s) — ${Number(v.montant).toLocaleString("fr-FR")} FCFA\n`;
      }
      await send(chatId, msg);
      return;
    }

    // ── Commande inconnue ─────────────────────────────────────────────────────
    await send(chatId, `❓ Commande non reconnue.\n\n` + menuAdmin());

  } catch(err) {
    console.error("❌ Webhook:", err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK FEDAPAY
// ══════════════════════════════════════════════════════════════════════════════
app.post("/paiement-confirme", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body;
    if (event.name !== "transaction.approved") return;
    const transaction = event.entity;
    const ref = transaction.merchant_reference || "";
    if (!ref.startsWith("MOHSBOT_")) return;
    const idClient = ref.replace("MOHSBOT_", "");
    const result = await callSheet("update_abonnement", { id_client: idClient, ref_paiement: transaction.id, moyen: "FedaPay" });
    if (result.status === "ok" && ADMIN_CHAT_ID) {
      await send(ADMIN_CHAT_ID, `💰 *Paiement reçu !*\n\n👤 ${result.nom}\n🆔 \`${idClient}\`\n💵 ${Number(result.montant).toLocaleString("fr-FR")} FCFA\n📅 Valide jusqu'au : *${result.nouvelle_fin}*`);
    }
  } catch(e) { console.error("❌ FedaPay webhook:", e.message); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER
// ══════════════════════════════════════════════════════════════════════════════
async function checkExpirations() {
  try {
    const result = await callSheet("expire_check");
    if (result.status !== "ok") return;
    for (const a of result.alertes || []) {
      const emoji = a.jours === 1 ? "🚨" : a.jours === 3 ? "🔴" : "⚠️";
      await send(ADMIN_CHAT_ID, `${emoji} *Alerte expiration*\n\n👤 ${a.nom}\n🆔 \`${a.id}\`\n📦 ${a.pack}\n⏳ Expire dans *${a.jours} jour(s)*\n💰 ${Number(a.montant).toLocaleString("fr-FR")} FCFA\n\nAction : \`renouveler ${a.id}\``);
    }
    for (const e of result.expires || []) {
      await send(ADMIN_CHAT_ID, `❌ *Abonnement expiré*\n\n👤 ${e.nom}\n🆔 \`${e.id}\`\n📦 ${e.pack}\n💰 ${Number(e.montant).toLocaleString("fr-FR")} FCFA\n\nAction : \`renouveler ${e.id}\``);
    }
  } catch(e) { console.error("❌ Scheduler:", e.message); }
}

setInterval(checkExpirations, 60 * 60 * 1000);
setTimeout(checkExpirations, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MOHS BOT Admin — Port ${PORT}`));