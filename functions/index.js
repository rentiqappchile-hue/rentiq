const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

// Access token de Mercado Pago. Configurar con:
//   firebase functions:secrets:set MP_ACCESS_TOKEN
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");

// Resuelve el uid del usuario dueño de una suscripción de MP.
// 1° intenta external_reference (el cliente lo agrega a la URL del checkout);
// 2° si no llegó, busca en Firebase Auth por el email del pagador.
async function resolverUid(sub) {
  if (sub.external_reference) {
    const user = await admin.auth().getUser(sub.external_reference).catch(() => null);
    if (user) return user.uid;
    console.warn(`external_reference no corresponde a un uid: ${sub.external_reference}`);
  }
  if (sub.payer_email) {
    const user = await admin.auth().getUserByEmail(sub.payer_email).catch(() => null);
    if (user) return user.uid;
    console.warn(`payer_email sin cuenta en Firebase: ${sub.payer_email}`);
  }
  return null;
}

// ─── WEBHOOK MERCADO PAGO ─────────────────────────────────────────────────────
// Recibe notificaciones de suscripciones (preapproval). Nunca confía en el
// contenido de la notificación: consulta la suscripción directamente a la API
// de MP con el access token, así una notificación falsificada no puede activar Pro.
exports.mpWebhook = onRequest({ secrets: [MP_ACCESS_TOKEN], invoker: "public" }, async (req, res) => {
  try {
    const tipo = String(req.body?.type || req.query?.type || req.query?.topic || "");
    const id = req.body?.data?.id || req.query?.["data.id"] || req.query?.id;

    if (!id || !tipo.includes("preapproval")) {
      res.status(200).send("ignorado");
      return;
    }

    const resp = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` },
    });
    if (resp.status === 401 || resp.status === 403) {
      // Token mal configurado: error nuestro, no de MP. 500 para que MP
      // reintente cuando lo corrijamos, y queda claro en los logs.
      throw new Error(`Token de MP rechazado (${resp.status}). Revisar el secreto MP_ACCESS_TOKEN.`);
    }
    if (resp.status >= 400 && resp.status < 500) {
      // id inexistente o malformado (típico de simulaciones): nada que hacer.
      console.warn(`Preapproval ${id} no consultable: MP respondió ${resp.status}`);
      res.status(200).send("suscripcion no existe");
      return;
    }
    if (!resp.ok) {
      throw new Error(`API de MP respondió ${resp.status}`);
    }
    const sub = await resp.json();

    const uid = await resolverUid(sub);
    if (!uid) {
      // 200 para que MP no reintente: el dato nunca va a mejorar solo.
      // Queda en los logs para vincularlo a mano si hace falta.
      console.error(`Suscripción ${sub.id} sin usuario identificable`, {
        external_reference: sub.external_reference,
        payer_email: sub.payer_email,
        status: sub.status,
      });
      res.status(200).send("usuario no identificado");
      return;
    }

    const pro = sub.status === "authorized";
    await admin.firestore().doc(`usuarios/${uid}`).set(
      {
        pro,
        suscripcion: {
          tipo: "mercadopago",
          id: sub.id,
          status: sub.status,
          planId: sub.preapproval_plan_id || null,
          actualizado: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    console.log(`Suscripción ${sub.id} (${sub.status}) → usuario ${uid}, pro=${pro}`);
    res.status(200).send("ok");
  } catch (e) {
    console.error("mpWebhook error:", e);
    res.status(500).send("error"); // 5xx hace que MP reintente la notificación
  }
});

// ─── CANJE DE CÓDIGOS DE ACCESO ───────────────────────────────────────────────
// Los códigos viven en la colección `codigosAcceso` (solo accesible vía Admin
// SDK; las reglas bloquean al cliente). Crear desde la consola de Firebase:
//   doc id = CÓDIGO en mayúsculas, campos: { usosRestantes: <número> }
exports.canjearCodigo = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const codigo = String(request.data?.codigo || "").trim().toUpperCase();
  if (!codigo || codigo.length > 40 || !/^[A-Z0-9-]+$/.test(codigo)) {
    throw new HttpsError("invalid-argument", "Código inválido.");
  }

  const db = admin.firestore();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`codigosAcceso/${codigo}`);
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data().usosRestantes || 0) <= 0) {
      throw new HttpsError("not-found", "Código inválido o agotado.");
    }
    tx.update(ref, {
      usosRestantes: admin.firestore.FieldValue.increment(-1),
      ultimoUso: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(
      db.doc(`usuarios/${uid}`),
      {
        pro: true,
        suscripcion: {
          tipo: "codigo",
          codigo,
          actualizado: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
  });

  console.log(`Código ${codigo} canjeado por usuario ${uid}`);
  return { ok: true };
});
