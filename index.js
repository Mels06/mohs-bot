require("dotenv").config();
const express  = require("express");
const axios    = require("axios");
const { FedaPay, Transaction } = require("fedapay");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbxMAqw97qww0rQXce-wn4RIvD30HgZSwHV_PpVJbnNeqecwQqcgjmSHCvNOz38-92mN/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || "";
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || "";

function isAdmin(chatId) { return String(chatId) === String(ADMIN_CHAT_ID); }

function genererID() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return "MT-" + code;
}

const PACKS = {
  "1": { nom: "Pack 1 - Essentiel",  telegram: 15000, whatsapp: 30000 },
  "2": { nom: "Pack 2 - Avancee",    telegram: 20000, whatsapp: 40000 },
  "3": { nom: "Pack 3 - Assistant",  telegram: 25000, whatsapp: 50000 },
  "4": { nom: "Pack 4 - Commercial", telegram: 35000, whatsapp: 100000 },
};

const MOIS = {
  "janvier":1,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,
  "juillet":7,"aout":8,"septembre":9,"octobre":10,"novembre":11,"decembre":12
};

const CONVERSATIONS = {
  salutations: ["bonjour","bonsoir","salut","hello","hi","coucou","yo","hey"],
  quiSommes:   ["qui es tu","qui etes vous","c'est quoi mohs","que faites vous","presentez vous","presentation","vous faites quoi","tu fais quoi"],
  services:    ["services","offres","produits","bots","bot","pack","packs","prix","tarif","tarifs","combien"],
  contact:     ["contact","email","telephone","joindre","appeler","ecrire"],
  merci:       ["merci","thanks","thank you","super","parfait","ok merci","nickel"],
  aide:        ["aide","help","comment","comment ca marche","comment utiliser"],
};

function detectIntent(text) {
  const t = text.toLowerCase().trim();
  for (const [intent, mots] of Object.entries(CONVERSATIONS)) {
    if (mots.some(m => t.includes(m))) return intent;
  }
  return null;
}

function repondreConversation(intent, prenom) {
  const n = prenom ? " " + prenom : "";
  switch(intent) {
    case "salutations": return "Bonjour" + n + " ! Je suis ton assistant MOHS TECHNOLOGIE. Comment puis-je t'aider ?\n\nTape 'aide' pour voir toutes les commandes disponibles.";
    case "quiSommes":   return "MOHS TECHNOLOGIE est une structure specialisee dans la configuration de bots intelligents pour les entreprises et particuliers.\n\nNos bots peuvent gerer :\n- Les ventes et commandes\n- Le service client\n- La gestion commerciale\n- Les assistants automatises\n\nNous proposons 4 packs adaptes a tous les besoins. Tape 'packs' pour les voir !";
    case "services":    return "Nous proposons 4 packs de bots intelligents :\n\nPack 1 - Essentiel\nPack 2 - Avancee\nPack 3 - Assistant\nPack 4 - Commercial\n\nDisponibles sur Telegram et WhatsApp.\nTape 'packs' pour voir les details et tarifs !";
    case "contact":     return "Pour nous contacter :\n\nEmail : contact@mohstechnologie.com\n\nNous repondons dans les plus brefs delais !";
    case "merci":       return "Avec plaisir" + n + " ! N'hesite pas si tu as d'autres questions.";
    case "aide":        return "Voici les principales commandes :\n\n" +
      "nouveau [nom] [tel] [email] [pack 1-4] [telegram/whatsapp]\n" +
      "nouveau ... 3 - Enregistrer pour 3 mois\n" +
      "client [ID] - Voir fiche client\n" +
      "clients / actifs / expires / alerte\n" +
      "liste pack1 / liste telegram\n" +
      "renouveler [ID] / renouveler [ID] 3\n" +
      "suspendre [ID] / reactiver [ID]\n" +
      "solde [ID] - Envoyer lien solde au client\n" +
      "bots - Liste bots a implementer\n" +
      "bot fait [ID] / bot encours [ID]\n" +
      "stats - Tableau de bord\n" +
      "ca mars / ca 2025 / ca 01/01/2025 31/03/2025\n" +
      "commandes / commandes aujourd'hui\n" +
      "packs - Voir les tarifs";
    default: return null;
  }
}

