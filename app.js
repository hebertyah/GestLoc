import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONFIG = window.APP_CONFIG || {};
const hasSupabaseConfig =
  CONFIG.supabaseUrl &&
  CONFIG.supabaseAnonKey &&
  !CONFIG.supabaseUrl.includes("COLE_AQUI");
const supabase = hasSupabaseConfig
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
  : null;

const state = {
  clientes: [],
  equips: [],
  locs: [],
  hist: [],
  currentView: "dashboard",
  eqTab: "todos",
  selectedDevId: null,
  currentUser: null,
};
const $ = (id) => document.getElementById(id);
const gc = (id) => state.clientes.find((c) => c.id === id);
const ge = (id) => state.equips.find((e) => e.id === id);
const isLoc = (eid) => state.locs.some((l) => l.equipamento_id === eid);
const fmtD = (d) =>
  d ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}` : "—";
const today = () => new Date().toISOString().slice(0, 10);
const diffD = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.cssText = "transform:translateY(0);opacity:1;";
  setTimeout(() => {
    t.style.cssText = "transform:translateY(100px);opacity:0;";
  }, 2500);
}
function openModal(id) {
  $(id).classList.add("open");
}
function closeModal(id) {
  $(id).classList.remove("open");
}
function showAuth(show = true) {
  $("auth-screen").classList.toggle("hidden", !show);
  $("app-shell").classList.toggle("hidden", show);
  $("mobile-nav").classList.toggle("hidden", show);
}
function setSyncStatus(text, error = false) {
  const el = $("sync-status");
  el.textContent = text;
  el.classList.toggle("sync-error", error);
}

function setupTheme() {
  const root = document.documentElement;
  const btn = document.querySelector("[data-theme-toggle]");
  let mode = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  root.setAttribute("data-theme", mode);
  btn?.addEventListener("click", () => {
    mode = mode === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", mode);
  });
}

function setupAuthTabs() {
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-auth-tab]")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".auth-form")
        .forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      $(`${btn.dataset.authTab}-form`).classList.add("active");
    });
  });
}

async function signUp(e) {
  e.preventDefault();
  if (!supabase)
    return alert("Preencha o config.js com as credenciais do Supabase.");
  const nome = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });
  if (error) return toast(error.message);
  toast("Conta criada. Confira seu e-mail para confirmação, se habilitado.");
}

async function signIn(e) {
  e.preventDefault();
  if (!supabase)
    return alert("Preencha o config.js com as credenciais do Supabase.");
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function getSessionAndBoot() {
  if (!supabase) {
    showAuth(true);
    setSyncStatus("Configure o Supabase no config.js", true);
    return;
  }
  const { data } = await supabase.auth.getSession();
  handleSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => handleSession(session));
}

async function handleSession(session) {
  if (!session) {
    state.currentUser = null;
    showAuth(true);
    return;
  }
  state.currentUser = session.user;
  $("user-email").textContent = session.user.email;
  showAuth(false);
  setSyncStatus("Conectado ao banco online");
  await loadAllData();
  setupRealtime();
}

async function loadAllData() {
  const [
    { data: clientes, error: e1 },
    { data: equips, error: e2 },
    { data: locs, error: e3 },
    { data: hist, error: e4 },
  ] = await Promise.all([
    supabase.from("clientes").select("*").order("nome"),
    supabase.from("equipamentos").select("*").order("nome"),
    supabase
      .from("locacoes")
      .select("*")
      .order("data_locacao", { ascending: false }),
    supabase
      .from("historico")
      .select("*")
      .order("data_devolucao", { ascending: false }),
  ]);
  if (e1 || e2 || e3 || e4) {
    console.error(e1 || e2 || e3 || e4);
    setSyncStatus("Erro ao carregar dados do banco", true);
    return;
  }
  state.clientes = clientes || [];
  state.equips = equips || [];
  state.locs = locs || [];
  state.hist = hist || [];
  renderAll();
}

let realtimeReady = false;
function setupRealtime() {
  if (realtimeReady || !supabase) return;
  realtimeReady = true;
  ["clientes", "equipamentos", "locacoes", "historico"].forEach((table) => {
    supabase
      .channel(`realtime-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        async () => {
          await loadAllData();
          toast(`Atualização online recebida: ${table}`);
        },
      )
      .subscribe();
  });
}

