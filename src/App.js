import { useState, useMemo, useEffect } from "react";
import { auth, db, functions } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";


// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────
async function cargarDeptosDB(uid) {
  try {
    const snap = await getDocs(collection(db, "usuarios", uid, "deptos"));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch { return []; }
}
async function guardarDeptooDB(uid, depto) {
  try {
    await setDoc(doc(db, "usuarios", uid, "deptos", String(depto.id)), depto);
    return true;
  } catch (e) {
    console.error("Error guardando propiedad:", e);
    return false;
  }
}
async function eliminarDeptooDB(uid, id) {
  try {
    await deleteDoc(doc(db, "usuarios", uid, "deptos", String(id)));
    return true;
  } catch (e) {
    console.error("Error eliminando propiedad:", e);
    return false;
  }
}
// El estado Pro se LEE en tiempo real con onSnapshot (ver App) y se ESCRIBE
// únicamente desde las Cloud Functions (webhook de Mercado Pago / canje de
// código). Las reglas de Firestore bloquean cualquier escritura del cliente
// sobre usuarios/{uid}.

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, onVolver }) {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cargando, setCargando] = useState(false);

  const recuperarPass = async () => {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Escribe tu email arriba y vuelve a presionar el enlace."); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Te enviamos un correo para restablecer tu contraseña. Revisa también la carpeta de spam.");
    } catch (e) {
      if (e.code === "auth/invalid-email") setError("Email inválido.");
      // No revelamos si el correo existe o no (privacidad)
      else if (e.code === "auth/user-not-found") setInfo("Si ese correo está registrado, recibirás un mensaje para restablecer tu contraseña.");
      else setError("No se pudo enviar el correo. Intenta de nuevo.");
    }
  };

  const handleSubmit = async () => {
    setError(""); setCargando(true);
    try {
      if (modo === "registro") {
        await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
      track(modo === "registro" ? "sign_up" : "login", { method: "password" });
      onLogin();
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setError("Este email ya está registrado.");
      else if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") setError("Email o contraseña incorrectos.");
      else if (e.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else if (e.code === "auth/invalid-email") setError("Email inválido.");
      else setError("Error al ingresar. Intenta de nuevo.");
    }
    setCargando(false);
  };

  const inputStyle = {width:"100%",background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,color:"#0f172a",fontSize:14,padding:"12px 14px",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:"#f8f9fb",color:"#0f172a",fontFamily:"'Inter',system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        <button onClick={onVolver} style={{background:"none",border:"none",color:"#64748b",fontSize:13,fontWeight:600,cursor:"pointer",padding:0,marginBottom:20}}>← Volver</button>
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:20,padding:"36px 28px",boxShadow:"0 20px 50px -25px rgba(16,24,43,0.15)"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{width:48,height:48,borderRadius:13,background:"#10182b",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:"#c9962f"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
            </div>
            <div style={{fontSize:17,fontWeight:800,marginBottom:10}}>Rent<span style={{color:"#c9962f"}}>iq</span></div>
            <h2 style={{margin:"0 0 6px",fontSize:22,fontWeight:900,letterSpacing:-0.4}}>{modo==="login"?"Bienvenido de vuelta":"Crear cuenta gratis"}</h2>
            <p style={{margin:0,fontSize:13,color:"#64748b"}}>{modo==="login"?"Ingresa para ver tus propiedades":"Empieza a analizar tu primer depto"}</p>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12.5,color:"#334155",fontWeight:700,display:"block",marginBottom:6}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" style={inputStyle}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12.5,color:"#334155",fontWeight:700,display:"block",marginBottom:6}}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Mínimo 6 caracteres"
              onKeyDown={e=>e.key==="Enter"&&handleSubmit()} style={inputStyle}/>
          </div>
          {modo==="login"&&(
            <div style={{textAlign:"right",marginTop:-12,marginBottom:16}}>
              <span onClick={recuperarPass} style={{fontSize:12,color:"#0284c7",fontWeight:600,cursor:"pointer"}}>¿Olvidaste tu contraseña?</span>
            </div>
          )}
          {error&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:9,padding:"10px 14px",fontSize:12.5,color:"#b91c1c",marginBottom:16}}>{error}</div>}
          {info&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"10px 14px",fontSize:12.5,color:"#15803d",marginBottom:16}}>{info}</div>}
          <button onClick={handleSubmit} disabled={cargando} style={{
            width:"100%",background:"#10182b",
            border:"none",color:"#fff",fontSize:15,fontWeight:700,
            padding:"14px",borderRadius:11,cursor:cargando?"not-allowed":"pointer",
            opacity:cargando?0.7:1,marginBottom:18,
          }}>
            {cargando?"Cargando...":(modo==="login"?"Ingresar":"Crear cuenta")}
          </button>
          <div style={{textAlign:"center",fontSize:13,color:"#64748b"}}>
            {modo==="login"?"¿No tienes cuenta?":"¿Ya tienes cuenta?"}{" "}
            <span onClick={()=>{setModo(modo==="login"?"registro":"login");setError("");setInfo("");}}
              style={{color:"#c9962f",cursor:"pointer",fontWeight:700}}>
              {modo==="login"?"Regístrate gratis":"Inicia sesión"}
            </span>
          </div>
        </div>
        <div style={{textAlign:"center",fontSize:12,color:"#94a3b8",marginTop:18}}>Sin tarjeta. Cancela cuando quieras.</div>
      </div>
    </div>
  );
}


const TIPOS = ["1D/1B","2D/1B","2D/2B","3D/2B","3D/3B","4D/3B","Otro"];
const COMUNAS = ["Providencia","Las Condes","Ñuñoa","Macul","Santiago Centro","Vitacura","La Florida","Maipú","San Miguel","Miraflores","Otra"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n, d = 0) => new Intl.NumberFormat("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const UF_CLP = 40_000; // valor referencial de la UF (usado en toda la app)
const fmtUF = (p) => fmt(p / UF_CLP, 0) + " UF";
const fmtM = (n) => {
  const abs = Math.abs(n), s = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return s + "$" + fmt(abs / 1_000_000, 1) + "M";
  return s + "$" + fmt(abs);
};
const parseCLP = (s) => parseInt(String(s).replace(/\D/g, "")) || 0;
// Evento de Google Analytics (gtag cargado en public/index.html). Nunca rompe
// la app si GA está bloqueado por el navegador.
const track = (evento, params) => { try { if (window.gtag) window.gtag("event", evento, params || {}); } catch (_) {} };
const mesesDesde = (fecha) => {
  if (!fecha) return null;
  const d = new Date(fecha), now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
};

function calc(d) {
  const ingresoAnual = d.arriendoActual * d.mesesArriendados;
  const gastosAnuales = (d.dividendoMensual + d.contribuciones + d.gastosComunes + d.seguros + d.otrosGastos) * 12;
  const flujoNeto = ingresoAnual - gastosAnuales;
  const equity = d.valorMercado - d.deudaHipotecaria;
  const capRate = d.valorMercado > 0 ? (ingresoAnual / d.valorMercado) * 100 : 0;
  const cashOnCash = equity > 0 ? (flujoNeto / equity) * 100 : 0;
  const vacanciaRate = (d.mesesVacancia / 12) * 100;
  const gapArriendo = d.arriendoMercado - d.arriendoActual;
  const ltv = d.valorMercado > 0 ? (d.deudaHipotecaria / d.valorMercado) * 100 : 0;
  const mesesDeuda = mesesDesde(d.fechaDeuda);
  const deudaStale = d.deudaHipotecaria > 0 && mesesDeuda !== null && mesesDeuda > 6;
  let rec, recC;
  if (flujoNeto < 0 && ltv > 80) { rec = "VENDER"; recC = "#ef4444"; }
  else if (flujoNeto < 0 && gapArriendo > 50_000) { rec = "AJUSTAR PRECIO"; recC = "#f59e0b"; }
  else if (flujoNeto < 0) { rec = "REVISAR GASTOS"; recC = "#f59e0b"; }
  else if (cashOnCash > 8) { rec = "MANTENER"; recC = "#22c55e"; }
  else if (gapArriendo > 80_000) { rec = "SUBIR ARRIENDO"; recC = "#3b82f6"; }
  else { rec = "MANTENER"; recC = "#22c55e"; }
  return { ...d, ingresoAnual, gastosAnuales, flujoNeto, equity, capRate, cashOnCash, vacanciaRate, gapArriendo, ltv, rec, recC, deudaStale, mesesDeuda };
}

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Spark({ data, color }) {
  const valid = data.filter(Boolean);
  if (!valid.length) return null;
  const max = Math.max(...valid), min = Math.min(...valid), range = max - min || 1;
  const W = 60, H = 22;
  const pts = data.map((v, i) => `${(i/(data.length-1))*W},${v===0?H:H-((v-min)/range)*(H-3)}`).join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      {data.map((v,i) => v===0 && <circle key={i} cx={(i/(data.length-1))*W} cy={H-1} r={2} fill="#ef4444"/>)}
    </svg>
  );
}
function BarLine({ value, max, color }) {
  return (
    <div style={{flex:1,height:3,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
      <div style={{width:`${Math.min(value/max,1)*100}%`,height:"100%",background:color,transition:"width .3s"}}/>
    </div>
  );
}
function Chip({ text, color }) {
  return <div style={{background:color+"22",border:`1px solid ${color}55`,color,fontSize:9,fontWeight:800,letterSpacing:.8,padding:"3px 8px",borderRadius:6,whiteSpace:"nowrap"}}>{text}</div>;
}
function Card({ children, style }) {
  return <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)",...style}}>{children}</div>;
}
function LI({ l, v, bold, c, dot }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
      <span style={{fontSize:12,color:"#64748b",display:"flex",alignItems:"center",gap:5}}>
        {dot && <span style={{width:7,height:7,borderRadius:"50%",background:dot,display:"inline-block",flexShrink:0}}/>}
        {l}
      </span>
      <span style={{fontSize:13,fontWeight:bold?700:500,color:c||(bold?"#f1f5f9":"#94a3b8")}}>{v}</span>
    </div>
  );
}
function KS({ l, v, c }) {
  return (
    <div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:9,color:"#475569",marginBottom:2}}>{l}</div>
      <div style={{fontSize:13,fontWeight:700,color:c||"#f1f5f9"}}>{v}</div>
    </div>
  );
}

// ─── FORMULARIO ───────────────────────────────────────────────────────────────
const EMPTY = {
  nombre:"", tipo:"2D/1B", m2:"", comuna:"Providencia",
  valorMercado:"", deudaHipotecaria:"", fechaDeuda: new Date().toISOString().slice(0,10),
  dividendoMensual:"", contribuciones:"", gastosComunes:"", seguros:"", otrosGastos:"",
  arriendoActual:"", arriendoMercado:"", mesesVacancia:0, mesesArriendados:11, plusvalia:"",
  historial: Array(12).fill(0),
};