async function callSheet(action, data = {}) {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }), redirect: "follow"
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch(e) { console.error("Sheet:", e.message); return { status: "error", message: e.message }; }
}

async function send(chatId, text) {
  try {
    await axios.post("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
      chat_id: chatId, text: text
    });
  } catch(e) { console.error("Telegram:", e.response?.data?.description || e.message); }
}

// ── FEDAPAY ───────────────────────────────────────────────────────────────────
async function genererLienPaiement(reference, montant, nom, pack, email, telephone) {
  if (!FEDAPAY_API_KEY) { console.log("FEDAPAY_API_KEY manquante"); return null; }
  try {
    FedaPay.setApiKey(FEDAPAY_API_KEY);
    FedaPay.setEnvironment("live");

    const transaction = await Transaction.create({
      description: "MOHS BOT - " + pack + " - " + nom,
      amount: montant,
      currency: { iso: "XOF" },
      merchant_reference: "MOHSBOT_" + reference,
      callback_url: "https://mohs-technologie.onrender.com/paiement-confirme",
      merchant_reference: uniqueRef,
      customer: {
        firstname: nom,
        email: email && email.includes("@") ? email.trim() : "client@mohstechnologie.com"
      }
    });

    console.log("FedaPay transaction ID: " + transaction.id);

    const token = await transaction.generateToken();
    const tokenData = JSON.parse(JSON.stringify(token));
    console.log("FedaPay token: " + JSON.stringify(tokenData));

    if (tokenData.url)   return tokenData.url;
    if (tokenData.token) return "https://process.fedapay.com/" + tokenData.token;
    return null;

  } catch(e) { console.error("FedaPay error:", e.message); console.error("FedaPay details:", JSON.stringify(e.response?.data || e.errors || "")); return null; }
}

// ── MAIL BIENVENUE ────────────────────────────────────────────────────────────
async function envoyerMail({ email, nom, id, pack, montant, plateforme, date_fin, lienPaiement, acompte, solde }) {
  if (!RESEND_API_KEY) return false;

  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer mon acompte (' + Number(acompte).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;padding:10px;background:#f0f7ff;border-radius:8px;">Le lien de paiement vous sera envoye prochainement.</p>';

  const acompteHtml = acompte ? `
    <tr style="background:#e8f4fb;"><td style="padding:10px 15px;color:#2f74a3;font-weight:bold;border-bottom:1px solid #eee;">Acompte a payer (50%)</td>
        <td style="padding:10px 15px;color:#2f74a3;font-weight:bold;font-size:16px;border-bottom:1px solid #eee;">${Number(acompte).toLocaleString("fr-FR")} FCFA</td></tr>
    <tr><td style="padding:10px 15px;color:#888;border-bottom:1px solid #eee;">Solde restant</td>
        <td style="padding:10px 15px;color:#555;border-bottom:1px solid #eee;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>` : "";

  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;font-size:26px;letter-spacing:2px;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Bienvenue, ${nom} !</h2>
      <p style="color:#555;line-height:1.6;">Votre abonnement a ete enregistre avec succes. Voici votre recapitulatif :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">DETAILS ABONNEMENT</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack souscrit</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Plateforme</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${plateforme}</td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant mensuel</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        ${acompteHtml}
        <tr><td style="padding:12px 15px;color:#888;">Valide jusqu'au</td>
            <td style="padding:12px 15px;font-weight:bold;">${date_fin}</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Conservez votre ID <strong style="color:#2f74a3;">${id}</strong> pour tout support.</p>
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;">MOHS TECHNOLOGIE</p>
      <p style="color:#666;margin:5px 0 0;font-size:12px;">contact@mohstechnologie.com</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>", to: [email], subject: "Bienvenue chez MOHS TECHNOLOGIE - " + pack, html })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail bienvenue envoye a " + email); return true; }
    console.error("Resend:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail:", e.message); return false; }
}

