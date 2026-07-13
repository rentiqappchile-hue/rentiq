const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

// Aplica el estado de una suscripción MP al usuario correspondiente en Firestore.
async function activarProSegunSuscripcion(sub) {
  const uid = await resolverUid(sub);
  if (!uid) {
    // Queda en los logs para vincularlo a mano si hace falta.
    console.error(`Suscripción ${sub.id} sin usuario identificable`, {
      external_reference: sub.external_reference,
      payer_email: sub.payer_email,
      status: sub.status,
    });
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
    await activarProSegunSuscripcion(sub);
    res.status(200).send("ok");
  } catch (e) {
    console.error("mpWebhook error:", e);
    res.status(500).send("error"); // 5xx hace que MP reintente la notificación
  }
});

// ─── CREACIÓN DE SUSCRIPCIÓN ──────────────────────────────────────────────────
// El link público de checkout (mercadopago.cl/subscriptions/checkout?...) IGNORA
// cualquier external_reference agregado como query param (confirmado: llegó
// vacío en las 7 suscripciones de prueba de hoy). La única forma confiable de
// vincular la suscripción a un uid es crearla nosotros vía API, indicando
// external_reference en el cuerpo del POST.
// No se usa preapproval_plan_id: asociar a un plan exige card_token_id (tarjeta
// tokenizada de antemano, para checkouts embebidos). Se define el monto y la
// frecuencia directo en auto_recurring, así MP devuelve un init_point de
// checkout alojado sin pedir una tarjeta ya tokenizada.
exports.crearSuscripcion = onCall({ secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email;
  if (!uid || !email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const backUrl = String(request.data?.backUrl || "https://rentiq.cl/");

  const resp = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Rentiq Pro",
      external_reference: uid,
      payer_email: email,
      back_url: backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 9990,
        currency_id: "CLP",
      },
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text().catch(() => "");
    console.error(`crearSuscripcion: MP respondió ${resp.status}`, detalle);
    throw new HttpsError("internal", "No se pudo crear la suscripción con Mercado Pago.");
  }

  const sub = await resp.json();
  if (!sub.init_point) {
    console.error("crearSuscripcion: respuesta sin init_point", sub);
    throw new HttpsError("internal", "Mercado Pago no devolvió el link de pago.");
  }
  console.log(`Suscripción ${sub.id} creada para usuario ${uid}`);
  return { initPoint: sub.init_point };
});

// ─── VERIFICACIÓN INSTANTÁNEA AL VOLVER DEL CHECKOUT ─────────────────────────
// El checkout de MP redirige de vuelta a Rentiq (back_url) con el preapproval_id
// en la URL. El cliente llama esto apenas vuelve, para no depender de esperar
// al webhook (que no llega) ni al respaldo programado (cada 15 min).
exports.verificarSuscripcion = onCall({ secrets: [MP_ACCESS_TOKEN] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const id = String(request.data?.preapprovalId || "").trim();
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new HttpsError("invalid-argument", "ID de suscripción inválido.");
  }

  const resp = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` },
  });
  if (!resp.ok) {
    throw new HttpsError("not-found", "No se pudo verificar la suscripción.");
  }
  const sub = await resp.json();
  await activarProSegunSuscripcion(sub);
  return { status: sub.status };
});

// ─── RESPALDO: SINCRONIZACIÓN PERIÓDICA DE SUSCRIPCIONES ─────────────────────
// Mercado Pago no siempre entrega la notificación del webhook para preapproval
// (comportamiento confirmado: ni una sola llegó en meses, incluso con el
// webhook verificado y funcionando vía "Simular notificación"). Como respaldo,
// cada 15 min recorremos todas las suscripciones del vendedor vía la API de
// búsqueda y aplicamos el mismo estado que aplicaría el webhook. No se filtra
// por preapproval_plan_id: crearSuscripcion ya no asocia a un plan (ver nota
// en esa función), así que las suscripciones nuevas no tienen ese campo.
exports.syncSuscripcionesMP = onSchedule(
  { schedule: "every 15 minutes", secrets: [MP_ACCESS_TOKEN] },
  async () => {
    const limit = 50;
    let offset = 0;
    while (true) {
      const resp = await fetch(
        `https://api.mercadopago.com/preapproval/search?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` } }
      );
      if (!resp.ok) {
        console.error(`syncSuscripcionesMP: API de MP respondió ${resp.status}`);
        return;
      }
      const data = await resp.json();
      const results = data.results || [];
      for (const sub of results) {
        await activarProSegunSuscripcion(sub);
      }
      if (results.length < limit) break;
      offset += limit;
    }
  }
);

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
