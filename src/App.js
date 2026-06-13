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

const MP_CHECKOUT_URL = "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=008ace555efd44858a893539c2a43208";


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

  return (
    <div style={{minHeight:"100vh",background:"#080f1a",color:"#f1f5f9",fontFamily:"'DM Sans',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        <button onClick={onVolver} style={{background:"none",border:"none",color:"#3b82f6",fontSize:13,cursor:"pointer",padding:0,marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 16px"}}>🏢</div>
          <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:900}}>{modo==="login"?"Bienvenido de vuelta":"Crear cuenta gratis"}</h2>
          <p style={{margin:0,fontSize:13,color:"#64748b"}}>{modo==="login"?"Ingresa para ver tus propiedades":"Empieza a analizar tu primer depto"}</p>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,padding:"12px 14px",outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,color:"#94a3b8",fontWeight:600,display:"block",marginBottom:5}}>Contraseña</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Mínimo 6 caracteres"
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#f1f5f9",fontSize:14,padding:"12px 14px",outline:"none",boxSizing:"border-box"}}/>
        </div>
        {modo==="login"&&(
          <div style={{textAlign:"right",marginTop:-12,marginBottom:16}}>
            <span onClick={recuperarPass} style={{fontSize:12,color:"#3b82f6",cursor:"pointer"}}>¿Olvidaste tu contraseña?</span>
          </div>
        )}
        {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#ef4444",marginBottom:16}}>{error}</div>}
        {info&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#22c55e",marginBottom:16}}>{info}</div>}
        <button onClick={handleSubmit} disabled={cargando} style={{
          width:"100%",background:"linear-gradient(135deg,#3b82f6,#6366f1)",
          border:"none",color:"#fff",fontSize:15,fontWeight:800,
          padding:"14px",borderRadius:12,cursor:cargando?"not-allowed":"pointer",
          opacity:cargando?0.7:1,marginBottom:16,
        }}>
          {cargando?"Cargando...":(modo==="login"?"Ingresar":"Crear cuenta")}
        </button>
        <div style={{textAlign:"center",fontSize:13,color:"#475569"}}>
          {modo==="login"?"¿No tienes cuenta?":"¿Ya tienes cuenta?"}{" "}
          <span onClick={()=>{setModo(modo==="login"?"registro":"login");setError("");setInfo("");}}
            style={{color:"#3b82f6",cursor:"pointer",fontWeight:700}}>
            {modo==="login"?"Regístrate gratis":"Inicia sesión"}
          </span>
        </div>
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
    </div>
  );
}

