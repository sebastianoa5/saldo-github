"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, CalendarDays, ChevronDown, ChevronRight, CircleAlert, CircleCheck,
  FlaskConical, LayoutDashboard, List, LockKeyhole, Plus, Settings2, WalletCards,
} from "lucide-react";
import {
  ENTRY_TYPES, INITIAL_YEAR, MONTHS, deriveLedger, lastRecordedMonth, monthLabel, recordSchema,
  newId, todayInRome, type Account, type Balance, type Label, type LedgerRecord, type Movement, type Mutation,
} from "../lib/ledger";
import { readLedger, writeLedger } from "../lib/local-ledger";
import { sampleLedger } from "../lib/ledger-demo";
import { BalanceForm, FormError, Modal, MovementForm, NameForm } from "./ledger-forms";
import { Accounts, Movements, Overview, Reports, Settings } from "./ledger-views";

const SECTIONS = {
  overview: { title: "Panoramica", icon: LayoutDashboard },
  movements: { title: "Movimenti", icon: List },
  accounts: { title: "Conti e patrimonio", icon: WalletCards },
  reports: { title: "Analisi", icon: BarChart3 },
  settings: { title: "Impostazioni", icon: Settings2 },
} as const;

const SECTION_COPY = {
  overview: "Entrate, spese e patrimonio in un unico riepilogo.",
  movements: "Registra, cerca e aggiorna entrate, spese e trasferimenti.",
  accounts: "Aggiorna i saldi e segui il patrimonio nel tempo.",
  reports: "Scopri come si distribuiscono entrate e spese e confronta i mesi.",
  settings: "Personalizza le categorie e scarica una copia dei tuoi dati.",
};

const PERIOD_KEY = "saldo-period-v1";
const DEFAULT_PERIOD = INITIAL_YEAR + "-01";
const SIGN_IN = "/signin-with-chatgpt?return_to=%2F";

type Section = keyof typeof SECTIONS;
type Form =
  | { type: "movement"; id: string; initial?: Movement }
  | { type: "balance"; account: Account }
  | { type: "account"; id: string; initial?: Account }
  | { type: "label"; id: string; labelType: "expense" | "income"; initial?: Label }
  | { type: "delete"; record: Movement | Balance; back: Exclude<Form, { type: "delete" }> };

function replaceRecord(records: LedgerRecord[], next: LedgerRecord) {
  return [...records.filter((record) => record.id !== next.id || record.kind !== next.kind), next];
}

function periodMonth(period: string, last: string | null) {
  if (period.length === 7) return period;
  const end = period + "-12";
  const previousDecember = (Number(period) - 1) + "-12";
  if (!last || last < previousDecember) return end;
  return last < end ? last : end;
}