// ── MAIL SOLDE / RENOUVELLEMENT ───────────────────────────────────────────────
async function envoyerMailSolde({ email, nom, id, pack, montant, solde, lienPaiement, sujet }) {
  if (!RESEND_API_KEY) return false;

  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer ' + Number(solde).toLocaleString("fr-FR") + ' FCFA</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;">Lien de paiement non disponible.</p>';

  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;font-size:26px;letter-spacing:2px;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Bonjour, ${nom} !</h2>
      <p style="color:#555;line-height:1.6;">${sujet === "renouvellement" ? "Voici le lien pour renouveler votre abonnement." : "Votre bot est pret. Voici le lien pour regler le solde."}</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">${sujet === "renouvellement" ? "RENOUVELLEMENT" : "SOLDE A REGLER"}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant total</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        <tr style="background:#e8f4fb;"><td style="padding:12px 15px;color:#2f74a3;font-weight:bold;">Montant a payer</td>
            <td style="padding:12px 15px;color:#2f74a3;font-weight:bold;font-size:18px;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;">MOHS TECHNOLOGIE</p>
      <p style="color:#666;margin:5px 0 0;font-size:12px;">contact@mohstechnologie.com</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>",
        to: [email],
        subject: (sujet === "renouvellement" ? "Renouvellement" : "Reglement du solde") + " - MOHS TECHNOLOGIE - " + pack,
        html
      })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail " + sujet + " envoye a " + email); return true; }
    console.error("Resend " + sujet + ":", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail " + sujet + ":", e.message); return false; }
}

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
      await send(chatId, "Bonjour " + prenom + " ! Ce service est reserve a un usage interne.\nContact : contact@mohstechnologie.com");
      return;
    }

    if (text === "/start") {
      await send(chatId, "Bonjour " + prenom + " ! Content de te voir.\n\nJe suis ton assistant MOHS TECHNOLOGIE.\n\nTape 'aide' pour voir toutes les commandes.");
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

    // NOUVEAU CLIENT
    if (text.toLowerCase().startsWith("nouveau ")) {
      // Format : nouveau [nom], [entreprise optionnelle], [tel] [email] [pack] [plateforme] [nb_mois]
      // Extraire la partie apres "nouveau "
      const rawText = text.trim().substring(8).trim();

      // Trouver email
      const allWords = rawText.split(" ");
      const emailWord = allWords.find(w => w.includes("@"));
      if (!emailWord) { await send(chatId, "Email introuvable. Format :\nnouveau Melissa AKPOVI, WEBCOOM SAS, 0196146200 email 1 telegram"); return; }

      const emailIndex = rawText.indexOf(emailWord);
      const avantEmail = rawText.substring(0, emailIndex).trim();
      const apresEmail = rawText.substring(emailIndex + emailWord.length).trim().split(" ").filter(p => p);

      const email      = emailWord;
      const packNum    = apresEmail[0];
      const plateforme = apresEmail[1] || "telegram";
      const nbMois     = parseInt(apresEmail[2]) || 1;

      // Parser avantEmail avec virgules
      const segments = avantEmail.split(",").map(s => s.trim()).filter(s => s);

      let nom, entreprise, telephone;

      let nomBot = "";
      if (segments.length === 4) {
        // nouveau Melissa AKPOVI, WEBCOOM SAS, MonBot, 0196146200
        nom        = segments[0];
        entreprise = segments[1];
        nomBot     = segments[2];
        telephone  = segments[3];
      } else if (segments.length === 3) {
        // nouveau Melissa AKPOVI, WEBCOOM SAS, 0196146200
        // OU nouveau Melissa AKPOVI, MonBot, 0196146200
        // Le dernier segment est toujours le tel
        nom        = segments[0];
        entreprise = segments[1];
        nomBot     = "";
        telephone  = segments[2];
      } else if (segments.length === 2) {
        // nouveau Melissa AKPOVI, 0196146200
        nom        = segments[0];
        entreprise = "";
        nomBot     = "";
        telephone  = segments[1];
      } else {
        const parts = avantEmail.split(" ");
        telephone  = parts[parts.length - 1];
        nom        = parts.slice(0, -1).join(" ");
        entreprise = "";
        nomBot     = "";
      }

      if (!nom || !telephone) { await send(chatId, "Format :\nnouveau Melissa AKPOVI, WEBCOOM SAS, 0196146200 email 1 telegram\nnouveau Melissa AKPOVI, 0196146200 email 1 telegram"); return; }
      if (!packNum) { await send(chatId, "Pack manquant. Choisir 1, 2, 3 ou 4."); return; }
      const packInfo = PACKS[packNum];
      if (!packInfo) { await send(chatId, "Pack invalide. Tape 'packs' pour voir les details."); return; }

      const idClient     = genererID();
      const montant      = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const montantTotal = montant * nbMois;
      const acompte      = Math.round(montantTotal / 2);
      const solde        = montantTotal - acompte;

      await send(chatId, "Enregistrement de " + nom + " en cours...");

      const result = await callSheet("add_client", {
        id: idClient, nom, entreprise, nom_bot: nomBot, telephone, email,
        pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant, nb_mois: nbMois
      });

      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      // Générer lien FedaPay
      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(idClient + "_ACO", acompte, nom, packInfo.nom, email, telephone);
      }

      // Envoyer mail bienvenue
      const mailEnvoye = await envoyerMail({
        email, nom, id: idClient, pack: packInfo.nom, montant,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        date_fin: result.date_fin, lienPaiement, acompte, solde
      });

      let msg = "Client enregistre !\n\n";
      msg += "ID : " + idClient + "\n";
      msg += "Nom : " + nom + "\n";
      msg += "Tel : " + telephone + "\n";
      msg += "Email : " + email + "\n";
      msg += "Pack : " + packInfo.nom + "\n";
      msg += "Plateforme : " + plateforme + "\n";
      if (nomBot) msg += "Nom du bot : " + nomBot + "\n";
      msg += "Duree : " + nbMois + " mois\n";
      msg += "Montant total : " + montantTotal.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Acompte (50%) : " + acompte.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Solde restant : " + solde.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Valide jusqu'au : " + result.date_fin + "\n\n";
      msg += lienPaiement ? "Lien FedaPay genere\n" + lienPaiement + "\n\n" : "Lien FedaPay non genere\n";
      msg += mailEnvoye ? "Mail envoye a " + email + " OK" : "Mail non envoye";
      await send(chatId, msg);
      return;
    }

    // FICHE CLIENT
    if (["client","fiche","voir","chercher","trouver","info"].some(m => text.toLowerCase().startsWith(m + " ")) && !text.toLowerCase().startsWith("clients")) {
      const recherche = text.split(" ").slice(1).join(" ").trim();
      const result    = await callSheet("get_client", { id: recherche, telephone: recherche });
      if (result.status !== "ok") { await send(chatId, "Client introuvable : " + recherche); return; }
      const c = result;
      let msg = "Fiche Client\n-------------------\n";
      msg += "Statut : " + c.statut + "\n";
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
      msg += "Actions :\nrenouveler " + c.id + "\nrenouveler " + c.id + " 3\nsuspendre " + c.id + "\nreactiver " + c.id;
      await send(chatId, msg);
      return;
    }

    // LISTES SIMPLES
    if (["clients","actifs","expires","alerte"].includes(text.toLowerCase())) {
      const filtreMap = { "clients":"tous","actifs":"actifs","expires":"expires","alerte":"alerte" };
      const filtre = filtreMap[text.toLowerCase()];
      const result = await callSheet("get_clients", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun client trouve."); return; }
      let msg = "Clients - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.clients.forEach(c => {
        const alerte = c.jours_restants <= 3 ? " !!!" : c.jours_restants <= 7 ? " !" : "";
        msg += c.id + " " + c.nom + " - " + c.pack.replace("Pack ","P") + "\n";
        msg += "   " + c.jours_restants + "j | " + c.plateforme + alerte + "\n";
      });
      msg += "\nTape client [ID] pour les details";
      await send(chatId, msg);
      return;
    }

    // LISTE FILTREE
    if (text.toLowerCase().startsWith("liste ")) {
      const filtre = text.split(" ").slice(1).join(" ").trim().toLowerCase();
      const result = await callSheet("get_liste", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun client trouve pour : " + filtre); return; }
      let msg = "Liste - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.clients.forEach(c => {
        msg += c.id + " " + c.nom + "\n";
        msg += "   " + c.pack + " | " + c.plateforme + " | " + Number(c.montant).toLocaleString("fr-FR") + " FCFA | " + c.statut + "\n";
      });
      await send(chatId, msg);
      return;
    }

    // RENOUVELER
    if (["renouveler","renouvellement","reabonner","reabonnement","prolonger","prolongation","reconduire","reconduction"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const parts  = text.split(" ");
      const id     = parts[1]?.trim();
      const nbMois = parseInt(parts[2]) || 1;
      if (!id) { await send(chatId, "Format : renouveler [ID] [nb mois]\n\nEx: renouveler MT-X7K2P\nEx: renouveler MT-X7K2P 3"); return; }

      await send(chatId, "Preparation du renouvellement pour " + id + "...");

      const client = await callSheet("get_client", { id });
      if (client.status !== "ok") { await send(chatId, "Client introuvable : " + id); return; }

      const montantTotal = Number(client.montant) * nbMois;

      // 1. Générer lien FedaPay AVANT tout
      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(id, montantTotal, client.nom, client.pack, client.email, client.telephone);
      }

      if (!lienPaiement) { await send(chatId, "Erreur generation lien FedaPay. Reessaie."); return; }

      // 2. Prolonger la date dans Sheets
      const result = await callSheet("renouveler", { id_client: id, moyen: "FedaPay", nb_mois: nbMois });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      // 3. Envoyer mail au client
      if (client.email) {
        await envoyerMailSolde({
          email: client.email, nom: client.nom, id,
          pack: client.pack, montant: montantTotal, solde: montantTotal,
          lienPaiement, sujet: "renouvellement"
        });
      }

      let msg = "Renouvellement prepare !\n\n";
      msg += "Nom : " + client.nom + "\n";
      msg += "ID : " + id + "\n";
      msg += "Duree : " + nbMois + " mois\n";
      msg += "Nouvelle fin : " + result.nouvelle_fin + "\n";
      msg += "Montant : " + montantTotal.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += "Lien FedaPay :\n" + lienPaiement + "\n\n";
      msg += client.email ? "Mail envoye a " + client.email : "Pas d email client";
      await send(chatId, msg);
      return;
    }

    // SUSPENDRE
    if (["suspendre","suspension","bloquer","desactiver","arreter"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client suspendu\nNom : " + result.nom + "\nID : " + id + "\n\nTape reactiver " + id + " pour reactiver.");
      return;
    }

    // REACTIVER
    if (["reactiver","reactivation","activer","activation","debloquer"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client reactive\nNom : " + result.nom + "\nID : " + id);
      return;
    }

    // SOLDE
    if (["solde","reste","restant","complement"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const id = text.split(" ")[1]?.trim();
      if (!id) { await send(chatId, "Format : solde [ID]\n\nEx: solde MT-X7K2P"); return; }

      await send(chatId, "Generation du lien de solde pour " + id + "...");

      const client = await callSheet("get_client", { id });
      if (client.status !== "ok") { await send(chatId, "Client introuvable : " + id); return; }

      const montantTotal = Number(client.montant);
      const solde        = Math.round(montantTotal / 2);

      // Générer lien FedaPay
      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(id + "_SOL", solde, client.nom, client.pack, client.email, client.telephone);
      }

      console.log("SOLDE lienPaiement = " + lienPaiement);

      // Envoyer mail avec lien
      const mailEnvoye = client.email ? await envoyerMailSolde({
        email: client.email, nom: client.nom, id,
        pack: client.pack, montant: montantTotal, solde,
        lienPaiement, sujet: "solde"
      }) : false;

      let msg = "Solde genere !\n\n";
      msg += "ID : " + id + "\n";
      msg += "Nom : " + client.nom + "\n";
      msg += "Pack : " + client.pack + "\n";
      msg += "Solde (50%) : " + solde.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += lienPaiement ? "Lien FedaPay :\n" + lienPaiement + "\n\n" : "Lien FedaPay non genere\n\n";
      msg += mailEnvoye ? "Mail envoye a " + client.email : "Mail non envoye";
      await send(chatId, msg);
      return;
    }

    // CA
    if (text.toLowerCase().startsWith("ca ")) {
      const args = text.split(" ").slice(1);
      let debut = "", fin = "";
      if (args.length === 1 && isNaN(args[0]) && MOIS[args[0].toLowerCase()]) {
        const m = MOIS[args[0].toLowerCase()], y = new Date().getFullYear();
        const pad = n => String(n).padStart(2,"0");
        debut = pad(1)+"/"+pad(m)+"/"+y; fin = pad(new Date(y,m,0).getDate())+"/"+pad(m)+"/"+y;
      } else if (args.length === 1 && !isNaN(args[0]) && args[0].length === 4) {
        debut = "01/01/"+args[0]; fin = "31/12/"+args[0];
      } else if (args.length === 2) {
        debut = args[0]; fin = args[1];
      } else { await send(chatId, "Format :\nca mars\nca 2025\nca 01/01/2025 31/03/2025"); return; }
      const result = await callSheet("get_ca", { date_debut: debut, date_fin: fin });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      let msg = "Chiffre d'Affaires\nPeriode : " + debut + " au " + fin + "\n-------------------\n";
      msg += "CA Total : " + Number(result.ca_total).toLocaleString("fr-FR") + " FCFA\n";
      msg += "Nb paiements : " + result.nb_paiements + "\n\nPar pack :\n";
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += "  " + pack + " : " + v.nb + " - " + Number(v.montant).toLocaleString("fr-FR") + " FCFA\n";
      }
      await send(chatId, msg);
      return;
    }

    // COMMANDES
    if (text.toLowerCase().startsWith("commandes")) {
      const aujourdhui = text.toLowerCase().includes("aujourd");
      const result = await callSheet("get_commandes", { aujourd_hui: aujourdhui });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucune commande trouvee."); return; }
      let msg = (aujourdhui ? "Commandes du jour" : "Toutes les commandes") + " (" + result.total + ")\n\n";
      result.commandes.forEach(c => {
        msg += c.date + " | " + c.nom + " | " + c.pack + "\n";
        msg += "   " + Number(c.montant).toLocaleString("fr-FR") + " FCFA | " + c.moyen + "\n";
      });
      msg += "\nTotal : " + Number(result.ca).toLocaleString("fr-FR") + " FCFA";
      await send(chatId, msg);
      return;
    }

    // STATS
    if (text.toLowerCase() === "stats") {
      const result = await callSheet("get_stats");
      if (result.status !== "ok") { await send(chatId, "Erreur stats."); return; }
      let msg = "MOHS TECHNOLOGIE - Tableau de bord\n-------------------\n";
      msg += "Abonnes :\n  Actifs : " + result.actifs + "\n  Expires : " + result.expires + "\n  Suspendus : " + result.suspendus + "\n  Total : " + result.total + "\n\n";
      msg += "CA Total : " + Number(result.ca_total).toLocaleString("fr-FR") + " FCFA\n";
      msg += "CA ce mois : " + Number(result.ca_mois).toLocaleString("fr-FR") + " FCFA\n\n";
      msg += "Par pack :\n";
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += "  " + pack + " : " + v.nb + " client(s) - " + Number(v.montant).toLocaleString("fr-FR") + " FCFA\n";
      }
      msg += "\nPar plateforme :\n  Telegram : " + (result.par_plateforme?.telegram||0) + "\n  WhatsApp : " + (result.par_plateforme?.whatsapp||0);
      await send(chatId, msg);
      return;
    }

    // BOTS A IMPLEMENTER
    if (text.toLowerCase() === "bots" || text.toLowerCase().startsWith("bots ")) {
      const filtre = text.toLowerCase().replace("bots","").trim() || "tous";
      const result = await callSheet("get_bots", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun bot trouve."); return; }
      let msg = "Bots a implementer - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.bots.forEach(b => {
        const emoji = b.statut === "LIVRE" ? "OK" : b.statut === "EN COURS" ? "..." : "!";
        msg += emoji + " " + b.id + " " + b.nom + "\n";
        msg += "   " + b.pack + " | " + b.plateforme + "\n";
        msg += "   Bot : " + (b.nom_bot || "A DEFINIR") + "\n";
        msg += "   Statut : " + b.statut + "\n\n";
      });
      msg += "Commandes :\nbot fait [ID]\nbot encours [ID]";
      await send(chatId, msg);
      return;
    }

    // MISE A JOUR STATUT BOT
    if (text.toLowerCase().startsWith("bot ")) {
      const parts  = text.split(" ");
      const action = parts[1]?.toLowerCase();
      const id     = parts[2]?.trim();
      if (!id) { await send(chatId, "Format :\nbot fait [ID]\nbot encours [ID]\nbot fait [ID] [nom du bot]"); return; }
      const nomBot = parts.slice(3).join(" ").trim() || null;
      let statut = "";
      if (action === "fait" || action === "livre") statut = "LIVRE";
      else if (action === "encours" || action === "cours") statut = "EN COURS";
      else { await send(chatId, "Action inconnue. Utilise : bot fait [ID] ou bot encours [ID]"); return; }
      const result = await callSheet("update_bot_statut", { id_client: id, statut, nom_bot: nomBot });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      let msg = "Bot mis a jour !\n\nID : " + id + "\nNom : " + result.nom + "\nStatut : " + statut;
      if (nomBot) msg += "\nNom du bot : " + nomBot;
      await send(chatId, msg);
      return;
    }

    // BOTS A IMPLEMENTER
    if (text.toLowerCase() === "bots" || text.toLowerCase().startsWith("bots ")) {
      const filtre = text.toLowerCase().startsWith("bots ") ? text.split(" ").slice(1).join(" ").trim() : "a faire";
      const result = await callSheet("get_bots", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun bot trouve pour : " + filtre); return; }
      let msg = "Bots - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.bots.forEach(b => {
        msg += b.id + " " + b.nom + "\n";
        msg += "   Bot : " + (b.nom_bot || "Non defini") + "\n";
        msg += "   " + b.pack + " | " + b.plateforme + " | " + b.statut + "\n";
        if (b.entreprise) msg += "   " + b.entreprise + "\n";
        msg += "\n";
      });
      msg += "Commandes :\nbot encours [ID]\nbot fait [ID]";
      await send(chatId, msg);
      return;
    }

    // MAJ STATUT BOT
    if (text.toLowerCase().startsWith("bot ")) {
      const parts   = text.split(" ");
      const action  = parts[1]?.toLowerCase();
      const id      = parts[2]?.trim();
      const nomBot  = parts.slice(3).join(" ").trim();

      if (!id) { await send(chatId, "Format :\nbot encours MT-XXXXX\nbot fait MT-XXXXX\nbot fait MT-XXXXX NomDuBot"); return; }

      let statut = "";
      if (action === "fait" || action === "livre" || action === "done") statut = "LIVRE";
      else if (action === "encours" || action === "cours") statut = "EN COURS";
      else if (action === "refaire" || action === "afaire") statut = "A FAIRE";
      else { await send(chatId, "Action inconnue. Utilise : bot encours [ID] ou bot fait [ID]"); return; }

      const result = await callSheet("update_bot_statut", { id_client: id, statut, nom_bot: nomBot || null });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      let msg = "Bot mis a jour !\n\nID : " + id + "\nNom : " + result.nom + "\nStatut : " + statut;
      if (nomBot) msg += "\nNom du bot : " + nomBot;
      await send(chatId, msg);
      return;
    }

    // BOTS A IMPLEMENTER
    if (text.toLowerCase() === "bots" || text.toLowerCase().startsWith("bots ")) {
      const filtre = text.toLowerCase().replace("bots","").trim() || "tous";
      const filtreMap = { "afaire":"afaire", "a faire":"afaire", "encours":"encours", "en cours":"encours", "livre":"livre", "livres":"livre" };
      const f = filtreMap[filtre] || "tous";
      const result = await callSheet("get_bots", { filtre: f });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun bot trouve."); return; }
      let msg = "BOTS A IMPLEMENTER (" + result.total + ")\n\n";
      result.bots.forEach(b => {
        const emoji = b.statut === "LIVRE" ? "OK" : b.statut === "EN COURS" ? "..." : "TODO";
        msg += "[" + emoji + "] " + b.id + " - " + b.nom + "\n";
        msg += "   " + b.pack + " | " + b.plateforme + "\n";
        if (b.nom_bot)     msg += "   Bot : " + b.nom_bot + "\n";
        if (b.entreprise)  msg += "   Entreprise : " + b.entreprise + "\n";
        if (b.description) msg += "   Info : " + b.description + "\n";
        msg += "\n";
      });
      msg += "Commandes :\nbot encours [ID]\nbot fait [ID]";
      await send(chatId, msg);
      return;
    }

    // BOT STATUT
    if (text.toLowerCase().startsWith("bot ")) {
      const parts   = text.split(" ");
      const action  = parts[1]?.toLowerCase();
      const id      = parts[2]?.trim();
      if (!id) { await send(chatId, "Format :\nbot encours MT-XXXXX\nbot fait MT-XXXXX"); return; }
      const statutMap = { "fait":"LIVRE", "livre":"LIVRE", "encours":"EN COURS", "en cours":"EN COURS", "afaire":"A FAIRE" };
      const statut = statutMap[action];
      if (!statut) { await send(chatId, "Action invalide. Utiliser : fait, encours, afaire"); return; }
      const result = await callSheet("update_bot_statut", { id_client: id, statut });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Bot mis a jour !\n\nID : " + id + "\nNom : " + result.nom + "\nStatut : " + statut);
      return;
    }

    // DESCRIPTION CLIENT
    if (text.toLowerCase().startsWith("description ")) {
      const parts       = text.split(" ");
      const id          = parts[1]?.trim();
      const description = parts.slice(2).join(" ").trim();
      if (!id || !description) { await send(chatId, "Format : description [ID] [description]\n\nEx: description MT-X7K2P Vente chaussures, prix 5000-15000 FCFA"); return; }
      const result = await callSheet("update_description", { id_client: id, description });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Description mise a jour !\n\nID : " + id + "\nNom : " + result.nom + "\nDescription : " + description);
      return;
    }

    // NOMBOT
    if (text.toLowerCase().startsWith("nombot ")) {
      const parts   = text.split(" ");
      const id      = parts[1]?.trim();
      const nomBot  = parts.slice(2).join(" ").trim();
      if (!id || !nomBot) { await send(chatId, "Format : nombot [ID] [nom du bot]\n\nEx: nombot MT-X7K2P MonSuperBot"); return; }
      const result = await callSheet("update_nombot", { id_client: id, nom_bot: nomBot });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Nom du bot mis a jour !\n\nID : " + id + "\nNom du bot : " + nomBot);
      return;
    }

    // CONVERSATION NATURELLE
    const intent = detectIntent(text);
    if (intent) { await send(chatId, repondreConversation(intent, prenom)); return; }

    await send(chatId, "Je n'ai pas compris. Tape 'aide' pour voir toutes les commandes.");

  } catch(err) { console.error("Webhook:", err.message); }
});

