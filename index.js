require("dotenv").config();
const express = require("express");
const axios   = require("axios");

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbwWwYLjfuK99ZS_NBtFxHzNQnUFcMN4SM3e_XVhgO5wFegaSzSyxoa0GrEwfD-oQZsD/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || "";
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || "";

// ══════════════════════════════════════════════════════════════════════════════
// VÉRIFICATION ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

// ══════════════════════════════════════════════════════════════════════════════
// GÉNÉRATION ID SÉCURISÉ ex: MT-X7K2P
// ══════════════════════════════════════════════════════════════════════════════
function genererID() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return "MT-" + code;
}

// ══════════════════════════════════════════════════════════════════════════════
// PACKS
// ══════════════════════════════════════════════════════════════════════════════
const PACKS = {
  "1": { nom: "Pack 1 - Essentiel",   telegram: 15000, whatsapp: 30000 },
  "2": { nom: "Pack 2 - Avancee",     telegram: 20000, whatsapp: 40000 },
  "3": { nom: "Pack 3 - Assistant",   telegram: 25000, whatsapp: 50000 },
  "4": { nom: "Pack 4 - Commercial",  telegram: 35000, whatsapp: 100000 },
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
    console.error("Sheet:", e.message);
    return { status: "error", message: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM — sans Markdown pour eviter erreur 400
// ══════════════════════════════════════════════════════════════════════════════
async function send(chatId, text) {
  try {
    await axios.post("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
      chat_id: chatId,
      text: text
    });
  } catch(e) {
    console.error("Telegram:", e.response?.data?.description || e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENVOI MAIL VIA RESEND
// ══════════════════════════════════════════════════════════════════════════════
async function envoyerMail({ email, nom, id, pack, montant, plateforme, date_fin, lienPaiement }) {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY manquante");
    return false;
  }

  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#F5A623;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Payer mon abonnement</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;padding:10px 20px;background:#fff8e1;border-radius:8px;">Le lien de paiement sera disponible tres prochainement.</p>';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px;text-align:center;">
            <h1 style="color:#F5A623;margin:0;font-size:28px;letter-spacing:2px;">MOHS TECHNOLOGIE</h1>
            <p style="color:#aaa;margin:8px 0 0;font-size:14px;">Solutions Digitales et Bots Intelligents</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 20px;">
            <h2 style="color:#1a1a2e;margin:0 0 16px;">Bienvenue, ${nom} !</h2>
            <p style="color:#555;line-height:1.7;margin:0;">Votre abonnement a bien ete enregistre sur la plateforme MOHS TECHNOLOGIE.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 30px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;border:1px solid #e8eaf6;overflow:hidden;">
              <tr style="background:#1a1a2e;">
                <td colspan="2" style="padding:14px 20px;color:#F5A623;font-weight:bold;">DETAILS DE VOTRE ABONNEMENT</td>
              </tr>
              <tr>
                <td style="padding:12px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;width:40%;">ID Client</td>
                <td style="padding:12px 20px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#F5A623;padding:4px 12px;border-radius:20px;font-family:monospace;font-weight:bold;">${id}</span></td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding:12px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">Pack souscrit</td>
                <td style="padding:12px 20px;color:#1a1a2e;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td>
              </tr>
              <tr>
                <td style="padding:12px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">Plateforme</td>
                <td style="padding:12px 20px;color:#1a1a2e;border-bottom:1px solid #eee;">${plateforme}</td>
              </tr>
              <tr style="background:#fff;">
                <td style="padding:12px 20px;color:#888;font-size:14px;border-bottom:1px solid #eee;">Montant mensuel</td>
                <td style="padding:12px 20px;color:#F5A623;font-weight:bold;font-size:16px;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td>
              </tr>
              <tr>
                <td style="padding:12px 20px;color:#888;font-size:14px;">Valide jusqu'au</td>
                <td style="padding:12px 20px;color:#1a1a2e;font-weight:bold;">${date_fin}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 40px 30px;">${lienHtml}</td></tr>
        <tr>
          <td style="padding:0 40px 30px;">
            <p style="color:#555;line-height:1.7;font-size:14px;">Conservez votre ID Client <strong>${id}</strong> pour toute demande de support.</p>
            <p style="color:#555;line-height:1.7;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#F5A623;">contact@mohstechnologie.com</a></p>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a2e;padding:24px 40px;text-align:center;">
            <p style="color:#F5A623;margin:0 0 6px;font-weight:bold;">MOHS TECHNOLOGIE</p>
            <p style="color:#666;margin:0;font-size:12px;">contact@mohstechnologie.com</p>
            <p style="color:#444;margin:8px 0 0;font-size:11px;">2025 MOHS TECHNOLOGIE — Tous droits reserves</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "MOHS TECHNOLOGIE <onboarding@resend.dev>",
        to: [email],
        subject: "Bienvenue chez MOHS TECHNOLOGIE - " + pack,
        html
      })
    });
    const data = await res.json();
    if (data.id) {
      console.log("Mail envoye a " + email);
      return true;
    } else {
      console.error("Resend erreur:", JSON.stringify(data));
      return false;
    }
  } catch(e) {
    console.error("Mail:", e.message);
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
      headers: { "Authorization": "Bearer " + FEDAPAY_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: montant, currency: { iso: "XOF" },
        description: "MOHS BOT - " + pack + " - " + nom,
        merchant_reference: "MOHSBOT_" + idClient,
        callback_url: "https://" + process.env.RENDER_EXTERNAL_HOSTNAME + "/paiement-confirme"
      })
    });
    const data = await res.json();
    if (data.v1 && data.v1.token) return "https://process.fedapay.com/" + data.v1.token;
    return null;
  } catch(e) { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU ADMIN
// ══════════════════════════════════════════════════════════════════════════════
function menuAdmin() {
  return "MOHS BOT - Panneau Admin\n\n" +
    "CLIENTS :\n" +
    "nouveau [nom] [tel] [email] [pack1/2/3/4] [telegram/whatsapp]\n" +
    "client [ID] - fiche client\n" +
    "clients - tous les clients\n" +
    "actifs - clients actifs\n" +
    "expires - clients expires\n" +
    "alerte - expirent dans 7 jours\n\n" +
    "ABONNEMENTS :\n" +
    "renouveler [ID] - renouvellement manuel\n" +
    "suspendre [ID] - suspendre un client\n" +
    "reactiver [ID] - reactiver un client\n\n" +
    "STATS :\n" +
    "stats - tableau de bord complet\n\n" +
    "AIDE :\n" +
    "packs - voir tous les packs et prix";
}

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
app.get("/", (req, res) => res.send("MOHS BOT Admin operationnel"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text   = message.text.trim();
    const prenom = message.from?.first_name || "";

    if (!isAdmin(chatId)) {
      await send(chatId, "Bonjour " + prenom + " ! Ce service est reserve a un usage interne. Contact : contact@mohstechnologie.com");
      return;
    }

    if (text === "/start") {
      await send(chatId, "Bonjour " + prenom + " ! Bienvenue dans ton espace admin.\n\n" + menuAdmin());
      return;
    }

    if (text.toLowerCase() === "packs") {
      let msg = "CATALOGUE MOHS TECHNOLOGIE\n\n";
      for (const [k, p] of Object.entries(PACKS)) {
        msg += "Pack " + k + " - " + p.nom + "\n";
        msg += "  Telegram : " + p.telegram.toLocaleString("fr-FR") + " FCFA/mois\n";
        msg += "  WhatsApp : " + p.whatsapp.toLocaleString("fr-FR") + " FCFA/mois\n\n";
      }
      await send(chatId, msg);
      return;
    }

    if (text.toLowerCase().startsWith("nouveau ")) {
      const parts = text.split(" ").filter(p => p.trim());
      if (parts.length < 6) {
        await send(chatId, "Format :\nnouveau [nom] [telephone] [email] [pack 1/2/3/4] [telegram/whatsapp]\n\nEx:\nnouveau Paul 22901234567 paul@gmail.com 2 telegram");
        return;
      }
      const [, nom, telephone, email, packNum, plateforme = "telegram"] = parts;
      if (!email.includes("@")) { await send(chatId, "Email invalide."); return; }
      const packInfo = PACKS[packNum];
      if (!packInfo) { await send(chatId, "Pack invalide. Tape packs pour voir les details."); return; }

      const idClient = genererID();
      await send(chatId, "Enregistrement de " + nom + " en cours...");

      const montant = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const result  = await callSheet("add_client", {
        id: idClient, nom, telephone, email,
        pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant
      });

      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) lienPaiement = await genererLienPaiement(idClient, montant, nom, packInfo.nom);

      const mailEnvoye = await envoyerMail({
        email, nom, id: idClient,
        pack: packInfo.nom, montant,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        date_fin: result.date_fin, lienPaiement
      });

      let msg = "Client enregistre !\n\n";
      msg += "ID : " + idClient + "\n";
      msg += "Nom : " + nom + "\n";
      msg += "Tel : " + telephone + "\n";
      msg += "Email : " + email + "\n";
      msg += "Pack : " + packInfo.nom + "\n";
      msg += "Plateforme : " + plateforme + "\n";
      msg += "Montant : " + montant.toLocaleString("fr-FR") + " FCFA/mois\n";
      msg += "Valide jusqu'au : " + result.date_fin + "\n\n";
      msg += mailEnvoye ? "Mail de bienvenue envoye a " + email + " ✅" : "Mail non envoye - verifier RESEND_API_KEY";
      if (lienPaiement) msg += "\n\nLien FedaPay :\n" + lienPaiement;

      await send(chatId, msg);
      return;
    }

    if (text.toLowerCase().startsWith("client ")) {
      const recherche = text.split(" ").slice(1).join(" ").trim();
      const result    = await callSheet("get_client", { id: recherche, telephone: recherche });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      const c = result;
      const statut = c.statut === "ACTIF" ? "ACTIF" : c.statut === "EXPIRE" ? "EXPIRE" : "SUSPENDU";
      let msg = "Fiche Client\n\n";
      msg += "Statut : " + statut + "\n";
      msg += "ID : " + c.id + "\n";
      msg += "Nom : " + c.nom + "\n";
      msg += "Tel : " + (c.telephone || "-") + "\n";
      msg += "Email : " + (c.email || "-") + "\n";
      msg += "Pack : " + c.pack + "\n";
      msg += "Plateforme : " + c.plateforme + "\n";
      msg += "Montant : " + Number(c.montant).toLocaleString("fr-FR") + " FCFA/mois\n";
      msg += "Debut : " + c.date_debut + "\n";
      msg += "Fin : " + c.date_fin + "\n";
      msg += "Jours restants : " + c.jours_restants + "\n\n";
      msg += "Actions :\nrenouveler " + c.id + "\nsuspendre " + c.id + "\nreactiver " + c.id;
      await send(chatId, msg);
      return;
    }

    if (["clients", "actifs", "expires", "alerte"].includes(text.toLowerCase())) {
      const filtreMap = { "clients": "tous", "actifs": "actifs", "expires": "expires", "alerte": "alerte" };
      const filtre    = filtreMap[text.toLowerCase()];
      const result    = await callSheet("get_clients", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun client trouve."); return; }
      let msg = "Clients - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.clients.forEach(c => {
        const alerte = c.jours_restants <= 3 ? " URGENT" : c.jours_restants <= 7 ? " BIENTOT" : "";
        msg += c.id + " " + c.nom + " - " + c.pack.replace("Pack ","P") + "\n";
        msg += "   " + c.jours_restants + "j restants" + alerte + " | " + c.plateforme + "\n";
      });
      msg += "\nTape client [ID] pour les details";
      await send(chatId, msg);
      return;
    }

    if (text.toLowerCase().startsWith("renouveler ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("renouveler", { id_client: id, moyen: "Manuel" });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Renouvellement effectue !\n\nNom : " + result.nom + "\nID : " + id + "\nNouvelle date de fin : " + result.nouvelle_fin + "\nMontant : " + Number(result.montant).toLocaleString("fr-FR") + " FCFA");
      return;
    }

    if (text.toLowerCase().startsWith("suspendre ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client suspendu\n\nNom : " + result.nom + "\nID : " + id + "\n\nTape reactiver " + id + " pour reactiver.");
      return;
    }

    if (text.toLowerCase().startsWith("reactiver ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client reactive\n\nNom : " + result.nom + "\nID : " + id);
      return;
    }

    if (text.toLowerCase() === "stats") {
      const result = await callSheet("get_stats");
      if (result.status !== "ok") { await send(chatId, "Erreur stats."); return; }
      let msg = "MOHS TECHNOLOGIE - Tableau de bord\n\n";
      msg += "Abonnes :\n";
      msg += "  Actifs : " + result.actifs + "\n";
      msg += "  Expires : " + result.expires + "\n";
      msg += "  Suspendus : " + result.suspendus + "\n";
      msg += "  Total : " + result.total + "\n\n";
      msg += "CA Total : " + Number(result.ca_total).toLocaleString("fr-FR") + " FCFA\n\n";
      msg += "Par pack :\n";
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += "  " + pack + " : " + v.nb + " client(s) - " + Number(v.montant).toLocaleString("fr-FR") + " FCFA\n";
      }
      await send(chatId, msg);
      return;
    }

    await send(chatId, "Commande non reconnue.\n\n" + menuAdmin());

  } catch(err) {
    console.error("Webhook:", err.message);
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
      await send(ADMIN_CHAT_ID, "Paiement recu !\n\nNom : " + result.nom + "\nID : " + idClient + "\nMontant : " + Number(result.montant).toLocaleString("fr-FR") + " FCFA\nValide jusqu'au : " + result.nouvelle_fin);
    }
  } catch(e) { console.error("FedaPay webhook:", e.message); }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER
// ══════════════════════════════════════════════════════════════════════════════
async function checkExpirations() {
  try {
    const result = await callSheet("expire_check");
    if (result.status !== "ok") return;
    for (const a of result.alertes || []) {
      const urgence = a.jours === 1 ? "URGENT" : a.jours === 3 ? "ATTENTION" : "INFO";
      await send(ADMIN_CHAT_ID, urgence + " - Alerte expiration\n\nNom : " + a.nom + "\nID : " + a.id + "\nPack : " + a.pack + "\nExpire dans " + a.jours + " jour(s)\nMontant : " + Number(a.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + a.id);
    }
    for (const e of result.expires || []) {
      await send(ADMIN_CHAT_ID, "Abonnement expire\n\nNom : " + e.nom + "\nID : " + e.id + "\nPack : " + e.pack + "\nMontant : " + Number(e.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + e.id);
    }
  } catch(e) { console.error("Scheduler:", e.message); }
}

setInterval(checkExpirations, 60 * 60 * 1000);
setTimeout(checkExpirations, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MOHS BOT Admin - Port " + PORT));