// ─── VISTA LISTA ──────────────────────────────────────────────────────────────
function VistaLista({ deptos, filtro, setFiltro, onSelect, onNuevo, bloqueado }) {
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
function VistaPortafolio({ deptos }) {
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

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function Landing({ onEntrar, onPagar }) {
  const features = [
    { i:"📊", t:"Rentabilidad real", d:"Flujo neto, Cap Rate y Cash-on-Cash por propiedad, calculados automáticamente." },
    { i:"🎯", t:"Recomendación inteligente", d:"La app te dice si conviene mantener, subir el arriendo o vender." },
    { i:"💸", t:"Control de gastos", d:"Dividendo, contribuciones, gastos comunes, seguros y más — todo en un lugar." },
    { i:"📈", t:"Simulador de escenarios", d:"¿Qué pasa si subo el arriendo 15%? Calcula el impacto en tiempo real." },
    { i:"🏦", t:"Alerta de deuda", d:"Te avisa cuando el saldo hipotecario lleva más de 6 meses sin actualizar." },
    { i:"📱", t:"100% móvil", d:"Diseñada para revisar desde el celular en cualquier momento." },
  ];

  return (
    <div style={{minHeight:"100vh",background:"#080f1a",color:"#f1f5f9",fontFamily:"'DM Sans','SF Pro Display',system-ui,sans-serif",overflowX:"hidden"}}>
      {/* hero */}
      <div style={{padding:"48px 24px 40px",textAlign:"center",position:"relative"}}>
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:400,height:300,background:"radial-gradient(ellipse,rgba(59,130,246,0.15) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 20px"}}>🏢</div>
        <h1 style={{margin:"0 0 12px",fontSize:28,fontWeight:900,letterSpacing:-1,lineHeight:1.2}}>
          ¿Tus deptos realmente<br/>
          <span style={{background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>te están generando dinero?</span>
        </h1>
        <p style={{margin:"0 0 32px",fontSize:15,color:"#64748b",lineHeight:1.6,maxWidth:320,marginLeft:"auto",marginRight:"auto"}}>
          Rentiq consolida todos tus arriendos, gastos y deudas en una sola vista. Sabrás en segundos qué mantener, qué ajustar y qué vender.
        </p>
        <button onClick={onEntrar} style={{
          width:"100%",maxWidth:320,
          background:"linear-gradient(135deg,#3b82f6,#6366f1)",
          border:"none",color:"#fff",fontSize:16,fontWeight:800,
          padding:"16px",borderRadius:14,cursor:"pointer",
          boxShadow:"0 8px 32px rgba(59,130,246,0.4)",marginBottom:12,
        }}>
          Probar gratis — 1 propiedad
        </button>
        <div style={{fontSize:12,color:"#334155"}}>Sin tarjeta. Sin registro. Datos en tu dispositivo.</div>
      </div>

      {/* social proof */}
      <div style={{margin:"0 24px 32px",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:12,padding:"14px 16px",display:"flex",gap:12,alignItems:"center"}}>
        <span style={{fontSize:24}}>💡</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>Caso real</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Un inversionista con 4 deptos descubrió que uno le generaba flujo negativo de $190.000/mes. Subió el arriendo y redujo vacancia — pasó a +$320.000/mes.</div>
        </div>
      </div>

      {/* features */}
      <div style={{padding:"0 24px 32px"}}>
        <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:16,textAlign:"center"}}>Todo lo que incluye</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {features.map(f=>(
            <div key={f.t} style={{display:"flex",gap:14,alignItems:"flex-start",background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)"}}>
              <span style={{fontSize:22,flexShrink:0}}>{f.i}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:3}}>{f.t}</div>
                <div style={{fontSize:12,color:"#475569",lineHeight:1.5}}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* pricing */}
      <div style={{padding:"0 24px 48px"}}>
        <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:16,textAlign:"center"}}>Planes</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* free */}
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>Free</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Para probar</div>
              </div>
              <div style={{fontSize:22,fontWeight:900,color:"#f1f5f9"}}>$0</div>
            </div>
            {["1 propiedad","Flujo mensual y anual básico","Sin métricas avanzadas (Cap Rate, CaC)","Sin recomendación automática","Sin simulador de escenarios"].map(i=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:12,color:i.startsWith("Sin")||i.startsWith("1 prop")?"#475569":"#22c55e"}}>{i.startsWith("Sin")||i.startsWith("1 prop")?"✗":"✓"}</span>
                <span style={{fontSize:12,color:i.startsWith("Sin")||i.startsWith("1 prop")?"#475569":"#94a3b8"}}>{i}</span>
              </div>
            ))}
            <button onClick={onEntrar} style={{width:"100%",marginTop:14,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:13,fontWeight:700,padding:"12px",borderRadius:10,cursor:"pointer"}}>
              Empezar gratis
            </button>
          </div>

          {/* pro */}
          <div style={{background:"linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.12))",border:"2px solid rgba(59,130,246,0.4)",borderRadius:16,padding:"20px",position:"relative"}}>
            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(90deg,#3b82f6,#6366f1)",color:"#fff",fontSize:10,fontWeight:800,letterSpacing:1,padding:"3px 12px",borderRadius:20}}>MÁS POPULAR</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>Pro</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Para inversionistas activos</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:22,fontWeight:900,color:"#3b82f6"}}>$9.990</div>
                <div style={{fontSize:10,color:"#475569"}}>CLP / mes</div>
              </div>
            </div>
            {["Propiedades ilimitadas","Simulador de escenarios","Alertas de deuda","Historial de arriendos","Soporte prioritario"].map(i=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:12,color:"#3b82f6"}}>✓</span>
                <span style={{fontSize:12,color:"#94a3b8"}}>{i}</span>
              </div>
            ))}
            <button onClick={onPagar} style={{
              width:"100%",marginTop:14,
              background:"linear-gradient(135deg,#3b82f6,#6366f1)",
              border:"none",color:"#fff",fontSize:14,fontWeight:800,
              padding:"14px",borderRadius:10,cursor:"pointer",
              boxShadow:"0 4px 20px rgba(59,130,246,0.35)",
            }}>
              Activar Pro — $9.990/mes
            </button>
          </div>
        </div>
        <div style={{fontSize:11,color:"#334155",textAlign:"center",marginTop:16}}>
          Pago seguro vía Mercado Pago · Cancela cuando quieras
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

  const pagarConMP = () => {
    // external_reference vincula la suscripción con este usuario; el webhook
    // (Cloud Function) confirma el pago contra la API de MP y activa Pro.
    window.open(`${MP_CHECKOUT_URL}&external_reference=${encodeURIComponent(usuario.uid)}`, "_blank");
    setEsperandoPago(true);
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
          {["Cancela cuando quieras, sin permanencia","Datos guardados en tu dispositivo","Soporte por WhatsApp en 24h"].map(i=>(
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

  // Si Pro se activa (pago confirmado o código canjeado) mientras el usuario
  // está en el paywall, llevarlo directo a la app.
  useEffect(() => {
    if (acceso) setPantalla(p => p === "paywall" ? "app" : p);
  }, [acceso]);

  const irALista = () => { setVista("lista"); setDeptoSel(null); };

  const entrarGratis = () => setPantalla("auth");

  // El paywall necesita una cuenta para asociar la suscripción.
  const irAPaywall = () => setPantalla(usuario ? "paywall" : "auth");

  const cerrarSesion = async () => {
    await signOut(auth);
    setPantalla("landing");
  };

  const puedeAgregar = () => acceso || deptos.length < 1;

  const guardarNuevo = async (d) => {
    const nuevo = [...deptos, d];
    setDeptos(nuevo);
    if (usuario && !(await guardarDeptooDB(usuario.uid, d))) {
      alert("No se pudo guardar la propiedad en la nube. Revisa tu conexión e intenta de nuevo.");
    }
    irALista();
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

  if (pantalla === "landing") return <Landing onEntrar={entrarGratis} onPagar={irAPaywall}/>;
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
          bloqueado={!puedeAgregar()}/>
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
      {navTab==="evaluar"&&acceso&&<EvaluarCompra/>}
      {navTab==="portafolio"&&<VistaPortafolio deptos={deptos}/>}

      {vista!=="nuevo"&&vista!=="editar"&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"rgba(8,15,26,0.97)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex"}}>
          {[{k:"deptos",i:"🏠",l:"Deptos"},{k:"evaluar",i:"🎯",l:"Evaluar"},{k:"portafolio",i:"📊",l:"Portafolio"}].map(t=>{
            const proLock = t.k==="evaluar" && !acceso;
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