app.post("/paiement-confirme", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body;
    if (event.name !== "transaction.approved") return;
    const transaction = event.entity;
    const ref = transaction.merchant_reference || "";
    console.log("Webhook FedaPay ref: " + ref);
    if (!ref.startsWith("MOHSBOT_")) { console.log("Ref ignoree: " + ref); return; }
    // Format: MOHSBOT_MT-XXXXX_TYPE_TIMESTAMP
    // Extraire MT-XXXXX : 2eme segment apres split par _
    const segments = ref.split("_");
    // MOHSBOT_MT-XXXXX_TYPE_TIMESTAMP -> segments[1] = MT-XXXXX
    const idClient = segments[1];
    console.log("Webhook idClient extrait: " + idClient);
    const result = await callSheet("update_abonnement", { id_client: idClient, ref_paiement: transaction.id, moyen: "FedaPay" });
    if (result.status === "ok") {
      await send(ADMIN_CHAT_ID, "Paiement recu !\n\nNom : " + result.nom + "\nID : " + idClient + "\nMontant : " + Number(result.montant).toLocaleString("fr-FR") + " FCFA\nValide jusqu'au : " + result.nouvelle_fin);
    }
  } catch(e) { console.error("FedaPay webhook:", e.message); }
});

async function checkExpirations() {
  try {
    const result = await callSheet("expire_check");
    if (result.status !== "ok") return;
    for (const a of result.alertes || []) {
      const urgence = a.jours === 1 ? "URGENT" : a.jours === 3 ? "ATTENTION" : "INFO";
      await send(ADMIN_CHAT_ID, urgence + " - Expiration dans " + a.jours + " jour(s)\nNom : " + a.nom + "\nID : " + a.id + "\nPack : " + a.pack + "\nMontant : " + Number(a.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + a.id);
    }
    for (const e of result.expires || []) {
      await send(ADMIN_CHAT_ID, "Abonnement expire\nNom : " + e.nom + "\nID : " + e.id + "\nPack : " + e.pack + "\nMontant : " + Number(e.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + e.id);
    }
  } catch(e) { console.error("Scheduler:", e.message); }
}

setInterval(checkExpirations, 60 * 60 * 1000);
setTimeout(checkExpirations, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MOHS BOT Admin - Port " + PORT));