function FormularioDepto({ inicial, onGuardar, onCancelar, titulo }) {
  const [f, setF] = useState(inicial || EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setNum = (k, v) => set(k, parseCLP(v));

  const FInput = ({ label, field, prefix="$", hint, type="text", optional=false }) => (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <label style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>{label}{optional&&<span style={{color:"#475569",fontWeight:400}}> (opcional)</span>}</label>
        {errors[field]&&<span style={{fontSize:11,color:"#ef4444"}}>{errors[field]}</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.06)",borderRadius:10,border:errors[field]?"1px solid #ef4444":"1px solid rgba(255,255,255,0.1)",overflow:"hidden"}}>
        {prefix&&<span style={{padding:"0 10px",color:"#475569",fontSize:13,borderRight:"1px solid rgba(255,255,255,0.08)"}}>{prefix}</span>}
        <input
          type={type}
          value={type==="number"?f[field]:f[field]?fmt(f[field]):""}
          onChange={e => type==="number"?set(field,+e.target.value):setNum(field,e.target.value)}
          placeholder="0"
          style={{flex:1,background:"none",border:"none",outline:"none",color:"#f1f5f9",fontSize:14,fontWeight:600,padding:"11px 12px"}}
        />
      </div>
      {hint&&<div style={{fontSize:10,color:"#334155",marginTop:4}}>{hint}</div>}
    </div>
  );

  const FSelect = ({ label, field, options }) => (
    <div style={{marginBottom:16}}>
      <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>{label}</label>
      <select value={f[field]} onChange={e=>set(field,e.target.value)}
        style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,padding:"11px 12px",outline:"none"}}>
        {options.map(o=><option key={o} value={o} style={{background:"#0f172a"}}>{o}</option>)}
      </select>
    </div>
  );

  const steps = [
    {
      titulo: "Datos básicos",
      icon: "🏠",
      content: <>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Nombre / identificador</label>
          <input value={f.nombre} onChange={e=>set("nombre",e.target.value)}
            placeholder="Ej: Depto 301 – Providencia"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:errors.nombre?"1px solid #ef4444":"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,padding:"11px 12px",outline:"none",boxSizing:"border-box"}}/>
          {errors.nombre&&<div style={{fontSize:11,color:"#ef4444",marginTop:3}}>{errors.nombre}</div>}
        </div>
        <FSelect label="Tipo" field="tipo" options={TIPOS}/>
        <FSelect label="Comuna" field="comuna" options={COMUNAS}/>
        <FInput label="Superficie" field="m2" prefix="m²" type="number"/>
      </>
    },
    {
      titulo: "Valor y deuda",
      icon: "🏦",
      content: <>
        <FInput label="Valor de mercado" field="valorMercado" hint="Estimación actual. Revisa portales o tasaciones recientes."/>
        <FInput label="Deuda hipotecaria (saldo actual)" field="deudaHipotecaria" hint="Lo encuentras en tu cartola bancaria o app del banco."/>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Fecha del último saldo de deuda</label>
          <input type="date" value={f.fechaDeuda||""} onChange={e=>set("fechaDeuda",e.target.value)}
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,padding:"11px 12px",outline:"none",boxSizing:"border-box"}}/>
          <div style={{fontSize:10,color:"#334155",marginTop:4}}>Te avisaremos si lleva más de 6 meses sin actualizar.</div>
        </div>
        <FInput label="Plusvalía esperada" field="plusvalia" prefix="%" hint="Histórico de la zona. Dato referencial." optional/>
      </>
    },
    {
      titulo: "Gastos mensuales",
      icon: "💸",
      content: <>
        <FInput label="Dividendo hipotecario" field="dividendoMensual" hint="$0 si la propiedad está pagada."/>
        <FInput label="Contribuciones" field="contribuciones" hint="Divide el monto anual en 4 cuotas y promedia."/>
        <FInput label="Gastos comunes" field="gastosComunes"/>
        <FInput label="Seguros" field="seguros" optional/>
        <FInput label="Otros gastos" field="otrosGastos" hint="Mantención, administración, etc." optional/>
        {/* preview total */}
        <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:12,color:"#94a3b8"}}>Total egresos /mes</span>
          <span style={{fontSize:15,fontWeight:800,color:"#ef4444"}}>${fmt(f.dividendoMensual+f.contribuciones+f.gastosComunes+f.seguros+f.otrosGastos)}</span>
        </div>
      </>
    },
    {
      titulo: "Arriendo y vacancia",
      icon: "🔑",
      content: <>
        <FInput label="Arriendo actual" field="arriendoActual" hint="$0 si está vacío actualmente."/>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <label style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Arriendo de mercado</label>
            <a href="https://www.portalinmobiliario.com/arriendo/departamento" target="_blank" rel="noreferrer"
              style={{fontSize:11,color:"#3b82f6",textDecoration:"none"}}>🔍 Ver en Portal Inmobiliario →</a>
          </div>
          <div style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.06)",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",overflow:"hidden"}}>
            <span style={{padding:"0 10px",color:"#475569",fontSize:13,borderRight:"1px solid rgba(255,255,255,0.08)"}}>$</span>
            <input type="text" value={f.arriendoMercado?fmt(f.arriendoMercado):""} onChange={e=>setNum("arriendoMercado",e.target.value)}
              placeholder="0"
              style={{flex:1,background:"none",border:"none",outline:"none",color:"#f1f5f9",fontSize:14,fontWeight:600,padding:"11px 12px"}}/>
          </div>
          <div style={{fontSize:10,color:"#334155",marginTop:4}}>Busca deptos similares en tu comuna y tipo. Ponle el promedio.</div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <label style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Meses arrendados este año</label>
            <span style={{fontSize:14,fontWeight:800,color:"#f1f5f9"}}>{f.mesesArriendados}</span>
          </div>
          <input type="range" min={0} max={12} value={f.mesesArriendados} onChange={e=>set("mesesArriendados",+e.target.value)} style={{width:"100%",accentColor:"#22c55e"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#475569",marginTop:2}}><span>0</span><span>6</span><span>12</span></div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <label style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Meses de vacancia este año</label>
            <span style={{fontSize:14,fontWeight:800,color:f.mesesVacancia>2?"#ef4444":"#f1f5f9"}}>{f.mesesVacancia}</span>
          </div>
          <input type="range" min={0} max={12} value={f.mesesVacancia} onChange={e=>set("mesesVacancia",+e.target.value)} style={{width:"100%",accentColor:"#ef4444"}}/>
        </div>
        {/* preview flujo */}
        {(f.arriendoActual > 0 || f.arriendoMercado > 0) && (
          <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:10,padding:"10px 14px"}}>
            <div style={{fontSize:10,color:"#475569",marginBottom:4}}>Preview flujo mensual</div>
            <div style={{fontSize:16,fontWeight:800,color:(f.arriendoActual-(f.dividendoMensual+f.contribuciones+f.gastosComunes+f.seguros+f.otrosGastos))>=0?"#22c55e":"#ef4444"}}>
              {fmtM(f.arriendoActual-(f.dividendoMensual+f.contribuciones+f.gastosComunes+f.seguros+f.otrosGastos))} /mes
            </div>
          </div>
        )}
      </>
    },
  ];

  const validar = () => {
    const e = {};
    if (!f.nombre.trim()) e.nombre = "Requerido";
    if (!f.valorMercado) e.valorMercado = "Requerido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const siguiente = () => {
    if (step === 0 && !f.nombre.trim()) { setErrors({nombre:"Requerido"}); return; }
    if (step === 1 && !f.valorMercado) { setErrors({valorMercado:"Requerido"}); return; }
    setErrors({});
    setStep(s => s + 1);
  };

  const guardar = () => {
    if (!validar()) { setStep(0); return; }
    onGuardar({
      ...f,
      id: inicial?.id || Date.now(),
      historial: inicial?.historial || Array(12).fill(f.arriendoActual || 0),
    });
  };

  return (
    <div style={{paddingBottom:90}}>
      {/* header */}
      <div style={{padding:"12px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <button onClick={onCancelar} style={{background:"none",border:"none",color:"#3b82f6",fontSize:13,cursor:"pointer",padding:0,marginBottom:8}}>
          ← Cancelar
        </button>
        <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{titulo}</div>
        {/* step indicators */}
        <div style={{display:"flex",gap:6,marginTop:12}}>
          {steps.map((s,i)=>(
            <div key={i} onClick={()=>i<step&&setStep(i)} style={{
              flex:1,height:3,borderRadius:2,
              background:i<=step?"#3b82f6":"rgba(255,255,255,0.1)",
              cursor:i<step?"pointer":"default",
              transition:"background .3s",
            }}/>
          ))}
        </div>
        <div style={{fontSize:11,color:"#475569",marginTop:8}}>
          Paso {step+1} de {steps.length} · {steps[step].icon} {steps[step].titulo}
        </div>
      </div>

      <div style={{padding:"16px 16px"}}>
        {steps[step].content}
      </div>

      {/* botones nav */}
      <div style={{
        position:"fixed",bottom:0,left:0,right:0,
        background:"rgba(8,15,26,0.97)",backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.08)",
        padding:"12px 16px",display:"flex",gap:10,
      }}>
        {step > 0 && (
          <button onClick={()=>setStep(s=>s-1)} style={{
            flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
            color:"#94a3b8",fontSize:14,fontWeight:700,padding:"13px",borderRadius:12,cursor:"pointer",
          }}>Atrás</button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={siguiente} style={{
            flex:2,background:"#3b82f6",border:"none",
            color:"#fff",fontSize:14,fontWeight:700,padding:"13px",borderRadius:12,cursor:"pointer",
          }}>Siguiente →</button>
        ) : (
          <button onClick={guardar} style={{
            flex:2,background:"linear-gradient(135deg,#22c55e,#16a34a)",border:"none",
            color:"#fff",fontSize:14,fontWeight:700,padding:"13px",borderRadius:12,cursor:"pointer",
          }}>✓ Guardar propiedad</button>
        )}
      </div>

      {/* atajo: con nombre y valor ya se puede calcular lo esencial */}
      {step > 0 && step < steps.length - 1 && f.nombre.trim() && f.valorMercado > 0 && (
        <div style={{position:"fixed",bottom:66,left:0,right:0,textAlign:"center",padding:"6px 16px"}}>
          <span onClick={guardar} style={{fontSize:12,color:"#22c55e",cursor:"pointer",fontWeight:700,background:"rgba(8,15,26,0.9)",padding:"6px 14px",borderRadius:20,border:"1px solid rgba(34,197,94,0.3)"}}>
            ✓ Guardar ahora y completar el resto después
          </span>
        </div>
      )}
    </div>
  );
}