function makeDate(period: string) {
  const today = todayInRome();
  if (today.startsWith(period)) return today;
  return period.length === 4 ? period + "-01-01" : period + "-01";
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function csvNumber(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const csv = "\uFEFF" + [header.join(";"), ...rows.map((row) => row.join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none">
    <path d="m6.5 19.5 6.1-6.1 4.4 4.1 8.5-9m-5.4 0h5.4v5.4M6.5 24h19"
      stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg></span>;
}

function PeriodPicker({ period, years, onChange }: { period: string; years: number[]; onChange: (period: string) => void }) {
  const year = period.slice(0, 4);
  const month = period.slice(5);
  return <div className="period-picker">
    <CalendarDays className="period-icon" size={17} />
    <label className="period-month"><span className="sr-only">Mese</span>
      <select value={month} onChange={(event) => onChange(event.target.value ? year + "-" + event.target.value : year)}>
        <option value="">Anno intero</option>
        {MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
      </select><ChevronDown size={14} /></label>
    <label className="period-year"><span className="sr-only">Anno</span>
      <select value={year} onChange={(event) => onChange(event.target.value + (month ? "-" + month : ""))}>
        {years.map((value) => <option key={value} value={value}>{value}</option>)}
      </select><ChevronDown size={14} /></label>
  </div>;
}

export function LedgerApp({ signedIn }: { signedIn: boolean }) {
  const [section, setSection] = useState<Section>("overview");
  const [personalPeriod, setPersonalPeriod] = useState(DEFAULT_PERIOD);
  const [examplePeriod, setExamplePeriod] = useState("2027-03");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [example, setExample] = useState<LedgerRecord[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(signedIn ? "loading" : "ready");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const reading = useRef(0);
  const writing = useRef(false);
  const reloadAfterClose = useRef(false);

  const demo = example !== null;
  const ledger = useMemo(() => deriveLedger(example ?? records), [example, records]);
  const period = demo ? examplePeriod : personalPeriod;
  const year = Number(period.slice(0, 4));
  const month = periodMonth(period, lastRecordedMonth(ledger));
  const years = useMemo(() => {
    const all = new Set<number>([year, INITIAL_YEAR, ...Array.from({ length: 11 }, (_, i) => INITIAL_YEAR - 4 + i)]);
    for (const { value } of ledger.movements) all.add(Number(value.date.slice(0, 4)));
    for (const { value } of ledger.balances) all.add(Number(value.month.slice(0, 4)));
    return [...all].sort((a, b) => a - b);
  }, [ledger, year]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_KEY);
      if (saved && /^(19\d{2}|20\d{2}|2100)(-(0[1-9]|1[0-2]))?$/.test(saved)) setPersonalPeriod(saved);
    } catch {
      // The selected period is optional browser-local state.
    }
  }, []);

  function setPeriod(next: string) {
    if (demo) {
      setExamplePeriod(next);
    } else {
      setPersonalPeriod(next);
      try { localStorage.setItem(PERIOD_KEY, next); } catch {}
    }
  }

  const load = useCallback(async () => {
    if (!signedIn || writing.current) return;
    const request = ++reading.current;
    try {
      const current = await readLedger();
      if (request === reading.current) {
        setRecords(current);
        setStatus("ready");
        setLoadError("");
      }
    } catch (error) {
      if (request === reading.current) {
        setStatus("error");
        setLoadError(error instanceof Error ? error.message : "Impossibile aprire l’archivio.");
      }
    }
  }, [signedIn]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!signedIn || form || demo) return;
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, signedIn, form, demo]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function toggleDemo() {
    if (demo) {
      setExample(null);
      if (signedIn) void load();
    } else {
      setExample(sampleLedger());
      setExamplePeriod("2027-03");
    }
    setToast("");
    navigate("overview");
  }

  function open(next: Form) {
    if (!demo && (!signedIn || status !== "ready")) {
      setToast(signedIn ? "Attendi che l’archivio sia disponibile." : "Accedi per salvare oppure prova i dati di esempio.");
      return;
    }
    reading.current++;
    setFormError("");
    setForm(next);
  }

  function close() {
    if (writing.current) return;
    setForm(null);
    setFormError("");
    if (reloadAfterClose.current) {
      reloadAfterClose.current = false;
      void load();
    }
  }

  function newMovement() { open({ type: "movement", id: newId() }); }
  function editMovement(initial: Movement) { open({ type: "movement", id: initial.id, initial }); }
  function editBalance(account: Account) { open({ type: "balance", account }); }
  function editAccount(initial?: Account) { open({ type: "account", id: initial?.id ?? newId(), initial }); }
  function editLabel(labelType: "expense" | "income", initial?: Label) {
    open({ type: "label", id: initial?.id ?? newId(), labelType, initial });
  }
  function confirmDelete(record: Movement | Balance) {
    if (!form || form.type === "delete") return;
    setFormError("");
    setForm({ type: "delete", record, back: form });
  }

  async function mutate(action: Mutation) {
    if (writing.current) return;
    writing.current = true;
    reading.current++;
    setBusy(true);
    setFormError("");
    try {
      let saved: LedgerRecord | null = null;
      if (demo) {
        if (action.op === "save") saved = { ...action.record, version: newId() };
      } else {
        saved = await writeLedger(action);
      }

      function update(previous: LedgerRecord[]) {
        if (saved) return replaceRecord(previous, saved);
        if (action.op === "delete") {
          return previous.filter((record) => record.id !== action.id || record.kind !== action.kind);
        }
        return previous;
      }

      if (demo) setExample((previous) => update(previous ?? []));
      else setRecords(update);

      if (saved?.kind === "movement" && !saved.value.date.startsWith(period)) {
        setPeriod(saved.value.date.slice(0, 7));
      }
      if (saved?.kind === "balance" && !saved.value.month.startsWith(period)) {
        setPeriod(saved.value.month);
      }
      setForm(null);
      setToast(action.op === "delete" ? "Voce eliminata." : saved?.kind === "movement" ? "Movimento salvato." : saved?.kind === "balance" ? "Saldo salvato." : "Voce salvata.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossibile completare la richiesta.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function save(record: LedgerRecord) {
    const parsed = recordSchema.safeParse(record);
    if (!parsed.success) {
      setFormError("Controlla che i campi obbligatori siano compilati correttamente.");
      return;
    }
    void mutate({ op: "save", record: parsed.data });
  }

  function exportMovements(items: Movement[], all = false) {
    const labels = new Map(ledger.labels.map((label) => [label.id, label.value.name]));
    const accounts = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
    const rows = items.map(({ value }) => [
      value.date, csvCell(ENTRY_TYPES[value.type]), csvCell(value.title),
      csvNumber(value.type === "expense" ? -value.amount : value.amount),
      csvCell(value.type !== "transfer" ? labels.get(value.labelId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.subcategory : ""),
      csvCell(value.accountId ? accounts.get(value.accountId) ?? "" : ""),
      csvCell(value.type === "transfer" ? accounts.get(value.toAccountId) ?? "" : ""),
      csvCell(value.type === "expense" ? value.method : ""), csvCell(value.notes),
    ]);
    downloadCsv(`saldo-${demo ? "esempio-" : ""}movimenti${all ? "" : "-" + period}.csv`,
      ["Data", "Tipo", "Descrizione", "Importo EUR", "Categoria o fonte", "Sottocategoria", "Conto", "Conto di destinazione", "Metodo di pagamento", "Note"], rows);
  }

  function exportBalances() {
    const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
    const rows = ledger.balances.map(({ value }) => {
      const account = accounts.get(value.accountId);
      return [value.month, csvCell(account?.value.name ?? ""), csvNumber(account?.value.type === "debt" ? -value.amount : value.amount)];
    });
    downloadCsv(`saldo-${demo ? "esempio-" : ""}saldi.csv`, ["Mese", "Conto", "Saldo netto EUR"], rows);
  }

  const sectionTitle = SECTIONS[section].title;
  const formTitle = form?.type === "movement" ? (form.initial ? "Modifica movimento" : "Nuovo movimento")
    : form?.type === "balance" ? "Saldo · " + form.account.value.name
    : form?.type === "account" ? (form.initial ? "Rinomina conto" : "Nuovo conto")
    : form?.type === "label" ? (form.initial ? "Rinomina voce" : form.labelType === "expense" ? "Nuova categoria" : "Nuova fonte")
    : "Elimina voce";
  const canEdit = demo || (signedIn && status === "ready");
  const demoButton = <button className="text-button example-button" type="button" onClick={toggleDemo}><FlaskConical size={15} /> Esplora con esempi</button>;
  const sharedView = { ledger, year, period, month, monthChange: setPeriod };
  const saveProps = { busy, error: formError, onSave: save };

  return <div className="app-shell">
    <a className="skip-link" href="#contenuto">Vai al contenuto</a>
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => navigate("overview")} aria-label="Saldo, panoramica">
        <Mark /><span><strong>Saldo<span className="brand-dot">.</span></strong><small>FINANZE PERSONALI</small></span>
      </button>
      <div className="nav-label">IL TUO SPAZIO</div>
      <nav className="main-nav" aria-label="Menu principale">
        {(Object.keys(SECTIONS) as Section[]).map((key) => {
          const { icon: Icon, title } = SECTIONS[key];
          return <button className="nav-button" type="button" key={key} aria-current={section === key ? "page" : undefined}
            onClick={() => navigate(key)} aria-label={title}>
            <Icon size={19} strokeWidth={1.8} />
            {key === "accounts" ? <><span className="nav-wide">{title}</span><span className="nav-narrow">Conti</span></> : <span>{title}</span>}
            {section === key && <i />}
          </button>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-private"><span className="sidebar-lock"><LockKeyhole size={16} /></span>
          <div><strong>Archivio locale</strong><small>Conti in euro · EUR</small></div>
        </div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>Finanze personali</span><ChevronRight size={15} /><strong>{sectionTitle}</strong></div>
        <span className="privacy-badge"><i />{demo ? "Dati di esempio" : signedIn ? "Archivio sincronizzato" : "Anteprima"}</span>
      </header>
      <main className="content" id="contenuto">
        <div className="page-heading">
          <div><div className="eyebrow">{section === "settings" ? "PERSONALIZZAZIONE" : "BILANCIO PERSONALE"}</div>
            <h1>{sectionTitle}</h1><p>{SECTION_COPY[section]}</p>
          </div>
          <div className="page-actions">
            {section !== "settings" && <PeriodPicker {...{ period, years, onChange: setPeriod }} />}
            {canEdit ? <button type="button" className="button primary new-button" onClick={newMovement}><Plus size={19} /> Nuovo movimento</button>
              : !signedIn ? <a href={SIGN_IN} target="_top" className="button primary">Accedi <ArrowRight size={17} /></a>
              : <button type="button" className="button primary new-button" disabled><Plus size={19} /> Nuovo movimento</button>}
          </div>
        </div>

        {demo && <div className="notice example-notice"><FlaskConical size={19} /><div><strong>Stai usando dati di esempio</strong>
          <span>Le modifiche di prova si azzerano quando esci.</span></div><button className="button secondary" type="button" onClick={toggleDemo}>Esci dalla prova</button></div>}
        {!signedIn && !demo && <div className="notice"><LockKeyhole size={18} /><div><strong>Accedi per usare il tuo registro personale</strong>
          <span>Puoi esplorare l’app con importi di esempio.</span></div>{demoButton}</div>}
        {!demo && status === "loading" && <p className="loading-status" role="status">Apertura dell’archivio…</p>}
        {!demo && status === "error" && <div className="notice error-notice" role="alert"><CircleAlert size={19} /><div><strong>Archivio non disponibile</strong><span>{loadError}</span></div>
          <button type="button" className="button secondary" onClick={() => { setStatus("loading"); void load(); }}>Riprova</button></div>}

        {section === "overview" && <Overview {...sharedView} onEdit={editMovement} onNew={newMovement}
          onView={navigate} onBalance={editBalance} demoAction={!demo && signedIn && !ledger.movements.length ? demoButton : undefined} />}
        {section === "movements" && <Movements key={period} {...{ ledger, period }} onEdit={editMovement} onNew={newMovement} onExport={exportMovements} />}
        {section === "accounts" && <Accounts {...sharedView} onAccount={editAccount} onBalance={editBalance} />}
        {section === "reports" && <Reports {...{ ledger, year, period }} />}
        {section === "settings" && <Settings ledger={ledger} onLabel={editLabel} onExport={() => exportMovements(ledger.movements, true)}
          onBalancesExport={exportBalances} onDemo={toggleDemo} />}
        <footer className="workspace-footer"><span>Saldo · Finanze personali</span><span>{period.length === 4 ? "Anno " + period : monthLabel(period)}</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><CircleCheck size={18} />{toast}</div>}
    {form && <Modal key={form.type + ("id" in form ? form.id : "")} title={formTitle} busy={busy} onClose={close}
      hint={form.type === "movement" ? "Inserisci i dettagli del movimento." : undefined}>
      {form.type === "movement" && <MovementForm {...saveProps} id={form.id} initial={form.initial}
        ledger={ledger} date={makeDate(period)} initialType="expense" onRemove={confirmDelete} />}
      {form.type === "balance" && <BalanceForm {...saveProps} account={form.account} initialMonth={month} ledger={ledger} onRemove={confirmDelete} />}
      {form.type === "account" && <NameForm {...saveProps} id={form.id} kind="account" labelType="expense" initial={form.initial} />}
      {form.type === "label" && <NameForm {...saveProps} id={form.id} kind="label" labelType={form.labelType} initial={form.initial} />}
      {form.type === "delete" && <div className="editor">
        <p className="form-help">{form.record.kind === "movement"
          ? `Eliminare «${form.record.value.title}» dal registro?`
          : `Eliminare il saldo di ${monthLabel(form.record.value.month)}?`}</p>
        <FormError message={formError} />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setFormError(""); setForm(form.back); }}>Annulla</button>
          <button type="button" className="button danger" disabled={busy} onClick={() => {
            const { id, kind, version } = form.record;
            if (version) void mutate({ op: "delete", id, kind, version });
          }}>{busy ? "Eliminazione…" : "Elimina"}</button>
        </div>
      </div>}
    </Modal>}
  </div>;
}
