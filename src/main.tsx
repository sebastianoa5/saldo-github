import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { LedgerApp } from "./app/ledger-app";
import "./app/globals.css";

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const fields = new FormData(event.currentTarget);

    try {
      await signInWithEmailAndPassword(
        auth,
        String(fields.get("email")).trim(),
        String(fields.get("password"))
      );
    } catch {
      setError("Accesso non riuscito. Controlla email, password e connessione.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setError("");

    try {
      await signOut(auth);
    } catch {
      setError("Uscita non riuscita. Riprova.");
    }
  }

  if (user === undefined) {
    return <p role="status">Verifica dell’accesso…</p>;
  }

  if (user) {
    return (
      <>
        <LedgerApp key={user.uid} signedIn />
        <footer style={{ padding: "12px 20px", textAlign: "right" }}>
          <button type="button" className="button secondary" onClick={logout}>
            Esci
          </button>
          {error && <p role="alert">{error}</p>}
        </footer>
      </>
    );
  }

  return (
    <main className="panel" style={{ maxWidth: 420, margin: "48px auto", width: "92%" }}>
      <h1>Accedi a Saldo</h1>
      <form className="editor" onSubmit={login}>
        <label>
          Email
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "Accesso in corso…" : "Accedi"}
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);