function go(view) {
  state.currentView = view;
  document
    .querySelectorAll(".view")
    .forEach((el) => el.classList.remove("active"));
  $(`view-${view}`).classList.add("active");
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  document
    .querySelectorAll(".mob-tab")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $("page-title").textContent = {
    dashboard: "Dashboard",
    clientes: "Clientes",
    equipamentos: "Equipamentos",
    locacoes: "Locações Ativas",
    historico: "Histórico",
  }[view];
  renderActions(view);
  renderView(view);
}

function renderActions(view) {
  const a = $("page-actions");
  if (view === "clientes")
    a.innerHTML =
      '<button class="btn btn-primary btn-sm" id="btn-novo-cliente"><i data-lucide="user-plus"></i><span>Novo Cliente</span></button>';
  else if (view === "equipamentos")
    a.innerHTML =
      '<button class="btn btn-ghost btn-sm" id="btn-nova-locacao" style="margin-right:4px"><i data-lucide="clipboard-plus"></i><span>Alocar</span></button><button class="btn btn-primary btn-sm" id="btn-novo-equip"><i data-lucide="plus"></i><span>Novo Equip.</span></button>';
  else if (view === "locacoes")
    a.innerHTML =
      '<button class="btn btn-primary btn-sm" id="btn-nova-locacao"><i data-lucide="clipboard-plus"></i><span>Nova Locação</span></button>';
  else a.innerHTML = "";
  bindDynamicActions();
  lucide.createIcons();
}
function renderView(view) {
  if (view === "dashboard") renderDash();
  if (view === "clientes") renderClientes();
  if (view === "equipamentos") renderEqs();
  if (view === "locacoes") renderLocs();
  if (view === "historico") renderHist();
}
function renderAll() {
  renderDash();
  renderView(state.currentView);
}