// ─── VISTA LISTA ──────────────────────────────────────────────────────────────
function VistaLista({ deptos, filtro, setFiltro, onSelect, onNuevo, bloqueado, onDemo }) {
  const all = deptos.map(calc);
  const totalFlujo = all.reduce((s,d)=>s+d.flujoNeto,0);
  const totalArr = all.reduce((s,d)=>s+d.arriendoActual,0);
  const totalEq = all.reduce((s,d)=>s+d.equity,0);
  const alertas = all.filter(d=>d.deudaStale).length;

  const filtrados = useMemo(() => deptos.filter(d => {
    const c = calc(d);
    if (filtro==="todos") return true;
    if (filtro==="problema") return c.flujoNeto<0;
    if (filtro==="vender") return c.rec==="VENDER";
    if (filtro==="ajustar") return ["AJUSTAR PRECIO","SUBIR ARRIENDO"].includes(c.rec);
    return true;
  }), [deptos, filtro]);

  return (
    <div style={{paddingBottom:90}}>
      <div style={{padding:"12px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {l:"Flujo anual",v:fmtM(totalFlujo),c:totalFlujo>=0?"#22c55e":"#ef4444"},
            {l:"Arriendo /mes",v:"$"+fmt(totalArr),c:"#3b82f6"},
            {l:"Equity",v:fmtUF(totalEq),c:"#f1f5f9"},
          ].map(k=>(
            <div key={k.l} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:"#475569",marginBottom:2}}>{k.l}</div>
              <div style={{fontSize:13,fontWeight:800,color:k.c}}>{k.v}</div>
            </div>
          ))}
        </div>
      </div>

      {alertas > 0 && (
        <div style={{margin:"12px 16px 0",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>⚠️</span>
          <span style={{fontSize:12,color:"#f59e0b"}}>{alertas} propiedad{alertas>1?"es tienen":"tiene"} deuda sin actualizar hace +6 meses</span>
        </div>
      )}

      <div style={{display:"flex",gap:6,padding:"10px 16px",overflowX:"auto",borderBottom:"1px solid rgba(255,255,255,0.06)",scrollbarWidth:"none"}}>
        {[{k:"todos",l:"Todos"},{k:"problema",l:"⚠️ Problemas"},{k:"ajustar",l:"📈 Ajustar"},{k:"vender",l:"🔴 Vender"}].map(f=>(
          <button key={f.k} onClick={()=>setFiltro(f.k)} style={{
            whiteSpace:"nowrap",
            background:filtro===f.k?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.05)",
            border:filtro===f.k?"1px solid rgba(59,130,246,0.5)":"1px solid rgba(255,255,255,0.08)",
            color:filtro===f.k?"#3b82f6":"#64748b",
            fontSize:12,fontWeight:filtro===f.k?700:400,
            padding:"6px 12px",borderRadius:20,cursor:"pointer",
          }}>{f.l}</button>
        ))}
      </div>

      <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {filtrados.map(d=>{
          const c=calc(d), pos=c.flujoNeto>=0;
          return (
            <div key={d.id} onClick={()=>onSelect(d)} style={{
              background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
              borderRadius:14,padding:"14px 16px",cursor:"pointer",position:"relative",overflow:"hidden",
            }}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:c.recC}}/>
              {c.deudaStale&&<div style={{position:"absolute",top:8,right:8,fontSize:14}} title="Deuda sin actualizar hace +6 meses">🕐</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{d.nombre}</div>
                  <div style={{fontSize:11,color:"#475569",marginTop:1}}>{d.tipo} · {d.m2} m² · {d.comuna}</div>
                </div>
                <Chip text={c.rec} color={c.recC}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[
                  {l:"Flujo",v:fmtM(c.flujoNeto),c:pos?"#22c55e":"#ef4444"},
                  {l:"CaC",v:fmt(c.cashOnCash,1)+"%",c:c.cashOnCash>5?"#22c55e":c.cashOnCash>0?"#f59e0b":"#ef4444"},
                  {l:"Cap Rate",v:fmt(c.capRate,1)+"%",c:"#94a3b8"},
                  {l:"Vacancia",v:fmt(c.vacanciaRate,0)+"%",c:c.vacanciaRate>15?"#ef4444":c.vacanciaRate>8?"#f59e0b":"#22c55e"},
                ].map(k=>(
                  <div key={k.l}>
                    <div style={{fontSize:9,color:"#475569",marginBottom:2}}>{k.l}</div>
                    <div style={{fontSize:12,fontWeight:700,color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <Spark data={d.historial} color={pos?"#22c55e":"#f59e0b"}/>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9"}}>${fmt(d.arriendoActual)}</div>
                  {c.gapArriendo!==0&&<div style={{fontSize:10,color:c.gapArriendo>0?"#3b82f6":"#ef4444"}}>
                    {c.gapArriendo>0?"↑":"↓"} ${fmt(Math.abs(c.gapArriendo))} vs mercado
                  </div>}
                </div>
              </div>
            </div>
          );
        })}

        {/* botón agregar */}
        <button onClick={onNuevo} style={{
          background:bloqueado?"rgba(255,255,255,0.03)":"rgba(59,130,246,0.08)",
          border:bloqueado?"2px dashed rgba(255,255,255,0.1)":"2px dashed rgba(59,130,246,0.3)",
          borderRadius:14,padding:"18px",cursor:"pointer",
          color:bloqueado?"#334155":"#3b82f6",
          fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        }}>
          {bloqueado?"🔒 Agregar propiedad — requiere Pro":"+ Agregar propiedad"}
        </button>

        {/* sin propiedades aún: ofrecer un ejemplo para ver el valor sin digitar nada */}
        {deptos.length === 0 && onDemo && (
          <button onClick={onDemo} style={{
            background:"none",border:"none",color:"#64748b",fontSize:12,fontWeight:600,
            cursor:"pointer",padding:"4px 0",textDecoration:"underline",textUnderlineOffset:3,
          }}>
            👀 ¿No tienes los datos a mano? Ver con una propiedad de ejemplo
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BLOQUE PAYWALL INLINE ────────────────────────────────────────────────────
function PaywallInline({ onPagar, mensaje }) {
  return (
    <div onClick={onPagar} style={{
      background:"linear-gradient(135deg,rgba(59,130,246,0.1),rgba(99,102,241,0.1))",
      border:"1px dashed rgba(59,130,246,0.4)",
      borderRadius:12,padding:"20px 16px",cursor:"pointer",
      display:"flex",flexDirection:"column",alignItems:"center",gap:8,textAlign:"center",
    }}>
      <span style={{fontSize:28}}>🔒</span>
      <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{mensaje}</div>
      <div style={{fontSize:11,color:"#475569"}}>Disponible en el plan Pro</div>
      <div style={{marginTop:4,background:"linear-gradient(135deg,#3b82f6,#6366f1)",color:"#fff",fontSize:12,fontWeight:800,padding:"8px 20px",borderRadius:20}}>
        Activar Pro — $9.990/mes →
      </div>
    </div>
  );
}

// ─── VISTA DETALLE ────────────────────────────────────────────────────────────
function VistaDetalle({ d, onBack, onEditar, onEliminar, acceso, onPagar }) {
  const c = calc(d);
  const [tab, setTab] = useState("resumen");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const gastosMes = d.dividendoMensual+d.contribuciones+d.gastosComunes+d.seguros+d.otrosGastos;
  const flujoMes = d.arriendoActual - gastosMes;
  const gastos = [
    {l:"Dividendo",m:d.dividendoMensual,c:"#8b5cf6"},
    {l:"Contribuciones",m:d.contribuciones,c:"#3b82f6"},
    {l:"Gs. comunes",m:d.gastosComunes,c:"#0ea5e9"},
    {l:"Seguros",m:d.seguros,c:"#f59e0b"},
    {l:"Otros",m:d.otrosGastos,c:"#ef4444"},
  ];

  return (
    <div style={{paddingBottom:80}}>
      <div style={{padding:"12px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#3b82f6",fontSize:13,cursor:"pointer",padding:0}}>← Volver</button>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onEditar} style={{background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#3b82f6",fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:8,cursor:"pointer"}}>✏️ Editar</button>
            <button onClick={()=>setConfirmarEliminar(true)} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:8,cursor:"pointer"}}>🗑</button>
          </div>
        </div>

        {c.deudaStale&&(
          <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#f59e0b"}}>
            🕐 Saldo de deuda actualizado hace {c.mesesDeuda} meses — considera revisar tu cartola bancaria.
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#f8fafc"}}>{d.nombre}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>{d.tipo} · {d.m2} m² · {d.comuna} · {fmtUF(d.valorMercado)}</div>
          </div>
          <Chip text={c.rec} color={c.recC}/>
        </div>
      </div>

      {/* modal confirmación */}
      {confirmarEliminar&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#0f172a",borderRadius:16,padding:24,border:"1px solid rgba(255,255,255,0.1)",maxWidth:320,width:"100%"}}>
            <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",marginBottom:8}}>¿Eliminar propiedad?</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:20}}>Esta acción no se puede deshacer.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmarEliminar(false)} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:14,fontWeight:700,padding:"11px",borderRadius:10,cursor:"pointer"}}>Cancelar</button>
              <button onClick={onEliminar} style={{flex:1,background:"#ef4444",border:"none",color:"#fff",fontSize:14,fontWeight:700,padding:"11px",borderRadius:10,cursor:"pointer"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs — flujo siempre visible, avanzados solo Pro */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"12px 16px"}}>
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:10,color:"#475569",marginBottom:4}}>Flujo /mes</div>
          <div style={{fontSize:22,fontWeight:800,color:flujoMes>=0?"#22c55e":"#ef4444"}}>{fmtM(flujoMes)}</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:10,color:"#475569",marginBottom:4}}>Flujo anual</div>
          <div style={{fontSize:22,fontWeight:800,color:c.flujoNeto>=0?"#22c55e":"#ef4444"}}>{fmtM(c.flujoNeto)}</div>
        </div>
        {acceso ? <>
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{fontSize:10,color:"#475569",marginBottom:4}}>Cash-on-Cash</div>
            <div style={{fontSize:22,fontWeight:800,color:c.cashOnCash>5?"#22c55e":"#f59e0b"}}>{fmt(c.cashOnCash,1)}%</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{fontSize:10,color:"#475569",marginBottom:4}}>LTV</div>
            <div style={{fontSize:22,fontWeight:800,color:c.ltv>80?"#ef4444":c.ltv>60?"#f59e0b":"#22c55e"}}>{fmt(c.ltv,0)}%</div>
          </div>
        </> : <>
          {["Cash-on-Cash","Cap Rate"].map(l=>(
            <div key={l} onClick={onPagar} style={{background:"rgba(59,130,246,0.05)",borderRadius:12,padding:"12px 14px",border:"1px dashed rgba(59,130,246,0.3)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
              <span style={{fontSize:16}}>🔒</span>
              <div style={{fontSize:10,color:"#3b82f6",fontWeight:700}}>{l}</div>
              <div style={{fontSize:9,color:"#475569"}}>Solo Pro</div>
            </div>
          ))}
        </>}
      </div>

      {/* Recomendacion */}
      {!acceso && (
        <div style={{margin:"0 16px 12px"}}>
          <PaywallInline onPagar={onPagar} mensaje="Desbloquea la recomendación: ¿mantener, vender o ajustar precio?"/>
        </div>
      )}
      {acceso && (
        <div style={{margin:"0 16px 12px",background:c.recC+"15",border:`1px solid ${c.recC}44`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:22}}>🎯</div>
          <div>
            <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Recomendación</div>
            <div style={{fontSize:16,fontWeight:800,color:c.recC}}>{c.rec}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:2,padding:"0 16px",borderBottom:"1px solid rgba(255,255,255,0.07)",overflowX:"auto",scrollbarWidth:"none"}}>
        {["resumen","gastos","deuda","escenarios"].map(t=>{
          const bloqueado = !acceso && ["gastos","deuda","escenarios"].includes(t);
          return (
            <button key={t} onClick={()=>bloqueado?onPagar():setTab(t)} style={{
              background:tab===t?"rgba(255,255,255,0.08)":"transparent",
              border:"none",color:bloqueado?"#334155":tab===t?"#f1f5f9":"#475569",
              fontSize:12,fontWeight:tab===t?700:400,
              padding:"8px 14px",borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",
            }}>{bloqueado?"🔒 ":""}{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          );
        })}
      </div>

      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
        {tab==="resumen"&&<>
          <Card>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Ingresos</div>
            <LI l="Arriendo actual" v={"$"+fmt(d.arriendoActual)} bold/>
            <LI l="Meses arrendados" v={d.mesesArriendados+"/12"}/>
            <LI l="Meses vacancia" v={d.mesesVacancia+" meses"} c={d.mesesVacancia>2?"#ef4444":"#94a3b8"}/>
            {acceso ? <>
              <LI l="Precio de mercado" v={"$"+fmt(d.arriendoMercado)}/>
              <LI l="Diferencia vs mercado" v={fmtM(c.gapArriendo)} c={c.gapArriendo>=0?"#3b82f6":"#ef4444"}/>
            </> : <div onClick={onPagar} style={{padding:"8px 0",display:"flex",alignItems:"center",gap:6,cursor:"pointer",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
              <span style={{fontSize:12}}>🔒</span>
              <span style={{fontSize:12,color:"#334155"}}>Comparación vs mercado — Pro</span>
            </div>}
          </Card>
          <Card>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Egresos</div>
            <LI l="Total egresos /mes" v={"$"+fmt(gastosMes)} bold/>
            {acceso
              ? gastos.map(g=><LI key={g.l} l={g.l} v={"$"+fmt(g.m)} dot={g.c}/>)
              : <div onClick={onPagar} style={{padding:"8px 0",display:"flex",alignItems:"center",gap:6,cursor:"pointer",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
                  <span style={{fontSize:12}}>🔒</span>
                  <span style={{fontSize:12,color:"#334155"}}>Desglose detallado de gastos — Pro</span>
                </div>
            }
          </Card>
          {acceso && <Card>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Patrimonio</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <KS l="Valor mercado" v={fmtUF(d.valorMercado)}/>
              <KS l="Deuda" v={d.deudaHipotecaria>0?fmtUF(d.deudaHipotecaria):"Sin deuda"}/>
              <KS l="Equity" v={fmtUF(c.equity)} c="#22c55e"/>
              <KS l="Plusvalía esp." v={d.plusvalia?fmt(d.plusvalia,1)+"%/año":"–"}/>
            </div>
          </Card>}
          {!acceso && <PaywallInline onPagar={onPagar} mensaje="Análisis completo: patrimonio, equity y deuda"/>}
        </>}

        {tab==="gastos"&&(
          <Card>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Desglose mensual</div>
            {gastos.map(g=>(
              <div key={g.l} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:12,color:"#94a3b8",display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:g.c,display:"inline-block"}}/>
                    {g.l}
                  </span>
                  <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>${fmt(g.m)}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <BarLine value={g.m} max={gastosMes} color={g.c}/>
                  <span style={{fontSize:10,color:"#475569",minWidth:28,textAlign:"right"}}>{gastosMes>0?fmt(g.m/gastosMes*100,0):0}%</span>
                </div>
              </div>
            ))}
            <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:10,marginTop:4,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Total</span>
              <span style={{fontSize:16,fontWeight:800,color:"#ef4444"}}>${fmt(gastosMes)}</span>
            </div>
          </Card>
        )}

        {tab==="deuda"&&(
          <Card>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Situación hipotecaria</div>
            {d.deudaHipotecaria===0?(
              <div style={{textAlign:"center",padding:"28px 0",color:"#22c55e",fontSize:15,fontWeight:700}}>✅ Libre de deuda</div>
            ):<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                <KS l="Deuda total" v={"$"+fmt(d.deudaHipotecaria/1_000_000,1)+"M"} c="#ef4444"/>
                <KS l="Dividendo /mes" v={"$"+fmt(d.dividendoMensual)}/>
                <KS l="LTV" v={fmt(c.ltv,0)+"%"} c={c.ltv>80?"#ef4444":"#f59e0b"}/>
                <KS l="Equity" v={"$"+fmt(c.equity/1_000_000,1)+"M"} c="#22c55e"/>
              </div>
              {c.deudaStale&&(
                <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#f59e0b"}}>
                  🕐 Saldo actualizado hace {c.mesesDeuda} meses. Ve a Editar para actualizarlo.
                </div>
              )}
              <div style={{fontSize:11,color:"#475569",marginBottom:6}}>Cobertura arriendo vs dividendo</div>
              <BarLine value={d.arriendoActual} max={d.dividendoMensual*1.5||1} color={d.arriendoActual>=d.dividendoMensual?"#22c55e":"#ef4444"}/>
              <div style={{fontSize:12,marginTop:6,color:d.arriendoActual>=d.dividendoMensual?"#22c55e":"#ef4444"}}>
                {d.dividendoMensual>0
                  ?(d.arriendoActual>=d.dividendoMensual?`✅ Cubre ${fmt(d.arriendoActual/d.dividendoMensual*100,0)}%`:`⚠️ Cubre solo ${fmt(d.arriendoActual/d.dividendoMensual*100,0)}%`)
                  :"Sin dividendo"}
              </div>
            </>}
          </Card>
        )}

        {tab==="escenarios"&&<EscenariosTab d={d} c={c}/>}
      </div>
    </div>
  );
}

function EscenariosTab({d,c}){
  const [pA,setPA]=useState(0),[pG,setPG]=useState(0),[vac,setVac]=useState(d.mesesVacancia);
  const gastosMes=d.dividendoMensual+d.contribuciones+d.gastosComunes+d.seguros+d.otrosGastos;
  const nA=d.arriendoActual*(1+pA/100), nG=gastosMes*(1+pG/100);
  const nFlujoAnual=nA*(12-vac)-nG*12, nCaC=c.equity>0?(nFlujoAnual/c.equity)*100:0;
  const SL=({label,value,onChange,min,max,unit,color})=>(
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
        <span style={{fontSize:13,fontWeight:700,color:value>0?"#22c55e":value<0?"#ef4444":"#94a3b8"}}>{value>0?"+":""}{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:color}}/>
    </div>
  );
  return(<>
    <Card>
      <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Simulador</div>
      <SL label="Ajuste arriendo" value={pA} onChange={setPA} min={-20} max={40} unit="%" color="#3b82f6"/>
      <SL label="Variación gastos" value={pG} onChange={setPG} min={-30} max={30} unit="%" color="#f59e0b"/>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:12,color:"#94a3b8"}}>Meses vacancia</span>
          <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{vac} meses</span>
        </div>
        <input type="range" min={0} max={12} value={vac} onChange={e=>setVac(+e.target.value)} style={{width:"100%",accentColor:"#8b5cf6"}}/>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {[
        {l:"Arriendo nuevo",v:"$"+fmt(nA),o:"$"+fmt(d.arriendoActual),up:nA>d.arriendoActual},
        {l:"Flujo /mes",v:fmtM(nA-nG),o:fmtM(d.arriendoActual-gastosMes),up:nA-nG>d.arriendoActual-gastosMes},
        {l:"Flujo anual",v:"$"+fmt(nFlujoAnual/1_000_000,2)+"M",o:"$"+fmt(c.flujoNeto/1_000_000,2)+"M",up:nFlujoAnual>c.flujoNeto},
        {l:"Cash-on-Cash",v:fmt(nCaC,1)+"%",o:fmt(c.cashOnCash,1)+"%",up:nCaC>c.cashOnCash},
      ].map(k=>(
        <div key={k.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:10,color:"#475569",marginBottom:4}}>{k.l}</div>
          <div style={{fontSize:16,fontWeight:800,color:k.up?"#22c55e":"#ef4444"}}>{k.v}</div>
          <div style={{fontSize:10,color:"#475569"}}>Antes: {k.o}</div>
        </div>
      ))}
    </div>
  </>);
}

// ─── VISTA PORTAFOLIO ─────────────────────────────────────────────────────────
// Tarjeta "Recomendación con IA" del portafolio. El análisis lo genera la
// Cloud Function analisisIA (solo Pro; cacheado 1 h en el servidor).
function AnalisisIA({ acceso, onPagar }) {
  const [analisis, setAnalisis] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const generar = async () => {
    if (cargando) return;
    setError(""); setCargando(true);
    try {
      const { data } = await httpsCallable(functions, "analisisIA")({});
      track("analisis_ia_generado", { cached: data.cached });
      setAnalisis(data.analisis);
    } catch (e) {
      if (e.code === "functions/failed-precondition") setError("Agrega al menos una propiedad para generar el análisis.");
      else if (e.code === "functions/permission-denied") setError("El análisis con IA es parte de Rentiq Pro.");
      else setError("No se pudo generar el análisis. Intenta de nuevo en unos minutos.");
    }
    setCargando(false);
  };

  return (
    <div style={{background:"linear-gradient(135deg,rgba(139,92,246,0.10),rgba(59,130,246,0.10))",border:"1px solid rgba(139,92,246,0.35)",borderRadius:12,padding:"14px 16px",marginTop:6}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:analisis||error?10:4}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#f1f5f9"}}>✨ Recomendación con IA</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:1}}>Análisis de gestión e inversión de tu portafolio</div>
        </div>
        {acceso ? (
          <button onClick={generar} disabled={cargando} style={{background:"rgba(139,92,246,0.25)",border:"1px solid rgba(139,92,246,0.5)",color:"#c4b5fd",fontSize:12,fontWeight:700,padding:"9px 14px",borderRadius:9,cursor:cargando?"wait":"pointer",opacity:cargando?0.7:1,flexShrink:0}}>
            {cargando?"Analizando…":analisis?"Actualizar":"Generar"}
          </button>
        ) : (
          <button onClick={onPagar} style={{background:"rgba(139,92,246,0.25)",border:"1px solid rgba(139,92,246,0.5)",color:"#c4b5fd",fontSize:12,fontWeight:700,padding:"9px 14px",borderRadius:9,cursor:"pointer",flexShrink:0}}>
            🔒 Pro
          </button>
        )}
      </div>
      {cargando&&(
        <div style={{fontSize:12,color:"#64748b",display:"flex",alignItems:"center",gap:8}}>
          <span style={{width:13,height:13,border:"2px solid rgba(139,92,246,0.3)",borderTopColor:"#8b5cf6",borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite"}}/>
          Claude está revisando tus propiedades. Esto puede tardar hasta un minuto.
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {error&&<div style={{fontSize:12,color:"#ef4444"}}>{error}</div>}
      {analisis&&!cargando&&(
        <div style={{fontSize:12.5,color:"#cbd5e1",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{analisis}</div>
      )}
    </div>
  );
}

function VistaPortafolio({ deptos, acceso, onPagar }) {
  const all = deptos.map(calc);
  if (all.length === 0) return (
    <div style={{padding:"60px 24px",textAlign:"center",color:"#475569"}}>
      <div style={{fontSize:36,marginBottom:12}}>📊</div>
      <div style={{fontSize:14,fontWeight:700,color:"#94a3b8",marginBottom:6}}>Aún no hay propiedades</div>
      <div style={{fontSize:12}}>Agrega tu primera propiedad en la pestaña Deptos para ver el resumen consolidado.</div>
    </div>
  );
  const tV=all.reduce((s,d)=>s+d.valorMercado,0);
  const tD=all.reduce((s,d)=>s+d.deudaHipotecaria,0);
  const tF=all.reduce((s,d)=>s+d.flujoNeto,0);
  const tA=all.reduce((s,d)=>s+d.arriendoActual,0);
  const avgCap=all.reduce((s,d)=>s+d.capRate,0)/all.length;
  return (
    <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10,paddingBottom:80}}>
      <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Resumen consolidado</div>
      {[
        {l:"Valor total portafolio",v:fmtUF(tV),s:"$"+fmt(tV/1_000_000,1)+"M CLP",c:"#f1f5f9"},
        {l:"Equity total",v:fmtUF(tV-tD),s:fmt((tV-tD)/tV*100,0)+"% del valor",c:"#22c55e"},
        {l:"Deuda total",v:fmtUF(tD),s:"LTV: "+fmt(tD/tV*100,0)+"%",c:"#f59e0b"},
        {l:"Flujo anual neto",v:fmtM(tF),s:fmtM(tF/12)+" /mes",c:tF>=0?"#22c55e":"#ef4444"},
        {l:"Arriendo total /mes",v:"$"+fmt(tA),s:all.filter(d=>d.arriendoActual>0).length+"/"+all.length+" arrendados",c:"#3b82f6"},
        {l:"Cap Rate promedio",v:fmt(avgCap,2)+"%",s:"sobre valor de mercado",c:"#94a3b8"},
      ].map(k=>(
        <div key={k.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,color:"#475569"}}>{k.l}</div>
            <div style={{fontSize:10,color:"#334155",marginTop:1}}>{k.s}</div>
          </div>
          <div style={{fontSize:20,fontWeight:800,color:k.c}}>{k.v}</div>
        </div>
      ))}
      <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginTop:6,marginBottom:2}}>Estado por propiedad</div>
      {all.map(d=>(
        <div key={d.id} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9"}}>{d.nombre}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:1}}>Flujo: {fmtM(d.flujoNeto)} · CaC: {fmt(d.cashOnCash,1)}%</div>
          </div>
          <Chip text={d.rec} color={d.recC}/>
        </div>
      ))}
      <AnalisisIA acceso={acceso} onPagar={onPagar}/>
    </div>
  );
}

// ─── EVALUAR COMPRA ───────────────────────────────────────────────────────────
// Arriendo de mercado estimado por comuna, en $/m²/mes. Valores semilla
// referenciales; se irán refinando con los arriendos reales de los usuarios.
const ARRIENDO_M2 = {
  "Vitacura": 13000, "Las Condes": 12000, "Providencia": 11000,
  "Ñuñoa": 9500, "La Reina": 9500, "San Miguel": 8500,
  "Huechuraba": 8000, "Santiago Centro": 8000, "Peñalolén": 7800,
  "Macul": 7500, "Estación Central": 7500, "Independencia": 7500,
  "La Florida": 7000, "La Cisterna": 7000, "Maipú": 6500,
};
const EVAL_COMUNAS = Object.keys(ARRIENDO_M2);

// Rentabilidad neta = (arriendo anual − contribuciones − administración) / precio.
// No se cuentan gastos comunes (los paga el arrendatario) ni provisión de vacancia.
function evaluarCompra(precioUF, m2, comuna) {
  const benchmark = ARRIENDO_M2[comuna] || 0;
  const precioCLP = precioUF * UF_CLP;
  const arriendoMensual = m2 * benchmark;
  const arriendoAnual = arriendoMensual * 12;
  const contribuciones = precioCLP * 0.005;
  const administracion = arriendoAnual * 0.08;
  const flujoNeto = arriendoAnual - contribuciones - administracion;
  const rentNeta = precioCLP > 0 ? (flujoNeto / precioCLP) * 100 : 0;
  // Escala anclada al mercado chileno: 6% neto ≈ nota 10, 3% ≈ nota 5.
  const nota = Math.max(1, Math.min(10, Math.round(rentNeta / 0.6)));
  const targetNota = Math.min(nota + 1, 10);
  const targetRentFrac = targetNota * 0.006;
  const precioObjetivoUF = (arriendoAnual * 0.92) / (targetRentFrac + 0.005) / UF_CLP;
  return { precioUF, arriendoMensual, arriendoAnual, contribuciones, administracion, flujoNeto, rentNeta, nota, targetNota, precioObjetivoUF };
}

// Escenario con crédito hipotecario: rentabilidad sobre el pie (cash-on-cash).
function evaluarCredito(res, piePct, tasaAnual, plazoAnios) {
  const precioCLP = res.precioUF * UF_CLP;
  const equity = precioCLP * (piePct / 100);
  const credito = precioCLP - equity;
  const i = tasaAnual / 100 / 12;
  const n = plazoAnios * 12;
  const dividendo = i > 0 && n > 0 ? credito * i / (1 - Math.pow(1 + i, -n)) : (n > 0 ? credito / n : 0);
  const flujoMensual = res.arriendoMensual - res.contribuciones / 12 - res.administracion / 12 - dividendo;
  const cashOnCash = equity > 0 ? (flujoMensual * 12) / equity * 100 : 0;
  // Abono a capital del primer año: la parte del dividendo que no es interés
  // (deuda que pagas y se convierte en patrimonio tuyo).
  let saldo = credito, abonoCapitalAnual = 0;
  for (let m = 0; m < Math.min(12, n); m++) {
    const interes = saldo * i;
    const abono = dividendo - interes;
    abonoCapitalAnual += abono;
    saldo -= abono;
  }
  const rentPatrimonial = equity > 0 ? (flujoMensual * 12 + abonoCapitalAnual) / equity * 100 : 0;
  return { equity, credito, dividendo, flujoMensual, cashOnCash, abonoCapitalAnual, rentPatrimonial };
}

function veredictoNota(nota) {
  if (nota <= 3) return { txt: "Inversión débil", c: "#ef4444" };
  if (nota <= 5) return { txt: "Rentabilidad ajustada", c: "#f59e0b" };
  if (nota <= 7) return { txt: "Buena inversión", c: "#3b82f6" };
  return { txt: "Muy potente", c: "#22c55e" };
}

function EvaluarCompra() {
  const [link, setLink] = useState("");
  const [precio, setPrecio] = useState("");
  const [m2, setM2] = useState("");
  const [comuna, setComuna] = useState("Ñuñoa");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [conCredito, setConCredito] = useState(false);
  const [pie, setPie] = useState("20");
  const [tasa, setTasa] = useState("4,5");
  const [plazo, setPlazo] = useState("25");

  const inputStyle = {width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,fontWeight:600,padding:"11px 12px",outline:"none",boxSizing:"border-box"};

  const evaluar = () => {
    const p = parseInt(String(precio).replace(/\D/g,"")) || 0;
    const s = parseInt(String(m2).replace(/\D/g,"")) || 0;
    if (!p || !s) { setErr("Ingresa el precio en UF y la superficie en m²."); setRes(null); return; }
    setErr("");
    track("evaluacion_realizada", { comuna });
    setRes(evaluarCompra(p, s, comuna));
  };

  const numF = (s) => parseFloat(String(s).replace(",",".").replace(/[^\d.]/g,"")) || 0;
  const v = res ? veredictoNota(res.nota) : null;
  const CIRC = 289, off = res ? CIRC * (1 - res.nota/10) : CIRC;
  const cred = res && conCredito ? evaluarCredito(res, numF(pie), numF(tasa), numF(plazo)) : null;

  return (
    <div style={{padding:"14px 16px",paddingBottom:90,display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>Evaluar una compra</div>
        <div style={{fontSize:12,color:"#475569",marginTop:2}}>Pega el link de la publicación y completa 3 datos para obtener una nota de rentabilidad.</div>
      </div>

      <Card>
        <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Link de la publicación <span style={{color:"#475569",fontWeight:400}}>(opcional)</span></label>
        <input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://portalinmobiliario.com/..." style={{...inputStyle,marginBottom:14,fontWeight:400,fontSize:13}}/>

        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1}}>
            <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Precio (UF)</label>
            <input value={precio} onChange={e=>setPrecio(e.target.value)} placeholder="3.900" inputMode="numeric" style={inputStyle}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Superficie (m²)</label>
            <input value={m2} onChange={e=>setM2(e.target.value)} placeholder="62" inputMode="numeric" style={inputStyle}/>
          </div>
        </div>

        <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Comuna</label>
        <select value={comuna} onChange={e=>setComuna(e.target.value)} style={{...inputStyle,marginBottom:16}}>
          {EVAL_COMUNAS.map(c=><option key={c} value={c} style={{background:"#0f172a"}}>{c}</option>)}
        </select>

        {err&&<div style={{fontSize:11,color:"#ef4444",marginBottom:10}}>{err}</div>}
        <button onClick={evaluar} style={{width:"100%",background:"linear-gradient(135deg,#3b82f6,#6366f1)",border:"none",color:"#fff",fontSize:14,fontWeight:800,padding:"13px",borderRadius:12,cursor:"pointer"}}>Evaluar inversión</button>
      </Card>

      {res&&<>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 0"}}>
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10"/>
            <circle cx="65" cy="65" r="46" fill="none" stroke={v.c} strokeWidth="10" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={off} transform="rotate(-90 65 65)"/>
            <text x="65" y="63" textAnchor="middle" fontSize="38" fontWeight="800" fill="#f1f5f9">{res.nota}</text>
            <text x="65" y="84" textAnchor="middle" fontSize="13" fill="#475569">de 10</text>
          </svg>
          <div style={{marginTop:8,background:v.c+"22",border:`1px solid ${v.c}55`,color:v.c,fontSize:13,fontWeight:800,padding:"5px 16px",borderRadius:20}}>{v.txt}</div>
        </div>

        <Card>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Cómo se calculó</div>
          <LI l="Arriendo estimado /mes" v={"$"+fmt(res.arriendoMensual)} c="#94a3b8"/>
          <LI l="Arriendo anual" v={"$"+fmt(res.arriendoAnual)} bold/>
          <LI l="− Contribuciones (0,5% del precio)" v={"−$"+fmt(res.contribuciones)} c="#ef4444"/>
          <LI l="− Administración/seguros (8%)" v={"−$"+fmt(res.administracion)} c="#ef4444"/>
          <LI l="Flujo neto anual" v={"$"+fmt(res.flujoNeto)} bold/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,marginTop:4,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Rentabilidad neta anual</span>
            <span style={{fontSize:18,fontWeight:800,color:v.c}}>{fmt(res.rentNeta,1)}%</span>
          </div>
        </Card>

        {res.nota<10&&(
          <div style={{background:"linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.12))",border:"1px solid rgba(59,130,246,0.3)",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>🎯</span>
            <div>
              <div style={{fontSize:10,color:"#475569"}}>Precio objetivo para llegar a {res.targetNota}/10</div>
              <div style={{fontSize:15,fontWeight:800,color:"#3b82f6"}}>Ofrece máximo {fmt(res.precioObjetivoUF,0)} UF</div>
            </div>
          </div>
        )}

        {/* Switch: simular con crédito */}
        <button onClick={()=>setConCredito(c=>!c)} style={{width:"100%",background:conCredito?"rgba(139,92,246,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${conCredito?"rgba(139,92,246,0.4)":"rgba(255,255,255,0.1)"}`,color:conCredito?"#a78bfa":"#94a3b8",fontSize:13,fontWeight:700,padding:"12px",borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          🏦 {conCredito?"Ocultar simulación con crédito":"Simular con crédito hipotecario"}
        </button>

        {cred&&<Card>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Escenario con crédito</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <div style={{flex:1}}>
              <label style={{fontSize:11,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:4}}>Pie (%)</label>
              <input value={pie} onChange={e=>setPie(e.target.value)} inputMode="decimal" style={{...inputStyle,padding:"9px 10px"}}/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:11,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:4}}>Tasa anual (%)</label>
              <input value={tasa} onChange={e=>setTasa(e.target.value)} inputMode="decimal" style={{...inputStyle,padding:"9px 10px"}}/>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:11,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:4}}>Plazo (años)</label>
              <input value={plazo} onChange={e=>setPlazo(e.target.value)} inputMode="numeric" style={{...inputStyle,padding:"9px 10px"}}/>
            </div>
          </div>
          <LI l="Pie (de tu bolsillo)" v={"$"+fmt(cred.equity)} bold/>
          <LI l="Dividendo mensual" v={"−$"+fmt(cred.dividendo)} c="#ef4444"/>
          <LI l="Flujo mensual con crédito" v={fmtM(cred.flujoMensual)} c={cred.flujoMensual>=0?"#22c55e":"#ef4444"} bold/>
          <LI l="Abono a capital (1er año)" v={"+$"+fmt(cred.abonoCapitalAnual)} c="#22c55e"/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:6}}>
            <span style={{fontSize:12,color:"#94a3b8"}}>Rentabilidad de caja</span>
            <span style={{fontSize:14,fontWeight:700,color:cred.cashOnCash>=0?"#22c55e":"#ef4444"}}>{fmt(cred.cashOnCash,1)}%</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,marginTop:2,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
            <div>
              <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Rentabilidad patrimonial</span>
              <div style={{fontSize:9,color:"#475569"}}>incluye abono a capital</div>
            </div>
            <span style={{fontSize:18,fontWeight:800,color:cred.rentPatrimonial>=0?"#22c55e":"#ef4444"}}>{fmt(cred.rentPatrimonial,1)}%</span>
          </div>
          <div style={{fontSize:10,color:"#475569",marginTop:10,lineHeight:1.5}}>
            La <b style={{color:"#94a3b8",fontWeight:700}}>rentabilidad de caja</b> es solo el flujo de tu bolsillo. La <b style={{color:"#94a3b8",fontWeight:700}}>patrimonial</b> suma el abono a capital (deuda que pagas y se vuelve tuya). Ninguna incluye la plusvalía.
          </div>
        </Card>}

        <div style={{fontSize:10,color:"#334155",textAlign:"center",lineHeight:1.5,padding:"0 8px"}}>
          Estimación referencial basada en arriendos promedio por comuna. La nota mide la rentabilidad al contado; el crédito es un escenario aparte. No reemplaza una tasación.
        </div>
      </>}
    </div>
  );
}

// ─── DECLARACIÓN DE RENTA (PRO) ───────────────────────────────────────────────
// Estima cuánto debe pagar (o cuánto le devuelven) a un arrendador persona
// natural en la operación renta de abril. Toma los arriendos ya registrados en
// Rentiq, los suma a la renta del trabajo para determinar el tramo del Impuesto
// Global Complementario (IGC), descuenta lo que el empleador ya retuvo mes a mes,
// y calcula automáticamente el régimen (general vs simplificado) que más conviene.
//
// ⚠️ Cifras REFERENCIALES. La tabla del IGC y el valor de la UTA cambian cada
// año — actualizarlos en sii.cl antes de cada temporada de renta.

// Valor referencial de la UTA (Unidad Tributaria Anual). ACTUALIZAR cada año.
const UTA_CLP = 803_376;

// Tasa anual referencial para estimar los intereses hipotecarios a partir del
// saldo de la deuda (el interés anual ≈ saldo × tasa). Es solo una estimación
// inicial; el usuario debe reemplazarla con el monto real del certificado del banco.
const TASA_HIPOTECARIA_EST = 0.045;

// Tabla del IGC anual. Los límites y la rebaja van en UTA (así la publica el SII).
const TABLA_IGC = [
  { hastaUTA: 13.5,     factor: 0,     rebajaUTA: 0 },
  { hastaUTA: 30,       factor: 0.04,  rebajaUTA: 0.54 },
  { hastaUTA: 50,       factor: 0.08,  rebajaUTA: 1.74 },
  { hastaUTA: 70,       factor: 0.135, rebajaUTA: 4.49 },
  { hastaUTA: 90,       factor: 0.23,  rebajaUTA: 11.14 },
  { hastaUTA: 120,      factor: 0.304, rebajaUTA: 17.80 },
  { hastaUTA: 310,      factor: 0.35,  rebajaUTA: 23.32 },
  { hastaUTA: Infinity, factor: 0.40,  rebajaUTA: 38.82 },
];

// Impuesto Global Complementario anual (en pesos) sobre una renta anual en pesos.
function igc(rentaAnualCLP) {
  if (rentaAnualCLP <= 0) return 0;
  const rentaUTA = rentaAnualCLP / UTA_CLP;
  const tramo = TABLA_IGC.find(t => rentaUTA <= t.hastaUTA);
  return Math.max(0, (rentaUTA * tramo.factor - tramo.rebajaUTA) * UTA_CLP);
}

// Tasa marginal (tramo) del IGC para una renta anual, como fracción (0–0.40).
function tramoIGC(rentaAnualCLP) {
  const rentaUTA = Math.max(0, rentaAnualCLP) / UTA_CLP;
  return TABLA_IGC.find(t => rentaUTA <= t.hastaUTA).factor;
}

// Calcula el resultado tributario en ambos regímenes y elige el que más conviene.
function calcularRenta({ sueldoBrutoMensual, ingresoArriendoAnual, gastosArriendoAnual, interesesHipotecarios }) {
  const rentaTrabajoAnual = sueldoBrutoMensual * 12;
  // Paso 1: lo que el empleador ya retuvo mes a mes (IGC sobre la renta del trabajo).
  const retenciones = igc(rentaTrabajoAnual);

  // Régimen general: gastos reales con comprobantes (incluye intereses hipotecarios).
  const gastosGeneral = gastosArriendoAnual + interesesHipotecarios;
  const arriendoNetoGeneral = Math.max(0, ingresoArriendoAnual - gastosGeneral);
  const igcGeneral = igc(rentaTrabajoAnual + arriendoNetoGeneral);
  const resultadoGeneral = igcGeneral - retenciones;

  // Régimen simplificado: el SII presume un 30% de gasto, sin comprobantes.
  const arriendoNetoSimple = ingresoArriendoAnual * 0.7;
  const igcSimple = igc(rentaTrabajoAnual + arriendoNetoSimple);
  const resultadoSimple = igcSimple - retenciones;

  const generalConviene = resultadoGeneral <= resultadoSimple;
  return {
    rentaTrabajoAnual, retenciones,
    general: { gastos: gastosGeneral, arriendoNeto: arriendoNetoGeneral, igc: igcGeneral, resultado: resultadoGeneral },
    simple:  { arriendoNeto: arriendoNetoSimple, igc: igcSimple, resultado: resultadoSimple },
    ganador: generalConviene ? "general" : "simple",
    resultado: generalConviene ? resultadoGeneral : resultadoSimple,
    ahorro: Math.abs(resultadoGeneral - resultadoSimple),
  };
}

function DeclaracionRenta({ deptos }) {
  // Pre-cargado desde las propiedades ya registradas en Rentiq (gran diferenciador).
  const porPropiedad = deptos.map(d => {
    const dividendoAnual = (Number(d.dividendoMensual)||0) * 12;
    const interesEst = (Number(d.deudaHipotecaria)||0) * TASA_HIPOTECARIA_EST;
    return {
      nombre: d.nombre || "Propiedad",
      arriendoAnual: (Number(d.arriendoActual)||0) * (Number(d.mesesArriendados)||0),
      contribAnual: (Number(d.contribuciones)||0) * 12,
      otrosAnual: ((Number(d.seguros)||0) + (Number(d.otrosGastos)||0)) * 12,
      // Interés anual ≈ saldo × tasa, acotado al dividendo anual.
      interesAnual: Math.round(dividendoAnual > 0 ? Math.min(interesEst, dividendoAnual) : interesEst),
    };
  });
  const sumar = (k) => porPropiedad.reduce((s,p)=>s+p[k],0);
  const arriendoSugerido = sumar("arriendoAnual");
  const contribSugerido = sumar("contribAnual");
  const otrosSugerido = sumar("otrosAnual");
  const interesesSugerido = sumar("interesAnual");

  // Tope de cada slider: una base fija que se amplía si el dato precargado la supera.
  const tope = (base, val) => Math.max(base, Math.ceil((val*1.5)/base)*base);
  const maxSueldo = 8_000_000;
  const maxArriendo = tope(40_000_000, arriendoSugerido);
  const maxInteres = tope(12_000_000, interesesSugerido);
  const maxContrib = tope(3_000_000, contribSugerido);
  const maxOtros = tope(6_000_000, otrosSugerido);

  const [sueldoMensual, setSueldoMensual] = useState(2_000_000);
  const [ingreso, setIngreso] = useState(arriendoSugerido);
  const [intereses, setIntereses] = useState(interesesSugerido);
  const [contribuciones, setContribuciones] = useState(contribSugerido);
  const [otros, setOtros] = useState(otrosSugerido);

  const r = useMemo(() => calcularRenta({
    sueldoBrutoMensual: sueldoMensual,
    ingresoArriendoAnual: ingreso,
    gastosArriendoAnual: contribuciones + otros,
    interesesHipotecarios: intereses,
  }), [sueldoMensual, ingreso, intereses, contribuciones, otros]);

  const esDevolucion = r.resultado < 0;
  const colorRes = esDevolucion ? "#22c55e" : r.resultado > 0 ? "#ef4444" : "#94a3b8";
  const regNombre = r.ganador === "general" ? "General — gastos reales" : "Simplificado — 30% presunto";
  const netoGanador = r.ganador === "general" ? r.general.arriendoNeto : r.simple.arriendoNeto;
  const igcGanador = r.ganador === "general" ? r.general.igc : r.simple.igc;
  const otroResultado = r.ganador === "general" ? r.simple.resultado : r.general.resultado;

  const baseGeneral = r.rentaTrabajoAnual + r.general.arriendoNeto;
  const baseSimple = r.rentaTrabajoAnual + r.simple.arriendoNeto;
  const pct = (f) => fmt(f*100, (f*100) % 1 === 0 ? 0 : 1) + "%";
  const etiquetaRes = (x) => x > 0 ? "Pago adicional" : x < 0 ? "Devolución" : "Sin diferencia";
  const signo = (x) => x < 0 ? "−$"+fmt(Math.abs(x)) : "+$"+fmt(x);

  // Sub-componentes de la calculadora interactiva.
  const Slider = ({ label, sub, value, set, min, max, step, color, sufijo, ultimo }) => (
    <div style={{marginBottom: ultimo ? 0 : 18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,marginBottom:7}}>
        <span style={{fontSize:12,color:"#94a3b8",lineHeight:1.3}}>{label}{sub && <span style={{color:color||"#a78bfa",fontWeight:600}}> {sub}</span>}</span>
        <span style={{fontSize:14,fontWeight:800,color:color||"#f1f5f9",whiteSpace:"nowrap"}}>${fmt(value)}{sufijo||""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>set(+e.target.value)} style={{width:"100%",accentColor:color||"#3b82f6"}}/>
    </div>
  );
  const Paso = ({ n, titulo, children }) => (
    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.4)",color:"#3b82f6",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:600,color:"#94a3b8",marginBottom:8}}>{titulo}</div>
        {children}
      </div>
    </div>
  );
  const Flecha = () => <div style={{textAlign:"center",color:"#334155",fontSize:14,margin:"10px 0"}}>↓</div>;
  const Col = ({ title, value, sub, win }) => (
    <div style={{flex:1,minWidth:0,background:win?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.03)",border:win?"1px solid rgba(34,197,94,0.45)":"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 11px"}}>
      <div style={{fontSize:10,color:win?"#22c55e":"#64748b",marginBottom:3,fontWeight:win?700:400}}>{win?"✓ ":""}{title}</div>
      <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9"}}>{value}</div>
      {sub && <div style={{fontSize:9.5,color:"#475569",marginTop:2,lineHeight:1.3}}>{sub}</div>}
    </div>
  );

  const imprimirResumen = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("Tu navegador bloqueó la ventana. Permite las ventanas emergentes para descargar el resumen."); return; }
    const fila = (l,v)=>`<tr><td style="padding:7px 0;color:#475569">${l}</td><td style="padding:7px 0;text-align:right;font-weight:700">${v}</td></tr>`;
    const titular = esDevolucion
      ? `Devolución estimada: $${fmt(Math.abs(r.resultado))}`
      : r.resultado > 0 ? `Pago estimado en abril: $${fmt(r.resultado)}` : "Sin diferencia a pagar";
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen Declaración de Renta — Rentiq</title></head>
    <body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:32px auto;color:#0f172a;padding:0 16px">
      <h2 style="margin:0">Resumen estimado · Declaración de Renta</h2>
      <p style="color:#64748b;margin:4px 0 20px">Generado con Rentiq — cifras referenciales</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${fila("Renta del trabajo (anual)", "$"+fmt(r.rentaTrabajoAnual))}
        ${fila("Impuesto ya retenido por el empleador", "$"+fmt(r.retenciones))}
        ${fila("Ingreso por arriendo (anual)", "$"+fmt(ingreso))}
        ${fila("Régimen elegido", regNombre)}
        ${fila("Arriendo afecto (neto)", "$"+fmt(netoGanador))}
        ${fila("IGC sobre la renta total", "$"+fmt(igcGanador))}
      </table>
      <h3 style="margin-top:22px;color:${esDevolucion?'#16a34a':r.resultado>0?'#dc2626':'#475569'}">${titular}</h3>
      <p style="font-size:11px;color:#94a3b8;margin-top:28px;line-height:1.5">Estimación referencial generada por Rentiq. No constituye asesoría tributaria ni reemplaza la declaración oficial en el SII. Verifica los montos con tu certificado de rentas y el portal del SII antes de declarar.</p>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div style={{padding:"14px 16px",paddingBottom:96,display:"flex",flexDirection:"column",gap:18}}>
      <div>
        <div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>Declaración de Renta</div>
        <div style={{fontSize:12,color:"#475569",marginTop:2}}>Mueve los valores y mira el resultado en vivo. Plazo SII: 30 de abril.</div>
      </div>

      {/* DATOS DEL USUARIO */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Datos del usuario</div>
        <Card>
          <Slider label="Renta imponible mensual (trabajo)" value={sueldoMensual} set={setSueldoMensual} min={0} max={maxSueldo} step={50_000} sufijo="/mes"/>
          <Slider label="Ingresos anuales por arriendo" value={ingreso} set={setIngreso} min={0} max={maxArriendo} step={100_000}/>
          <Slider label="Intereses hipotecarios anuales" sub="↓ bajan la base" color="#a78bfa" value={intereses} set={setIntereses} min={0} max={maxInteres} step={50_000}/>
          <Slider label="Contribuciones anuales" value={contribuciones} set={setContribuciones} min={0} max={maxContrib} step={10_000}/>
          <Slider label="Otros gastos comprobados (reparaciones, admin, seguros)" value={otros} set={setOtros} min={0} max={maxOtros} step={10_000} ultimo/>
        </Card>
        {interesesSugerido>0 && (
          <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"8px 12px",marginTop:8,fontSize:11,color:"#f59e0b",lineHeight:1.5}}>
            ⚠️ Arriendos, gastos e intereses vienen pre-cargados desde tus propiedades. Los intereses son una estimación (tasa ref. 4,5%): <b>reemplázalos con tu certificado anual del banco</b> antes de declarar.
          </div>
        )}
      </div>

      {/* CÁLCULO PASO A PASO */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Cálculo paso a paso</div>
        <Card>
          <Paso n={1} titulo="Impuesto retenido por empleador (ya pagado mes a mes)">
            <div style={{fontSize:20,fontWeight:800,color:"#f1f5f9"}}>${fmt(r.retenciones)}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>Sueldo anual ${fmt(r.rentaTrabajoAnual)} · tramo {pct(tramoIGC(r.rentaTrabajoAnual))}</div>
          </Paso>
          <Flecha/>
          <Paso n={2} titulo="Base imponible total (trabajo + arriendo neto)">
            <div style={{display:"flex",gap:8}}>
              <Col title="Régimen general" value={"$"+fmt(baseGeneral)} sub={`Arriendo neto $${fmt(r.general.arriendoNeto)} · gastos reales $${fmt(r.general.gastos)}`}/>
              <Col title="Régimen simplificado" value={"$"+fmt(baseSimple)} sub={`Arriendo neto $${fmt(r.simple.arriendoNeto)} · 30% presunto ($${fmt(ingreso*0.3)})`}/>
            </div>
          </Paso>
          <Flecha/>
          <Paso n={3} titulo="IGC total sobre base completa">
            <div style={{display:"flex",gap:8}}>
              <Col title="Régimen general" value={"$"+fmt(r.general.igc)} sub={`tramo ${pct(tramoIGC(baseGeneral))}`}/>
              <Col title="Régimen simplificado" value={"$"+fmt(r.simple.igc)} sub={`tramo ${pct(tramoIGC(baseSimple))}`}/>
            </div>
          </Paso>
          <Flecha/>
          <Paso n={4} titulo="Resultado = IGC total − retenciones ya pagadas">
            <div style={{display:"flex",gap:8}}>
              <Col title="Régimen general" value={signo(r.general.resultado)} sub={etiquetaRes(r.general.resultado)} win={r.ganador==="general"}/>
              <Col title="Régimen simplif." value={signo(r.simple.resultado)} sub={etiquetaRes(r.simple.resultado)} win={r.ganador==="simple"}/>
            </div>
          </Paso>
        </Card>
      </div>

      {/* RESULTADO FINAL */}
      <div style={{background:colorRes+"14",border:`1px solid ${colorRes}55`,borderRadius:14,padding:"18px 16px",textAlign:"center"}}>
        <div style={{fontSize:13,fontWeight:700,color:colorRes,marginBottom:4}}>
          {esDevolucion?"Te devuelven impuesto":r.resultado>0?"Debes pagar impuesto adicional":"Sin diferencia a pagar"}
        </div>
        <div style={{fontSize:32,fontWeight:900,color:colorRes}}>{esDevolucion?"+$"+fmt(Math.abs(r.resultado)):r.resultado>0?"+$"+fmt(r.resultado):"$0"}</div>
        {r.ahorro>0 && (
          <div style={{fontSize:11,color:"#64748b",marginTop:6}}>Régimen {r.ganador==="general"?"general":"simplificado"} · versus {signo(otroResultado)} con el otro régimen</div>
        )}
      </div>

      <button onClick={imprimirResumen} style={{width:"100%",background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.4)",color:"#3b82f6",fontSize:14,fontWeight:700,padding:"13px",borderRadius:12,cursor:"pointer"}}>📄 Descargar resumen (PDF)</button>

      <div style={{fontSize:11,color:"#475569",lineHeight:1.5,textAlign:"center"}}>
        Estimación referencial. No reemplaza la declaración oficial en el SII ni la asesoría de un contador. Verifica los montos con tu certificado de rentas.
      </div>
    </div>
  );
}

// ─── ÍCONOS (SVG inline, sin librerías) ────────────────────────────────────────
const Ic = ({ path, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
);
const IconHome = (p)=><Ic {...p} path={<><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>}/>;
const IconTrendUp = (p)=><Ic {...p} path={<><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></>}/>;
const IconLayers = (p)=><Ic {...p} path={<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>}/>;
const IconLock = (p)=><Ic {...p} path={<><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></>}/>;
const IconFile = (p)=><Ic {...p} path={<><path d="M6 2h9l5 5v15H6z"/><polyline points="15 2 15 7 20 7"/></>}/>;
const IconGauge = (p)=><Ic {...p} path={<><path d="M4 15a8 8 0 1116 0"/><line x1="12" y1="15" x2="15" y2="10"/></>}/>;
const IconChart = (p)=><Ic {...p} path={<><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="10" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="13" width="3" height="5"/></>}/>;
const IconCheck = (p)=><Ic {...p} path={<polyline points="20 6 9 17 4 12"/>}/>;
const IconX = (p)=><Ic {...p} path={<><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>}/>;
const IconArrowRight = (p)=><Ic {...p} path={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>;

// Subrayado ondulado bajo una palabra clave de un titular.
const Squiggle = ({ color = "#c9962f", width = 130 }) => (
  <svg width={width} height="10" viewBox={`0 0 ${width} 10`} style={{display:"block",marginTop:2}} aria-hidden="true">
    <path d={`M2 6 Q ${width*0.25} 0 ${width*0.5} 6 T ${width-2} 6`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>
  </svg>
);

// Gráfico de línea simple (sin librerías) para las previsualizaciones.
const MiniLine = ({ color = "#c9962f", points = "0,40 30,32 60,36 90,20 120,25 150,10 180,15 220,4", h = 40 }) => (
  <svg viewBox={`0 0 220 ${h+10}`} style={{width:"100%",height:h,display:"block"}} aria-hidden="true">
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Gráfico de dona simple (arcos vía stroke-dasharray).
function Donut({ segments, size = 80 }) {
  const r = size*0.375, c = 2*Math.PI*r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <g transform={`translate(${size/2},${size/2}) rotate(-90)`}>
        {segments.map((s,i)=>{
          const dash = (s.pct/100)*c;
          const el = <circle key={i} r={r} fill="none" stroke={s.color} strokeWidth={size*0.175} strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-offset}/>;
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}

// Panel "Resumen patrimonial" del hero: cifras + gráficos, sin depender de capturas reales.
function HeroDashboard() {
  return (
    <div style={{background:"#fff",borderRadius:20,padding:20,boxShadow:"0 24px 60px -20px rgba(0,0,0,0.35)"}}>
      <div style={{fontSize:12,fontWeight:800,color:"#10182b",marginBottom:14}}>Resumen patrimonial</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[{l:"Patrimonio",v:"2.140 UF"},{l:"Flujo /mes",v:"+$320.000",c:"#c9962f"},{l:"Rentabilidad",v:"9,7%",c:"#c9962f"}].map(s=>(
          <div key={s.l} style={{background:"#f8f9fb",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:9.5,color:"#94a3b8",marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:13,fontWeight:800,color:s.c||"#10182b"}}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:14,alignItems:"center",background:"#f8f9fb",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
        <div>
          <div style={{fontSize:9.5,color:"#94a3b8",marginBottom:4}}>Evolución del patrimonio</div>
          <MiniLine color="#c9962f" h={44}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <Donut size={64} segments={[{color:"#c9962f",pct:55},{color:"#10182b",pct:30},{color:"#e5e7eb",pct:15}]}/>
          <div style={{fontSize:9,color:"#94a3b8",textAlign:"center"}}>Distribución<br/>del patrimonio</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:"#f8f9fb",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9.5,color:"#94a3b8",marginBottom:3}}>Proyección flujo mensual</div>
          <div style={{fontSize:13,fontWeight:800,color:"#10182b"}}>$2.4M → $3.2M</div>
        </div>
        <div style={{background:"#f8f9fb",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:9.5,color:"#94a3b8",marginBottom:3}}>Deuda total</div>
          <div style={{fontSize:13,fontWeight:800,color:"#10182b"}}>480 UF</div>
        </div>
      </div>
    </div>
  );
}

// Ilustración de laptop + panel flotante para el banner oscuro.
function DeviceArt() {
  return (
    <div style={{position:"relative",maxWidth:360,margin:"0 auto"}}>
      <div style={{background:"#1b2540",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:18}}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"9px 11px"}}>
            <div style={{fontSize:9,color:"#94a3b8"}}>Patrimonio</div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>2.140 UF</div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"9px 11px"}}>
            <div style={{fontSize:9,color:"#94a3b8"}}>Rentabilidad</div>
            <div style={{fontSize:13,fontWeight:800,color:"#c9962f"}}>9,7%</div>
          </div>
        </div>
        <MiniLine color="#c9962f" h={40}/>
      </div>
      <div style={{position:"absolute",bottom:-26,right:-14,width:118,background:"#1b2540",border:"1px solid rgba(255,255,255,0.15)",borderRadius:16,padding:12,boxShadow:"0 20px 40px -10px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:8.5,color:"#94a3b8",marginBottom:8}}>Flujo /mes</div>
        <Donut size={70} segments={[{color:"#c9962f",pct:60},{color:"#fff",pct:25},{color:"rgba(255,255,255,0.2)",pct:15}]}/>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function Landing({ onEntrar, onPagar, onEvaluar }) {
  const beneficios = [
    { icon:<IconLayers size={22}/>, t:"Administra todo tu patrimonio en un solo lugar" },
    { icon:<IconChart size={22}/>, t:"Gestiónalo a través de métricas de inversión" },
    { icon:<IconGauge size={22}/>, t:"Simula cualquier escenario antes de tomar decisiones" },
    { icon:<IconFile size={22}/>, t:"Estima el efecto de impuestos y declaración de renta" },
    { icon:<IconTrendUp size={22}/>, t:"Valida automáticamente si la inversión en una propiedad determinada vale la pena" },
  ];

  const modulos = [
    {
      tag:"Administración patrimonial", icon:<IconLayers size={22}/>,
      d:"Todos tus arriendos, gastos y deudas en un solo lugar. Rentiq calcula el flujo neto de cada propiedad al instante.",
      prev:(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[{l:"Flujo neto /mes",v:"+$320.000"},{l:"Dividendo",v:"$540.000"},{l:"Arriendo",v:"$860.000"}].map(r=>(
            <div key={r.l} style={{display:"flex",justifyContent:"space-between",background:"#f8f9fb",borderRadius:8,padding:"8px 10px"}}>
              <span style={{fontSize:11,color:"#64748b"}}>{r.l}</span>
              <span style={{fontSize:12,fontWeight:800,color:"#10182b"}}>{r.v}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      tag:"Simulador de escenarios", icon:<IconGauge size={22}/>,
      d:"¿Qué pasa si subo el arriendo 15% o cambio el plazo del crédito? Calcula el impacto en tiempo real.",
      prev:(
        <div>
          <MiniLine color="#c9962f" h={40}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <span style={{fontSize:11,color:"#64748b"}}>Escenario actual</span>
            <span style={{fontSize:12,fontWeight:800,color:"#c9962f"}}>+18% flujo</span>
          </div>
        </div>
      ),
    },
    {
      tag:"Estimación tributaria", icon:<IconFile size={22}/>,
      d:"Estima cuánto pagas o te devuelven por tus arriendos en abril, con tus propiedades ya cargadas.",
      prev:(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",background:"#f8f9fb",borderRadius:8,padding:"8px 10px"}}>
            <span style={{fontSize:11,color:"#64748b"}}>Régimen ganador</span>
            <span style={{fontSize:12,fontWeight:800,color:"#10182b"}}>General</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",background:"#f8f9fb",borderRadius:8,padding:"8px 10px"}}>
            <span style={{fontSize:11,color:"#64748b"}}>Resultado</span>
            <span style={{fontSize:12,fontWeight:800,color:"#c9962f"}}>+$180.000</span>
          </div>
        </div>
      ),
    },
    {
      tag:"Validador inteligente", icon:<IconTrendUp size={22}/>,
      d:"Pega el link de una publicación y obtén una nota de 1 a 10 de rentabilidad antes de ofertar.",
      prev:(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,background:"#f8f9fb",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
            <div style={{width:40,height:40,borderRadius:"50%",border:"3px solid #c9962f",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:14,fontWeight:900,color:"#10182b"}}>8</span>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:800,color:"#10182b"}}>Muy potente</div>
              <div style={{fontSize:10,color:"#64748b"}}>Cap Rate 6,8%</div>
            </div>
          </div>
          <button onClick={onEvaluar} className="rq-btn-gold" style={{width:"100%",background:"#c9962f",border:"none",color:"#10182b",fontSize:13,fontWeight:700,padding:"11px",borderRadius:9,cursor:"pointer"}}>
            Pruébalo ahora, sin cuenta
          </button>
        </div>
      ),
    },
  ];

  const comparacion = ["Consolidación automática","Simulación de escenarios","Estimación tributaria","Evaluación de compra (nota 1 a 10)","Alertas de deuda","Recomendación automática"];

  const stats = [
    { icon:<IconLayers size={20}/>, v:"4", l:"Módulos integrados" },
    { icon:<IconLock size={20}/>, v:"100%", l:"Privado: solo tú puedes ver tus datos" },
    { icon:<IconFile size={20}/>, v:"$9.990", l:"Precio del plan Pro, sin letra chica" },
    { icon:<IconGauge size={20}/>, v:"100%", l:"Adaptado a la normativa tributaria chilena" },
  ];

  const faq = [
    { q:"¿Necesito tarjeta para probar Rentiq?", a:"No. El plan Free es gratis y sin tarjeta. Incluso puedes evaluar un departamento en venta sin crear cuenta — la cuenta solo se necesita para guardar tus propiedades." },
    { q:"¿Puedo cancelar cuando quiera?", a:"Sí. Rentiq Pro es una suscripción mensual sin permanencia — la cancelas desde Mercado Pago cuando quieras." },
    { q:"¿Qué pasa si tengo más de una propiedad?", a:"El plan Free permite 1 propiedad. Con Rentiq Pro puedes cargar propiedades ilimitadas y ver el resumen consolidado de tu portafolio." },
    { q:"¿Mis datos están seguros?", a:"Sí. Tus datos se guardan en tu cuenta personal sobre Firebase (infraestructura de Google), con reglas de acceso que solo permiten que tu propia cuenta los lea y escriba. Nadie más puede verlos." },
  ];

  return (
    <div style={{background:"#fff",color:"#0f172a",fontFamily:"'Inter',system-ui,-apple-system,sans-serif",overflowX:"hidden"}}>
      <style>{`
        .rq-navlinks{display:none;gap:32px}
        @media(min-width:900px){.rq-navlinks{display:flex}}
        .rq-hero{display:grid;grid-template-columns:1fr;gap:36px;align-items:center}
        @media(min-width:960px){.rq-hero{grid-template-columns:1.05fr 1fr;gap:48px}}
        .rq-beneficios{display:grid;grid-template-columns:1fr;gap:24px}
        @media(min-width:640px){.rq-beneficios{grid-template-columns:repeat(2,1fr)}}
        @media(min-width:1000px){.rq-beneficios{grid-template-columns:repeat(5,1fr)}}
        .rq-cards{display:grid;grid-template-columns:1fr;gap:20px}
        @media(min-width:700px){.rq-cards{grid-template-columns:1fr 1fr}}
        .rq-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
        @media(min-width:700px){.rq-stats{grid-template-columns:repeat(4,1fr)}}
        .rq-pricing{display:grid;grid-template-columns:1fr;gap:20px;max-width:820px;margin:0 auto}
        @media(min-width:700px){.rq-pricing{grid-template-columns:1fr 1fr}}
        .rq-table{width:100%;border-collapse:collapse;font-size:14px}
        .rq-table td,.rq-table th{padding:12px 14px;border-bottom:1px solid #eef0f3;text-align:left}
        .rq-btn-navy:hover{background:#1b2540!important}
        .rq-btn-gold:hover{background:#a87a1f!important}
        .rq-btn-outline:hover{background:#f8f9fb!important}
      `}</style>

      {/* NAV */}
      <div style={{maxWidth:1180,margin:"0 auto",padding:"20px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#10182b",display:"flex",alignItems:"center",justifyContent:"center",color:"#c9962f"}}><IconHome size={19}/></div>
          <span style={{fontSize:19,fontWeight:800,letterSpacing:-0.3}}>Rent<span style={{color:"#c9962f"}}>iq</span></span>
        </div>
        <div className="rq-navlinks" style={{alignItems:"center",fontSize:14,fontWeight:600,color:"#334155"}}>
          <a href="#modulos" style={{color:"inherit",textDecoration:"none"}}>Módulos</a>
          <a href="#planes" style={{color:"inherit",textDecoration:"none"}}>Planes</a>
          <a href="#preguntas" style={{color:"inherit",textDecoration:"none"}}>Preguntas</a>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onEntrar} className="rq-btn-outline" style={{background:"#fff",border:"1px solid #e5e7eb",color:"#0f172a",fontSize:13,fontWeight:700,padding:"9px 16px",borderRadius:10,cursor:"pointer"}}>Iniciar sesión</button>
          <button onClick={onEntrar} className="rq-btn-navy" style={{background:"#10182b",border:"none",color:"#fff",fontSize:13,fontWeight:700,padding:"10px 18px",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            Empieza gratis <IconArrowRight size={15}/>
          </button>
        </div>
      </div>

      {/* HERO */}
      <div style={{maxWidth:1180,margin:"0 auto",padding:"32px 24px 72px"}}>
        <div className="rq-hero">
          <div>
            <h1 style={{margin:"0 0 8px",fontSize:"clamp(28px,4vw,40px)",fontWeight:900,letterSpacing:-1,lineHeight:1.2}}>
              Tu patrimonio inmobiliario merece mejores <span style={{color:"#c9962f"}}>decisiones.</span>
            </h1>
            <Squiggle color="#c9962f" width={130}/>
            <p style={{margin:"20px 0 28px",fontSize:16,color:"#64748b",lineHeight:1.7,maxWidth:440}}>
              Descubre cuánto generan tus propiedades antes de invertir un peso más. Consolida todo tu patrimonio, simula escenarios futuros, estima tu declaración de renta, recibe recomendaciones de accionables e inversión con inteligencia artificial.
            </p>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <button onClick={onEntrar} className="rq-btn-navy" style={{background:"#10182b",border:"none",color:"#fff",fontSize:15,fontWeight:700,padding:"15px 26px",borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                Comenzar gratis <IconArrowRight size={16}/>
              </button>
              <button onClick={onEvaluar} className="rq-btn-outline" style={{background:"#fff",border:"1px solid #c9962f",color:"#a87a1f",fontSize:15,fontWeight:700,padding:"15px 26px",borderRadius:12,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8}}>
                Evaluar un depto gratis <IconArrowRight size={16}/>
              </button>
            </div>
            <div style={{fontSize:13,color:"#94a3b8",marginTop:16}}>Gratis, sin tarjeta. Evalúa tu primer depto sin crear cuenta.</div>
          </div>

          <HeroDashboard/>
        </div>
      </div>

      <div style={{maxWidth:1180,margin:"0 auto",padding:"0 24px 88px"}}>
        {/* MÁS PATRIMONIO, MENOS INCERTIDUMBRE */}
        <h2 style={{textAlign:"center",margin:"0 0 40px",fontSize:22,fontWeight:800}}>Más patrimonio. Menos incertidumbre.</h2>
        <div className="rq-beneficios" style={{marginBottom:96}}>
          {beneficios.map(b=>(
            <div key={b.t} style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:14}}>
              <div style={{width:52,height:52,borderRadius:14,background:"#10182b",color:"#c9962f",display:"flex",alignItems:"center",justifyContent:"center"}}>{b.icon}</div>
              <span style={{fontSize:13.5,color:"#334155",lineHeight:1.5,maxWidth:200}}>{b.t}</span>
            </div>
          ))}
        </div>

        {/* QUÉ PUEDES HACER */}
        <div id="modulos" style={{textAlign:"center",maxWidth:640,margin:"0 auto 40px"}}>
          <h2 style={{margin:0,fontSize:"clamp(22px,3vw,28px)",fontWeight:900,letterSpacing:-0.6}}>¿Qué puedes hacer con Rentiq?</h2>
        </div>
        <div className="rq-cards" style={{marginBottom:96}}>
          {modulos.map(m=>(
            <div key={m.tag} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:38,height:38,borderRadius:10,background:"#10182b",color:"#c9962f",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{m.icon}</div>
                <div style={{fontSize:15,fontWeight:800}}>{m.tag}</div>
              </div>
              <p style={{margin:"0 0 16px",fontSize:13.5,color:"#64748b",lineHeight:1.6}}>{m.d}</p>
              {m.prev}
            </div>
          ))}
        </div>

        {/* BANNER OSCURO */}
        <div style={{background:"linear-gradient(135deg,#10182b,#1b2540)",borderRadius:24,padding:"48px 40px",marginBottom:96}}>
          <div className="rq-hero" style={{gridTemplateColumns:"1fr"}}>
            <div className="rq-beneficios" style={{gridTemplateColumns:"1fr",display:"grid"}}>
              <div style={{textAlign:"left"}}>
                <h2 style={{margin:"0 0 14px",fontSize:"clamp(22px,3vw,30px)",fontWeight:900,color:"#fff",letterSpacing:-0.6,lineHeight:1.25}}>
                  Una sola plataforma.<br/>Todo tu patrimonio.
                </h2>
                <p style={{margin:"0 0 24px",fontSize:14.5,color:"#94a3b8",lineHeight:1.7,maxWidth:420}}>
                  Visualiza, analiza y proyecta todo tu patrimonio inmobiliario en un solo lugar. Información clara para decisiones más rápidas.
                </p>
                <a href="#modulos" className="rq-btn-gold" style={{background:"#c9962f",color:"#10182b",fontSize:14,fontWeight:700,padding:"13px 24px",borderRadius:10,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:8}}>
                  Ver cómo funciona <IconArrowRight size={15}/>
                </a>
              </div>
            </div>
          </div>
          <div style={{marginTop:40}}><DeviceArt/></div>
        </div>

        {/* ESTADÍSTICAS (honestas, sin usuarios inventados) */}
        <h2 style={{textAlign:"center",margin:"0 0 40px",fontSize:22,fontWeight:800}}>Rentiq en números</h2>
        <div className="rq-stats" style={{marginBottom:96}}>
          {stats.map(s=>(
            <div key={s.l} style={{textAlign:"center"}}>
              <div style={{width:44,height:44,borderRadius:12,background:"#10182b",color:"#c9962f",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>{s.icon}</div>
              <div style={{fontSize:26,fontWeight:900,color:"#10182b"}}>{s.v}</div>
              <div style={{fontSize:12.5,color:"#64748b",marginTop:4}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* EXCEL VS RENTIQ */}
        <div style={{maxWidth:640,margin:"0 auto 96px"}}>
          <h2 style={{textAlign:"center",margin:"0 0 24px",fontSize:22,fontWeight:800}}>Excel vs. Rentiq</h2>
          <table className="rq-table">
            <thead>
              <tr>
                <th></th>
                <th style={{textAlign:"center",color:"#94a3b8",fontWeight:700}}>Excel</th>
                <th style={{textAlign:"center",color:"#10182b",fontWeight:800}}>Rentiq</th>
              </tr>
            </thead>
            <tbody>
              {comparacion.map(f=>(
                <tr key={f}>
                  <td style={{color:"#334155"}}>{f}</td>
                  <td style={{textAlign:"center",color:"#cbd5e1"}}><IconX size={15}/></td>
                  <td style={{textAlign:"center",color:"#c9962f"}}><IconCheck size={16}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PRICING */}
        <div id="planes" style={{textAlign:"center",maxWidth:640,margin:"0 auto 40px"}}>
          <h2 style={{margin:0,fontSize:"clamp(22px,3vw,28px)",fontWeight:900,letterSpacing:-0.6}}>Elige el plan que se adapta a ti</h2>
        </div>
        <div className="rq-pricing">
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:20,padding:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div style={{fontSize:17,fontWeight:800}}>Gratuita</div>
                <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>Para probar</div>
              </div>
              <div style={{fontSize:26,fontWeight:900}}>$0</div>
            </div>
            {["1 propiedad","Flujo mensual y anual básico","Evaluador de compra (nota 1 a 10)","Sin métricas avanzadas (Cap Rate, CaC)","Sin recomendación automática","Sin simulador de escenarios"].map(i=>{
              const off = i.startsWith("Sin")||i.startsWith("1 prop");
              return (
                <div key={i} style={{display:"flex",gap:9,alignItems:"center",marginBottom:9}}>
                  <span style={{color:off?"#cbd5e1":"#c9962f",flexShrink:0}}>{off?<IconX size={13}/>:<IconCheck size={15}/>}</span>
                  <span style={{fontSize:13.5,color:off?"#94a3b8":"#334155"}}>{i}</span>
                </div>
              );
            })}
            <button onClick={onEntrar} className="rq-btn-outline" style={{width:"100%",marginTop:16,background:"#fff",border:"1px solid #e5e7eb",color:"#0f172a",fontSize:14,fontWeight:700,padding:"13px",borderRadius:10,cursor:"pointer"}}>
              Comenzar gratis
            </button>
          </div>

          <div style={{background:"#10182b",borderRadius:20,padding:28,position:"relative"}}>
            <div style={{position:"absolute",top:-13,left:"50%",transform:"translateX(-50%)",background:"#c9962f",color:"#10182b",fontSize:10,fontWeight:800,letterSpacing:0.6,padding:"4px 14px",borderRadius:999}}>MEJOR VALOR</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div style={{fontSize:17,fontWeight:800,color:"#fff"}}>Pro</div>
                <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>Para inversionistas activos</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:26,fontWeight:900,color:"#c9962f"}}>$9.990</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>CLP / mes</div>
              </div>
            </div>
            {["Propiedades ilimitadas","Simulador de escenarios","Declaración de renta automática","Recomendación con inteligencia artificial para la gestión e inversión de propiedades","Alertas de deuda","Historial de arriendos","Soporte prioritario"].map(i=>(
              <div key={i} style={{display:"flex",gap:9,alignItems:"center",marginBottom:9}}>
                <span style={{color:"#c9962f",flexShrink:0}}><IconCheck size={15}/></span>
                <span style={{fontSize:13.5,color:"#e2e8f0"}}>{i}</span>
              </div>
            ))}
            <button onClick={onPagar} className="rq-btn-gold" style={{width:"100%",marginTop:16,background:"#c9962f",border:"none",color:"#10182b",fontSize:14,fontWeight:700,padding:"14px",borderRadius:10,cursor:"pointer"}}>
              Comenzar ahora — $9.990/mes
            </button>
          </div>
        </div>
        <div style={{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:20}}>Pago seguro vía Mercado Pago · Cancela cuando quieras</div>

        {/* FAQ */}
        <div id="preguntas" style={{maxWidth:720,margin:"96px auto 0"}}>
          <h2 style={{textAlign:"center",margin:"0 0 36px",fontSize:"clamp(22px,3vw,28px)",fontWeight:900,letterSpacing:-0.6}}>Lo que más nos preguntan</h2>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {faq.map(f=>(
              <div key={f.q} style={{background:"#f8f9fb",border:"1px solid #eef0f3",borderRadius:14,padding:"18px 20px"}}>
                <div style={{fontSize:14.5,fontWeight:800,marginBottom:6}}>{f.q}</div>
                <div style={{fontSize:13.5,color:"#64748b",lineHeight:1.7}}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA FINAL */}
        <div style={{textAlign:"center",margin:"96px 0 40px",padding:"56px 24px",background:"linear-gradient(135deg,#10182b,#1b2540)",borderRadius:24}}>
          <h2 style={{margin:"0 0 14px",fontSize:"clamp(24px,3.4vw,30px)",fontWeight:900,color:"#fff",letterSpacing:-0.6}}>
            ¿Listo para tomar mejores decisiones patrimoniales?
          </h2>
          <p style={{margin:"0 0 28px",fontSize:15,color:"#94a3b8"}}>Empieza gratis con tu primera propiedad, sin tarjeta.</p>
          <button onClick={onEntrar} className="rq-btn-gold" style={{background:"#c9962f",border:"none",color:"#10182b",fontSize:15,fontWeight:700,padding:"16px 32px",borderRadius:12,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8}}>
            Comenzar gratis <IconArrowRight size={16}/>
          </button>
        </div>

        {/* FOOTER */}
        <div style={{background:"#10182b",borderRadius:20,padding:"32px 28px",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:26,height:26,borderRadius:7,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",color:"#10182b"}}><IconHome size={14}/></div>
            <span style={{fontSize:14,fontWeight:800,color:"#fff"}}>Rent<span style={{color:"#c9962f"}}>iq</span></span>
          </div>
          <div style={{display:"flex",gap:24,fontSize:13,color:"#94a3b8",flexWrap:"wrap",justifyContent:"center"}}>
            <a href="#modulos" style={{color:"inherit",textDecoration:"none"}}>Módulos</a>
            <a href="#planes" style={{color:"inherit",textDecoration:"none"}}>Planes</a>
            <a href="#preguntas" style={{color:"inherit",textDecoration:"none"}}>Preguntas</a>
            <a href="/terminos.html" style={{color:"inherit",textDecoration:"none"}}>Términos</a>
            <a href="/privacidad.html" style={{color:"inherit",textDecoration:"none"}}>Privacidad</a>
          </div>
          <a href="mailto:rentiq.app.chile@gmail.com" style={{fontSize:13,color:"#c9962f",textDecoration:"none"}}>rentiq.app.chile@gmail.com</a>
          <div style={{fontSize:12,color:"#64748b"}}>Hecho en Chile · © {new Date().getFullYear()} Rentiq</div>
        </div>
      </div>
    </div>
  );
}

// ─── PAYWALL ──────────────────────────────────────────────────────────────────
function Paywall({ usuario, onVolver }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [esperandoPago, setEsperandoPago] = useState(false);
  const [errorPago, setErrorPago] = useState("");

  const pagarConMP = async () => {
    // La suscripción se crea vía Cloud Function (no con un link estático) para
    // que Mercado Pago guarde el external_reference; el checkout público lo
    // ignoraba. back_url hace que MP redirija de vuelta con el preapproval_id,
    // y el efecto en App() llama a verificarSuscripcion para activar Pro al
    // instante al volver.
    setErrorPago("");
    try {
      const backUrl = `${window.location.origin}${window.location.pathname}`;
      const { data } = await httpsCallable(functions, "crearSuscripcion")({ backUrl });
      track("begin_checkout", { currency: "CLP", value: 9990 });
      window.open(data.initPoint, "_blank");
      setEsperandoPago(true);
    } catch (e) {
      if (e.code === "functions/already-exists") {
        // La función ya reactivó el Pro en Firestore; el onSnapshot cerrará
        // el paywall solo, en segundos.
        setErrorPago("Ya tienes una suscripción activa — tu acceso Pro se está actualizando.");
        return;
      }
      console.error("Error creando suscripción:", e);
      setErrorPago("No se pudo iniciar el pago. Intenta de nuevo.");
    }
  };

  const validarCodigo = async () => {
    const limpio = codigo.trim().toUpperCase();
    if (!limpio || procesando) return;
    setError(""); setProcesando(true);
    try {
      await httpsCallable(functions, "canjearCodigo")({ codigo: limpio });
      // El onSnapshot del documento del usuario detecta pro=true y la app
      // sale del paywall automáticamente.
    } catch (e) {
      if (e.code === "functions/not-found" || e.code === "functions/invalid-argument") {
        setError("Código inválido o agotado.");
      } else {
        setError("No se pudo validar el código. Intenta de nuevo.");
      }
      setProcesando(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"#080f1a",color:"#f1f5f9",fontFamily:"'DM Sans','SF Pro Display',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        <button onClick={onVolver} style={{background:"none",border:"none",color:"#3b82f6",fontSize:13,cursor:"pointer",padding:0,marginBottom:24}}>← Volver</button>

        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:12}}>🔓</div>
          <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:900}}>Activa Rentiq Pro</h2>
          <p style={{margin:0,fontSize:13,color:"#64748b"}}>Acceso completo a todas las funciones por $9.990 CLP/mes</p>
        </div>

        {/* botón pago real */}
        <button onClick={pagarConMP} style={{
          width:"100%",
          background:"linear-gradient(135deg,#3b82f6,#6366f1)",
          border:"none",color:"#fff",fontSize:15,fontWeight:800,
          padding:"16px",borderRadius:14,cursor:"pointer",
          boxShadow:"0 8px 32px rgba(59,130,246,0.4)",marginBottom:20,
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        }}>
          💳 Pagar con Mercado Pago
        </button>

        {errorPago&&(
          <div style={{fontSize:12,color:"#ef4444",textAlign:"center",marginBottom:16}}>{errorPago}</div>
        )}

        {esperandoPago&&(
          <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
            <span style={{width:16,height:16,border:"2px solid rgba(34,197,94,0.3)",borderTopColor:"#22c55e",borderRadius:"50%",display:"inline-block",flexShrink:0,animation:"spin 0.8s linear infinite"}}/>
            <span style={{fontSize:12,color:"#22c55e"}}>Cuando completes el pago, tu cuenta Pro se activará aquí automáticamente. Puede tardar unos segundos.</span>
          </div>
        )}

        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:11,color:"#334155",marginBottom:16}}>— o ingresa un código de acceso —</div>
          <div style={{display:"flex",gap:8}}>
            <input value={codigo} onChange={e=>{setCodigo(e.target.value);setError("");}}
              placeholder="CÓDIGO DE ACCESO"
              onKeyDown={e=>e.key==="Enter"&&validarCodigo()}
              style={{flex:1,background:"rgba(255,255,255,0.06)",border:error?"1px solid #ef4444":"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:13,fontWeight:700,padding:"11px 14px",outline:"none",letterSpacing:1,textTransform:"uppercase"}}/>
            <button onClick={validarCodigo} disabled={procesando} style={{background:"rgba(59,130,246,0.2)",border:"1px solid rgba(59,130,246,0.4)",color:"#3b82f6",fontSize:13,fontWeight:700,padding:"11px 16px",borderRadius:10,cursor:procesando?"not-allowed":"pointer",opacity:procesando?0.6:1}}>
              {procesando?"...":"OK"}
            </button>
          </div>
          {error&&<div style={{fontSize:11,color:"#ef4444",marginTop:6}}>{error}</div>}
        </div>

        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)"}}>
          {["Cancela cuando quieras, sin permanencia","Tus datos son privados: solo tu cuenta los ve","Soporte por correo en 24h"].map(i=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:"#22c55e"}}>✓</span>
              <span style={{fontSize:12,color:"#475569"}}>{i}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [pantalla, setPantalla] = useState("cargando"); // cargando | landing | auth | paywall | app
  const [acceso, setAcceso] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [deptos, setDeptos] = useState([]);
  const [vista, setVista] = useState("lista");
  const [deptoSel, setDeptoSel] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [navTab, setNavTab] = useState("deptos");
  const [cargando, setCargando] = useState(true);

  // Escuchar cambios de autenticación + estado Pro en tiempo real.
  // `pro` lo escriben solo las Cloud Functions; aquí únicamente se lee,
  // así que cuando el webhook de MP confirma el pago, la app se entera sola.
  useEffect(() => {
    let unsubDoc = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      if (user) {
        setUsuario(user);
        unsubDoc = onSnapshot(doc(db, "usuarios", user.uid),
          snap => setAcceso(snap.exists() && snap.data().pro === true),
          e => { console.error("Error leyendo estado Pro:", e); setAcceso(false); }
        );
        const deps = await cargarDeptosDB(user.uid);
        setDeptos(deps);
        setPantalla("app");
      } else {
        setUsuario(null);
        setAcceso(false);
        setDeptos([]);
        setPantalla("landing");
      }
      setCargando(false);
    });
    return () => { if (unsubDoc) unsubDoc(); unsubAuth(); };
  }, []);

  // Al volver del checkout de MP (back_url), la URL trae ?preapproval_id=...
  // Se verifica esa suscripción al instante en vez de esperar el webhook.
  useEffect(() => {
    if (!usuario) return;
    const preapprovalId = new URLSearchParams(window.location.search).get("preapproval_id");
    if (!preapprovalId) return;
    window.history.replaceState({}, "", window.location.pathname);
    httpsCallable(functions, "verificarSuscripcion")({ preapprovalId })
      .catch(e => console.error("Error verificando suscripción:", e));
  }, [usuario]);

  // Si Pro se activa (pago confirmado o código canjeado) mientras el usuario
  // está en el paywall, llevarlo directo a la app.
  useEffect(() => {
    if (acceso && pantalla === "paywall") {
      track("purchase", { currency: "CLP", value: 9990 });
      setPantalla("app");
    }
  }, [acceso, pantalla]);

  const irALista = () => { setVista("lista"); setDeptoSel(null); };

  const entrarGratis = () => { track("cta_comenzar_gratis"); setPantalla("auth"); };

  // El paywall necesita una cuenta para asociar la suscripción.
  const irAPaywall = () => { track("paywall_visto"); setPantalla(usuario ? "paywall" : "auth"); };

  const cerrarSesion = async () => {
    await signOut(auth);
    setPantalla("landing");
  };

  const puedeAgregar = () => acceso || deptos.length < 1;

  const guardarNuevo = async (d) => {
    const nuevo = [...deptos, d];
    setDeptos(nuevo);
    track("propiedad_guardada", { total: nuevo.length });
    if (usuario && !(await guardarDeptooDB(usuario.uid, d))) {
      alert("No se pudo guardar la propiedad en la nube. Revisa tu conexión e intenta de nuevo.");
    }
    irALista();
  };

  // Propiedad de ejemplo para ver el valor de la app sin digitar 12 campos.
  // Editable y eliminable como cualquier otra; usa el cupo del plan Free.
  const cargarDemo = () => {
    track("demo_cargado");
    guardarNuevo({
      nombre: "Depto ejemplo · Ñuñoa", tipo: "2D/1B", m2: 55, comuna: "Ñuñoa",
      valorMercado: 105_000_000, deudaHipotecaria: 60_000_000,
      fechaDeuda: new Date().toISOString().slice(0, 10),
      dividendoMensual: 380_000, contribuciones: 35_000, gastosComunes: 0,
      seguros: 15_000, otrosGastos: 20_000,
      arriendoActual: 520_000, arriendoMercado: 560_000,
      mesesVacancia: 1, mesesArriendados: 11, plusvalia: "",
      id: Date.now(), historial: Array(12).fill(520_000),
    });
  };

  const guardarEdicion = async (d) => {
    const actualizado = deptos.map(p => p.id === d.id ? d : p);
    setDeptos(actualizado);
    if (usuario && !(await guardarDeptooDB(usuario.uid, d))) {
      alert("No se pudieron guardar los cambios en la nube. Revisa tu conexión e intenta de nuevo.");
    }
    setDeptoSel(d); setVista("detalle");
  };

  const eliminar = async () => {
    if (usuario && !(await eliminarDeptooDB(usuario.uid, deptoSel.id))) {
      alert("No se pudo eliminar la propiedad. Revisa tu conexión e intenta de nuevo.");
      return;
    }
    setDeptos(prev => prev.filter(p => p.id !== deptoSel.id));
    irALista();
  };

  if (cargando) return (
    <div style={{minHeight:"100vh",background:"#080f1a",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏢</div>
      <div style={{fontSize:14,color:"#475569"}}>Cargando Rentiq...</div>
    </div>
  );

  if (pantalla === "landing") return <Landing onEntrar={entrarGratis} onPagar={irAPaywall} onEvaluar={()=>{track("cta_evaluar_gratis");setPantalla("evaluar");}}/>;
  if (pantalla === "evaluar") return (
    <div style={{minHeight:"100vh",background:"#080f1a",color:"#f1f5f9",fontFamily:"'DM Sans','SF Pro Display',system-ui,sans-serif"}}>
      <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(8,15,26,0.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:52}}>
        <button onClick={()=>setPantalla("landing")} style={{background:"none",border:"none",color:"#64748b",fontSize:13,fontWeight:600,cursor:"pointer",padding:0}}>← Volver</button>
        <button onClick={entrarGratis} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",border:"none",color:"#fff",fontSize:12,fontWeight:700,padding:"8px 14px",borderRadius:9,cursor:"pointer"}}>
          Crear cuenta gratis
        </button>
      </div>
      <div style={{margin:"12px 16px 0",background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#94a3b8",lineHeight:1.5}}>
        Estás probando Rentiq <b style={{color:"#3b82f6"}}>sin cuenta</b>. Evalúa todos los deptos que quieras — y cuando quieras guardar tus propiedades y ver tu flujo real, crea una cuenta gratis.
      </div>
      <EvaluarCompra/>
    </div>
  );
  if (pantalla === "auth") return <AuthScreen onLogin={()=>setPantalla("app")} onVolver={()=>setPantalla("landing")}/>;
  if (pantalla === "paywall") {
    if (!usuario) return <AuthScreen onLogin={()=>setPantalla("paywall")} onVolver={()=>setPantalla("landing")}/>;
    return <Paywall usuario={usuario} onVolver={()=>setPantalla("app")}/>;
  }

  return (
    <div style={{minHeight:"100vh",maxWidth:"100vw",overflowX:"hidden",background:"#080f1a",color:"#f1f5f9",fontFamily:"'DM Sans','SF Pro Display',system-ui,sans-serif"}}>
      <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(8,15,26,0.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🏢</div>
          <span style={{fontWeight:800,fontSize:15,letterSpacing:-0.5}}>Rentiq</span>
          <span style={{fontSize:10,color:acceso?"#3b82f6":"#475569",background:acceso?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.06)",padding:"2px 7px",borderRadius:20,border:acceso?"1px solid rgba(59,130,246,0.3)":"none"}}>
            {acceso?"PRO":"FREE"}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:11,color:"#475569"}}>{deptos.length} prop.</div>
          {!acceso&&(
            <button onClick={irAPaywall} style={{background:"linear-gradient(135deg,#3b82f6,#6366f1)",border:"none",color:"#fff",fontSize:11,fontWeight:800,padding:"5px 10px",borderRadius:8,cursor:"pointer"}}>↑ Pro</button>
          )}
          {usuario&&(
            <button onClick={cerrarSesion} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"#475569",fontSize:11,padding:"5px 10px",borderRadius:8,cursor:"pointer"}}>Salir</button>
          )}
        </div>
      </div>

      {!acceso&&deptos.length>=1&&vista==="lista"&&navTab==="deptos"&&(
        <div onClick={irAPaywall} style={{margin:"12px 16px 0",background:"linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.12))",border:"1px solid rgba(59,130,246,0.3)",borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#3b82f6"}}>Plan Free — 1/1 propiedades</div>
            <div style={{fontSize:11,color:"#475569",marginTop:1}}>Activa Pro para agregar más y desbloquear todo →</div>
          </div>
          <span style={{fontSize:18}}>🔒</span>
        </div>
      )}

      {navTab==="deptos"&&vista==="lista"&&(
        <VistaLista deptos={deptos} filtro={filtro} setFiltro={setFiltro}
          onSelect={d=>{setDeptoSel(d);setVista("detalle");}}
          onNuevo={puedeAgregar()?()=>setVista("nuevo"):irAPaywall}
          bloqueado={!puedeAgregar()}
          onDemo={cargarDemo}/>
      )}
      {navTab==="deptos"&&vista==="detalle"&&deptoSel&&(
        <VistaDetalle d={deptoSel} onBack={irALista} onEditar={()=>setVista("editar")} onEliminar={eliminar} acceso={acceso} onPagar={irAPaywall}/>
      )}
      {vista==="nuevo"&&(
        <FormularioDepto titulo="Nueva propiedad" onGuardar={guardarNuevo} onCancelar={irALista}/>
      )}
      {vista==="editar"&&deptoSel&&(
        <FormularioDepto titulo="Editar propiedad" inicial={deptoSel} onGuardar={guardarEdicion} onCancelar={()=>setVista("detalle")}/>
      )}
      {navTab==="evaluar"&&<EvaluarCompra/>}
      {navTab==="renta"&&acceso&&<DeclaracionRenta deptos={deptos}/>}
      {navTab==="portafolio"&&<VistaPortafolio deptos={deptos} acceso={acceso} onPagar={irAPaywall}/>}

      {vista!=="nuevo"&&vista!=="editar"&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"rgba(8,15,26,0.97)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex"}}>
          {[{k:"deptos",i:"🏠",l:"Deptos"},{k:"evaluar",i:"🎯",l:"Evaluar"},{k:"renta",i:"🧾",l:"Renta"},{k:"portafolio",i:"📊",l:"Portafolio"}].map(t=>{
            const proLock = t.k==="renta" && !acceso;
            return (
            <button key={t.k} onClick={()=>{ if(proLock){irAPaywall();return;} setNavTab(t.k);irALista(); }} style={{
              flex:1,background:"none",border:"none",cursor:"pointer",
              padding:"10px 0 14px",color:navTab===t.k?"#3b82f6":"#475569",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            }}>
              <span style={{fontSize:20}}>{proLock?"🔒":t.i}</span>
              <span style={{fontSize:10,fontWeight:navTab===t.k?700:400}}>{t.l}</span>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}