function renderDash() {
  $("s-cli").textContent = state.clientes.length;
  $("s-loc").textContent = state.locs.length;
  $("s-eq").textContent = state.equips.length;
  $("s-dsp").textContent = state.equips.filter((e) => !isLoc(e.id)).length;
  const tb = $("dash-tb");
  tb.innerHTML = state.locs.length
    ? state.locs
        .slice(0, 6)
        .map((l) => {
          const eq = ge(l.equipamento_id),
            cl = gc(l.cliente_id);
          return `<tr><td><strong>${eq?.nome || "?"}</strong></td><td>${cl?.nome || "?"}</td><td class="td-m">${fmtD(l.data_locacao)}</td><td><span class="badge b-green">Ativo</span></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="4">Sem locações</td></tr>';
  lucide.createIcons();
}

function renderClientes() {
  const q = $("srch-cli").value.toLowerCase();
  const list = state.clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(q) ||
      (c.telefone || "").includes(q) ||
      (c.documento || "").includes(q),
  );
  $("cli-tb").innerHTML = list.length
    ? list
        .map((c) => {
          const qtd = state.locs.filter((l) => l.cliente_id === c.id).length;
          return `<tr><td><strong>${c.nome}</strong><br><span class="td-m" style="font-size:var(--xs)">${c.endereco || ""}</span></td><td class="td-m">${c.telefone || "—"}</td><td class="td-m">${c.documento || "—"}</td><td>${qtd ? `<span class="badge b-green">${qtd} ativo${qtd > 1 ? "s" : ""}</span>` : '<span class="badge b-gray">0</span>'}</td><td><button class="btn btn-ghost btn-sm act-edit-cli" data-id="${c.id}"><i data-lucide="pencil"></i></button> <button class="btn btn-danger btn-sm act-del-cli" data-id="${c.id}"><i data-lucide="trash-2"></i></button></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="5">Nenhum cliente</td></tr>';
  lucide.createIcons();
}

function renderEqs() {
  let list = state.equips;
  if (state.eqTab === "disp") list = list.filter((e) => !isLoc(e.id));
  if (state.eqTab === "loc") list = list.filter((e) => isLoc(e.id));
  $("eq-grid").innerHTML = list.length
    ? list
        .map((e) => {
          const l = state.locs.find((x) => x.equipamento_id === e.id),
            cl = l ? gc(l.cliente_id) : null;
          return `<div class="equip-card"><div class="equip-head"><div><div class="equip-name">${e.nome}</div><div class="equip-code">${e.codigo || "S/cód"}${e.categoria ? ` · ${e.categoria}` : ""}</div></div><span class="badge ${l ? "b-warn" : "b-green"}">${l ? "Locado" : "Disponível"}</span></div><div class="equip-info">${e.descricao ? `<span>${e.descricao}</span>` : ""}${e.valor_diaria ? `<span>💵 R$ ${Number(e.valor_diaria).toFixed(2)}/dia</span>` : ""}${cl ? `<span style="color:var(--color-primary);font-weight:600">📌 ${cl.nome} — desde ${fmtD(l.data_locacao)}</span>` : ""}</div><div class="equip-foot">${!l ? `<button class="btn btn-primary btn-sm act-open-loc-eq" data-id="${e.id}"><i data-lucide="clipboard-plus"></i>Alocar</button>` : `<button class="btn btn-ghost btn-sm act-open-dev" data-id="${l.id}"><i data-lucide="package-check"></i>Devolver</button>`}<button class="btn btn-ghost btn-sm act-edit-eq" data-id="${e.id}"><i data-lucide="pencil"></i></button>${!l ? `<button class="btn btn-danger btn-sm act-del-eq" data-id="${e.id}"><i data-lucide="trash-2"></i></button>` : ""}</div></div>`;
        })
        .join("")
    : "<div>Nenhum equipamento</div>";
  lucide.createIcons();
}

function renderLocs() {
  const tod = today();
  $("loc-tb").innerHTML = state.locs.length
    ? state.locs
        .map((l) => {
          const eq = ge(l.equipamento_id),
            cl = gc(l.cliente_id),
            dias = diffD(l.data_locacao, tod),
            atrasado = l.data_prevista && l.data_prevista < tod;
          return `<tr><td><strong>${eq?.nome || "?"}</strong></td><td class="td-m">${eq?.codigo || "?"}</td><td>${cl?.nome || "?"}</td><td class="td-m">${cl?.telefone || "—"}</td><td class="td-m">${fmtD(l.data_locacao)}<br><span style="font-size:var(--xs)">${dias}d</span></td><td class="td-m">${fmtD(l.data_prevista)}${atrasado ? ' <span class="badge b-red">Atrasado</span>' : ""}</td><td class="td-m" style="max-width:120px;white-space:normal;font-size:var(--xs)">${l.observacao || "—"}</td><td><button class="btn btn-ghost btn-sm act-open-dev" data-id="${l.id}"><i data-lucide="package-check"></i>Devolver</button></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="8">Nenhuma locação ativa</td></tr>';
  lucide.createIcons();
}

function renderHist() {
  $("hist-tb").innerHTML = state.hist.length
    ? state.hist
        .map(
          (h) =>
            `<tr><td><strong>${h.equipamento_nome}</strong></td><td>${h.cliente_nome}</td><td class="td-m">${fmtD(h.data_locacao)}</td><td class="td-m">${fmtD(h.data_devolucao)}</td><td><span class="badge b-blue">${diffD(h.data_locacao, h.data_devolucao)}d</span></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5">Histórico vazio</td></tr>';
  lucide.createIcons();
}

function openCli(id) {
  $("f-cid").value = "";
  ["f-cn", "f-ct", "f-cd", "f-ce", "f-cm", "f-co"].forEach(
    (id) => ($(id).value = ""),
  );
  $("m-cli-t").textContent = "Novo Cliente";
  if (id) {
    const c = gc(id);
    $("f-cid").value = id;
    $("f-cn").value = c.nome;
    $("f-ct").value = c.telefone || "";
    $("f-cd").value = c.documento || "";
    $("f-ce").value = c.endereco || "";
    $("f-cm").value = c.email || "";
    $("f-co").value = c.observacoes || "";
    $("m-cli-t").textContent = "Editar Cliente";
  }
  openModal("m-cli");
}
async function saveCli() {
  const nome = $("f-cn").value.trim();
  if (!nome) return alert("Informe o nome.");
  const id = Number($("f-cid").value);
  const payload = {
    nome,
    telefone: $("f-ct").value.trim(),
    documento: $("f-cd").value.trim(),
    endereco: $("f-ce").value.trim(),
    email: $("f-cm").value.trim(),
    observacoes: $("f-co").value.trim(),
    user_id: state.currentUser.id,
  };
  const { error } = id
    ? await supabase.from("clientes").update(payload).eq("id", id)
    : await supabase.from("clientes").insert(payload);
  if (error) return toast(error.message);
  closeModal("m-cli");
  toast(id ? "Cliente atualizado!" : "Cliente cadastrado!");
  await loadAllData();
}
async function delCli(id) {
  if (!confirm("Excluir cliente?")) return;
  if (state.locs.some((l) => l.cliente_id === id))
    return alert("Cliente tem locações ativas.");
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Cliente excluído.");
  await loadAllData();
}

function openEq(id) {
  $("f-eid").value = "";
  ["f-en", "f-ec", "f-ecat", "f-ev", "f-ed"].forEach(
    (id) => ($(id).value = ""),
  );
  $("m-eq-t").textContent = "Novo Equipamento";
  if (id) {
    const e = ge(id);
    $("f-eid").value = id;
    $("f-en").value = e.nome;
    $("f-ec").value = e.codigo || "";
    $("f-ecat").value = e.categoria || "";
    $("f-ev").value = e.valor_diaria || "";
    $("f-ed").value = e.descricao || "";
    $("m-eq-t").textContent = "Editar Equipamento";
  }
  openModal("m-eq");
}
async function saveEq() {
  const nome = $("f-en").value.trim();
  if (!nome) return alert("Informe o nome.");
  const id = Number($("f-eid").value);
  const payload = {
    nome,
    codigo: $("f-ec").value.trim(),
    categoria: $("f-ecat").value,
    valor_diaria: Number($("f-ev").value) || 0,
    descricao: $("f-ed").value.trim(),
    user_id: state.currentUser.id,
  };
  const { error } = id
    ? await supabase.from("equipamentos").update(payload).eq("id", id)
    : await supabase.from("equipamentos").insert(payload);
  if (error) return toast(error.message);
  closeModal("m-eq");
  toast(id ? "Equipamento atualizado!" : "Equipamento cadastrado!");
  await loadAllData();
}
async function delEq(id) {
  if (!confirm("Excluir equipamento?")) return;
  const { error } = await supabase.from("equipamentos").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Equipamento excluído.");
  await loadAllData();
}

function fillSels(fixEid) {
  const disp = state.equips.filter((e) => !isLoc(e.id));
  $("f-le").innerHTML =
    `<option value="">Selecione...</option>${disp.map((e) => `<option value="${e.id}">${e.nome}${e.codigo ? ` (${e.codigo})` : ""}</option>`).join("")}`;
  $("f-lc").innerHTML =
    `<option value="">Selecione...</option>${state.clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("")}`;
  if (fixEid) $("f-le").value = fixEid;
}
function openLoc(fixEid) {
  fillSels(fixEid);
  $("f-ld").value = today();
  $("f-lp").value = "";
  $("f-lo").value = "";
  openModal("m-loc");
}
async function saveLoc() {
  const equipamento_id = Number($("f-le").value),
    cliente_id = Number($("f-lc").value),
    data_locacao = $("f-ld").value;
  if (!equipamento_id || !cliente_id || !data_locacao)
    return alert("Preencha equipamento, cliente e data.");
  const payload = {
    equipamento_id,
    cliente_id,
    data_locacao,
    data_prevista: $("f-lp").value || null,
    observacao: $("f-lo").value.trim(),
    user_id: state.currentUser.id,
  };
  const { error } = await supabase.from("locacoes").insert(payload);
  if (error) return toast(error.message);
  closeModal("m-loc");
  toast("Locação registrada!");
  await loadAllData();
}

function openDev(id) {
  state.selectedDevId = id;
  const l = state.locs.find((x) => x.id === id);
  $("dev-en").textContent = ge(l.equipamento_id)?.nome || "?";
  $("dev-cn").textContent = gc(l.cliente_id)?.nome || "?";
  $("f-dd").value = today();
  openModal("m-dev");
}
async function confirmDev() {
  const l = state.locs.find((x) => x.id === state.selectedDevId);
  if (!l) return;
  const eq = ge(l.equipamento_id),
    cl = gc(l.cliente_id),
    dd = $("f-dd").value || today();
  const { error: hErr } = await supabase
    .from("historico")
    .insert({
      locacao_id: l.id,
      equipamento_nome: eq?.nome || "?",
      cliente_nome: cl?.nome || "?",
      data_locacao: l.data_locacao,
      data_devolucao: dd,
      user_id: state.currentUser.id,
    });
  if (hErr) return toast(hErr.message);
  const { error: dErr } = await supabase
    .from("locacoes")
    .delete()
    .eq("id", l.id);
  if (dErr) return toast(dErr.message);
  closeModal("m-dev");
  toast("Devolução registrada!");
  await loadAllData();
}

function bindDynamicActions() {
  $("btn-novo-cliente")?.addEventListener("click", () => openCli());
  $("btn-novo-equip")?.addEventListener("click", () => openEq());
  document
    .querySelectorAll("#btn-nova-locacao")
    .forEach((el) => el.addEventListener("click", () => openLoc()));
}
function bindStaticEvents() {
  document
    .querySelectorAll(".nav-item,.mob-tab")
    .forEach((el) => el.addEventListener("click", () => go(el.dataset.view)));
  document
    .querySelectorAll("[data-go]")
    .forEach((el) => el.addEventListener("click", () => go(el.dataset.go)));
  document
    .querySelectorAll("[data-close]")
    .forEach((el) =>
      el.addEventListener("click", () => closeModal(el.dataset.close)),
    );
  $("srch-cli").addEventListener("input", renderClientes);
  document.querySelectorAll(".tab").forEach((el) =>
    el.addEventListener("click", () => {
      state.eqTab = el.dataset.tab;
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      el.classList.add("active");
      renderEqs();
    }),
  );
  $("save-cli").addEventListener("click", saveCli);
  $("save-eq").addEventListener("click", saveEq);
  $("save-loc").addEventListener("click", saveLoc);
  $("confirm-dev").addEventListener("click", confirmDev);
  $("logout-btn").addEventListener("click", signOut);
  $("login-form").addEventListener("submit", signIn);
  $("signup-form").addEventListener("submit", signUp);
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("act-edit-cli")) openCli(Number(btn.dataset.id));
    if (btn.classList.contains("act-del-cli")) delCli(Number(btn.dataset.id));
    if (btn.classList.contains("act-edit-eq")) openEq(Number(btn.dataset.id));
    if (btn.classList.contains("act-del-eq")) delEq(Number(btn.dataset.id));
    if (btn.classList.contains("act-open-loc-eq"))
      openLoc(Number(btn.dataset.id));
    if (btn.classList.contains("act-open-dev")) openDev(Number(btn.dataset.id));
  });
}

function boot() {
  setupTheme();
  setupAuthTabs();
  bindStaticEvents();
  renderActions("dashboard");
  lucide.createIcons();
  getSessionAndBoot();
}
boot();
