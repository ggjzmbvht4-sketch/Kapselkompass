import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Coffee,
  Compass,
  Library,
  Plus,
  UserRound,
  ArrowUpRight,
  Search,
  Heart,
  Star,
  ArrowLeft,
  X,
  Check,
  Cloud,
  CloudOff,
  RefreshCw,
  Camera,
  SlidersHorizontal,
  LogOut,
  Trash2,
  Pencil,
  Share2,
  BarChart3,
} from "lucide-react";
import { supabase, configured, redirectUrl } from "./backend";
import {
  criteria,
  average,
  validateTasting,
  type Capsule,
  type Tasting,
  type LocalRow,
  type Kind,
  type Photo,
} from "./domain";
import * as store from "./store";
const DEMO = "demo-local";
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const asCapsule = (r: LocalRow) => r.data as Capsule;
function Button({
  children,
  onClick,
  secondary = false,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={secondary ? "button secondary" : "button"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    const prev = document.activeElement as HTMLElement;
    const el = document.querySelector<HTMLDialogElement>("dialog");
    el?.showModal();
    el?.querySelector<HTMLElement>("input,button,select")?.focus();
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return (
    <dialog onCancel={close}>
      <div className="modal-title">
        <h2>{title}</h2>
        <button aria-label="Schließen" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Photos({
  rows,
  shared = false,
  onDelete,
}: {
  rows: LocalRow[];
  shared?: boolean;
  onDelete?: (r: LocalRow) => void;
}) {
  return (
    <div className="photos">
      {rows.map((r) => (
        <PhotoView key={r.id} row={r} shared={shared} onDelete={onDelete} />
      ))}
    </div>
  );
}
function PhotoView({
  row,
  shared,
  onDelete,
}: {
  row: LocalRow;
  shared: boolean;
  onDelete?: (r: LocalRow) => void;
}) {
  const [url, setUrl] = useState(""),
    [err, setErr] = useState("");
  useEffect(() => {
    let alive = true,
      object = "";
    store
      .photoUrl(row, shared)
      .then((v) => {
        object = v;
        if (alive) setUrl(v);
        else URL.revokeObjectURL(v);
      })
      .catch(() => {
        if (alive) setErr("Foto gerade nicht verfügbar");
      });
    return () => {
      alive = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [row.id, shared]);
  return (
    <div className="photo">
      {url ? (
        <img src={url} alt={(row.data as Photo).caption} />
      ) : (
        <span>{err || "Foto lädt …"}</span>
      )}
      {onDelete && (
        <button aria-label="Foto löschen" onClick={() => onDelete(row)}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(false),
    [rows, setRows] = useState<LocalRow[]>([]),
    [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [modal, setModal] = useState<{
      kind: Kind;
      row?: LocalRow;
      capsule?: string;
    } | null>(null),
    [auth, setAuth] = useState(false),
    [recovery, setRecovery] = useState(location.hash.includes("type=recovery")),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [query, setQuery] = useState(""),
    [brand, setBrand] = useState(""),
    [system, setSystem] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("recent"),
    [selected, setSelected] = useState<string[]>([]),
    [showFilters, setShowFilters] = useState(false),
    [install, setInstall] = useState<any>(null),
    [update, setUpdate] = useState(false);
  const uid = user?.id || (demo ? DEMO : "");
  const navigate = (path: string) => {
    location.hash = path;
    setQuery("");
  };
  useEffect(() => {
    const hash = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", hash);
    const net = () => setOnline(navigator.onLine);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    const upd = () => setUpdate(true);
    window.addEventListener("app-update", upd);
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session?.user || null);
        setReady(true);
      });
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user || null);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      });
      return () => {
        data.subscription.unsubscribe();
        window.removeEventListener("hashchange", hash);
        window.removeEventListener("online", net);
        window.removeEventListener("offline", net);
        window.removeEventListener("beforeinstallprompt", prompt);
        window.removeEventListener("app-update", upd);
      };
    }
    setReady(true);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("app-update", upd);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setRows([]);
    const load = () => {
      if (uid)
        store.list(uid).then((r) => {
          if (active) setRows(r);
        });
    };
    load();
    store.events.addEventListener("change", load);
    return () => {
      active = false;
      store.events.removeEventListener("change", load);
    };
  }, [uid]);
  async function synchronize() {
    if (!uid || demo || !online) return;
    setBusy(true);
    try {
      await store.sync(uid);
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (uid && online && !demo) {
      void synchronize();
      const interval = setInterval(() => {
        void synchronize();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [uid, online, demo]);
  const active = rows.filter((r) => !r.deleted),
    capsules = active.filter((r) => r.kind === "capsules"),
    tastings = active.filter((r) => r.kind === "tastings"),
    pending = rows.filter((r) => r.dirty).length,
    conflicts = rows.filter((r) => r.conflict),
    errors = rows.filter((r) => r.error && !r.conflict);
  const detailId = route.startsWith("/kaffee/") ? route.split("/")[2] : null,
    detail = capsules.find((r) => r.id === detailId);
  const photos = (id: string) =>
    active.filter(
      (r) => r.kind === "photos" && (r.data as Photo).parent_id === id,
    );
  const tastingList = (id: string) =>
    tastings
      .filter((r) => (r.data as Tasting).capsule_id === id)
      .sort((a, b) =>
        (b.data as Tasting).date.localeCompare((a.data as Tasting).date),
      );
  const filtered = capsules
    .filter((r) => {
      const c = asCapsule(r),
        rated = average(rows, r.id) !== null;
      return (
        `${c.brand} ${c.name}`.toLowerCase().includes(query.toLowerCase()) &&
        (!brand || c.brand === brand) &&
        (!system || c.system === system) &&
        (!status ||
          (status === "rated"
            ? rated
            : status === "unrated"
              ? !rated
              : c.favorite))
      );
    })
    .sort((a, b) =>
      sort === "score"
        ? (average(rows, b.id) || 0) - (average(rows, a.id) || 0)
        : sort === "name"
          ? asCapsule(a).name.localeCompare(asCapsule(b).name)
          : b.updated_at.localeCompare(a.updated_at),
    );
  async function beginDemo() {
    setDemo(true);
    navigate("/");
    if (!(await store.list(DEMO)).length) {
      for (const c of [
        {
          name: "Ristretto Italiano",
          brand: "Nespresso",
          system: "Original",
          intensity: 10,
          price: 0.49,
          favorite: true,
        },
        {
          name: "Espresso Barista",
          brand: "L’OR",
          system: "Original",
          intensity: 9,
          price: 0.39,
          favorite: false,
        },
        {
          name: "Colombia",
          brand: "Nespresso",
          system: "Original",
          intensity: 6,
          price: 0.55,
          favorite: false,
        },
      ]) {
        const row = await store.save(DEMO, "capsules", c);
        if (c.name !== "Colombia")
          await store.save(DEMO, "tastings", {
            capsule_id: row.id,
            date: new Date().toISOString(),
            method: "Espresso",
            water: 40,
            aroma: 8,
            intensity: c.intensity,
            acidity: 4,
            bitterness: 6,
            body: 8,
            overall: c.favorite ? 9 : 7,
            notes: "Beispielverkostung – entdecke hier die Funktionen.",
            tags: ["Schokolade", "Nuss"],
            rebuy: "yes",
          });
      }
    }
  }
  async function removeRecord(row: LocalRow) {
    if (
      !confirm(
        "Diesen Eintrag löschen? Zugehörige Verkostungen und Fotos werden ebenfalls gelöscht.",
      )
    )
      return;
    try {
      const children = rows.filter(
        (r) =>
          !r.deleted &&
          ((r.kind === "tastings" &&
            (r.data as Tasting).capsule_id === row.id) ||
            (r.kind === "photos" && (r.data as Photo).parent_id === row.id)),
      );
      for (const child of children) {
        for (const p of photos(child.id)) await store.remove(p);
        await store.remove(child);
      }
      await store.remove(row);
      if (row.kind === "capsules") navigate("/sammlung");
      void synchronize();
    } catch (e) {
      setNotice(message(e));
    }
  }
  async function logout() {
    if (
      pending &&
      !confirm(
        `${pending} Änderungen sind noch nicht übertragen. Beim Abmelden gehen sie auf diesem Gerät verloren. Trotzdem abmelden?`,
      )
    )
      return;
    await store.clear(uid);
    if (supabase && user) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        setNotice(error.message);
        return;
      }
    }
    setUser(null);
    setDemo(false);
    setRows([]);
    navigate("/");
  }
  const openNew = (kind: Kind, capsule?: string) => {
    if (!uid) {
      setAuth(true);
      return;
    }
    setModal({ kind, capsule });
  };
  const nav = [
    { path: "/", text: "Übersicht", icon: Compass },
    { path: "/sammlung", text: "Meine Sammlung", icon: Library },
    { path: "/vergleich", text: "Vergleichen", icon: BarChart3 },
    { path: "/profil", text: "Mein Profil", icon: UserRound },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="logo" href="#/">
          <span className="logo-icon">
            <Coffee size={25} />
          </span>
          <span>
            Kapsel<span className="brand-light">kompass</span>
            <small>DEIN KAFFEETAGEBUCH</small>
          </span>
        </a>
        <div className="nav-label">DEIN KLEINES KAFFEEUNIVERSUM</div>
        <nav>
          {nav.map((n) => (
            <a
              key={n.path}
              href={"#" + n.path}
              className={route === n.path ? "active" : ""}
            >
              <n.icon size={20} />
              {n.text}
              {n.path === "/sammlung" && (
                <span className="nav-count">{capsules.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="daily">
            <Coffee size={24} />
            <p>
              Guter Kaffee bleibt.
              <br />
              <strong>Auch in Erinnerung.</strong>
            </p>
            <span>Eine Tasse. Ein Moment. Dein Geschmack.</span>
          </div>
          <button
            className="account"
            onClick={() => (uid ? navigate("/profil") : setAuth(true))}
          >
            <span className="avatar">
              {uid ? (
                user?.email?.[0]?.toUpperCase() || "D"
              ) : (
                <UserRound size={20} />
              )}
            </span>
            <span>
              {demo
                ? "Demo entdecken"
                : user?.email?.split("@")[0] || "Dein persönlicher Bereich"}
              <small>
                {uid ? "Dein Kaffeeprofil" : "Anmelden oder registrieren"}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="crumb">Dein Kaffee. Dein Geschmack.</span>
          <div className="top-actions">
            <span className="connection">
              {online ? <Cloud size={16} /> : <CloudOff size={16} />}
              <span>
                {demo
                  ? "Lokale Demo"
                  : !online
                    ? "Offline"
                    : busy
                      ? "Synchronisiert …"
                      : pending
                        ? `${pending} nur lokal`
                        : uid && configured
                          ? "Verbunden"
                          : "Bereit"}
              </span>
            </span>
            {uid && !demo && (
              <button
                aria-label="Synchronisieren"
                onClick={() => void synchronize()}
                disabled={busy}
              >
                <RefreshCw size={17} className={busy ? "spin" : ""} />
              </button>
            )}
            <span className="avatar small">
              <Coffee size={17} />
            </span>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Hinweis schließen"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!configured && (
            <div className="setup-banner">
              <CloudOff size={17} />
              <span>
                Die Oberfläche ist bereit. Für Anmeldung und Synchronisierung
                fehlt noch die Supabase-Konfiguration.
              </span>
            </div>
          )}
          {demo && (
            <div className="setup-banner">
              Du erkundest eine lokale Demo mit Beispieldaten. Deine Einträge
              werden nicht in die Cloud übertragen.
            </div>
          )}
          {update && (
            <div className="notice">
              Eine neue Version ist verfügbar. Schließe alle App-Fenster und
              öffne die App erneut.
              <button onClick={() => setUpdate(false)} aria-label="Schließen">
                <X />
              </button>
            </div>
          )}
          {conflicts.map((r) => (
            <div className="notice" key={r.id}>
              <span>
                Änderungskonflikt bei{" "}
                {r.kind === "capsules"
                  ? (r.data as Capsule).name
                  : "einem Eintrag"}
                . Wähle die Version, die erhalten bleibt.
              </span>
              <Button
                secondary
                onClick={() => {
                  void store.resolve(r, "remote");
                }}
              >
                Gespeicherte Version
              </Button>
              <Button
                onClick={() => {
                  void store.resolve(r, "local").then(synchronize);
                }}
              >
                Meine lokale Version
              </Button>
            </div>
          ))}
          {errors.length > 0 && (
            <div className="notice">
              <span>
                {errors.length} Änderungen noch nicht übertragen:{" "}
                {errors[0].error}
              </span>
              <Button secondary onClick={() => void synchronize()}>
                Erneut versuchen
              </Button>
            </div>
          )}
          {!ready ? (
            <p>Dein Kaffeetagebuch lädt …</p>
          ) : route === "/profil" ? (
            <Profile
              user={user}
              demo={demo}
              logout={() => void logout()}
              install={install}
              setNotice={setNotice}
              login={() => setAuth(true)}
            />
          ) : route === "/vergleich" ? (
            <>
              <PageTitle
                eyebrow="NEBENEINANDER ENTDECKEN"
                title="Geschmack im Vergleich"
                text="Bis zu drei Kaffees. Alle Nuancen auf einen Blick."
              />
              <div className="compare-picker">
                {capsules.map((c) => (
                  <button
                    className={
                      selected.includes(c.id) ? "chip selected" : "chip"
                    }
                    key={c.id}
                    onClick={() =>
                      setSelected(
                        selected.includes(c.id)
                          ? selected.filter((id) => id !== c.id)
                          : selected.length < 3
                            ? [...selected, c.id]
                            : selected,
                      )
                    }
                  >
                    {selected.includes(c.id) && <Check size={14} />}{" "}
                    {asCapsule(c).name}
                  </button>
                ))}
              </div>
              {selected.length ? (
                <div className="compare-grid">
                  {selected.map((id) => {
                    const c = capsules.find((c) => c.id === id);
                    return c ? (
                      <section className="panel" key={id}>
                        <Coffee size={35} />
                        <p className="eyebrow">{asCapsule(c).brand}</p>
                        <h2>{asCapsule(c).name}</h2>
                        {criteria.map(([key, label]) => (
                          <div className="compare-score" key={key}>
                            <span>{label}</span>
                            <strong>
                              {fmt(average(rows, id, key))}
                              <small> / 10</small>
                            </strong>
                            <div className="bar">
                              <i
                                style={{
                                  width: `${(average(rows, id, key) || 0) * 10}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        <p className="muted">
                          {tastingList(id).length} Verkostungen
                        </p>
                      </section>
                    ) : null;
                  })}
                </div>
              ) : (
                <Empty
                  title="Welche Kaffees möchtest du vergleichen?"
                  text="Wähle oben bis zu drei Sorten aus deiner Sammlung."
                />
              )}
            </>
          ) : route.startsWith("/geteilt/") ? (
            <Shared
              key={uid + route}
              owner={route.split("/")[2]}
              setNotice={setNotice}
            />
          ) : detail ? (
            <>
              <button className="back" onClick={() => navigate("/sammlung")}>
                <ArrowLeft size={16} /> Zur Sammlung
              </button>
              <div className="detail-top">
                <div>
                  <p className="eyebrow">
                    {asCapsule(detail).brand} · {asCapsule(detail).system}
                  </p>
                  <h1>{asCapsule(detail).name}</h1>
                  <p className="muted">
                    {asCapsule(detail).intensity &&
                      `Herstellerintensität ${asCapsule(detail).intensity}`}
                    {asCapsule(detail).price !== undefined &&
                      ` · ${asCapsule(detail).price?.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} je Kapsel`}
                  </p>
                </div>
                <div className="row">
                  <button
                    aria-label="Favorit umschalten"
                    onClick={() => {
                      void store
                        .save(
                          uid,
                          "capsules",
                          {
                            ...asCapsule(detail),
                            favorite: !asCapsule(detail).favorite,
                          },
                          detail,
                        )
                        .then(synchronize);
                    }}
                  >
                    <Heart
                      fill={
                        asCapsule(detail).favorite ? "currentColor" : "none"
                      }
                    />
                  </button>
                  <button
                    aria-label="Sorte bearbeiten"
                    onClick={() => setModal({ kind: "capsules", row: detail })}
                  >
                    <Pencil size={19} />
                  </button>
                  <button
                    aria-label="Sorte löschen"
                    onClick={() => void removeRecord(detail)}
                  >
                    <Trash2 size={19} />
                  </button>
                </div>
              </div>
              <Photos
                rows={photos(detail.id)}
                onDelete={(r) => void store.remove(r).then(synchronize)}
              />
              <div className="profile-scores">
                {criteria.map(([k, l]) => (
                  <div key={k}>
                    <span>{l}</span>
                    <strong>
                      {fmt(average(rows, detail.id, k))}
                      <small>/10</small>
                    </strong>
                  </div>
                ))}
              </div>
              <div className="section-head">
                <h2>
                  Deine Verkostungen{" "}
                  <span className="count">{tastingList(detail.id).length}</span>
                </h2>
                <Button onClick={() => openNew("tastings", detail.id)}>
                  <Plus size={17} /> Verkostung hinzufügen
                </Button>
              </div>
              {tastingList(detail.id).map((r) => (
                <TastingCard
                  key={r.id}
                  row={r}
                  photos={photos(r.id)}
                  edit={() => setModal({ kind: "tastings", row: r })}
                  remove={() => void removeRecord(r)}
                />
              ))}
              {!tastingList(detail.id).length && (
                <Empty
                  title="Der erste Eindruck zählt."
                  text="Bereite dir eine Tasse zu und halte fest, was diesen Kaffee ausmacht."
                />
              )}
            </>
          ) : detailId ? (
            <Empty
              title="Diese Sorte ist nicht verfügbar."
              text="Vielleicht wurde sie gelöscht oder noch nicht auf dieses Gerät übertragen."
            />
          ) : (
            <>
              {route === "/" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">ZEIT FÜR EINEN GUTEN KAFFEE</p>
                      <h1>
                        Dein Geschmack. <em>Deine Entdeckungen.</em>
                      </h1>
                      <p className="muted">
                        Aus einer Tasse wird eine Erinnerung. Finde heraus, was
                        dir wirklich schmeckt.
                      </p>
                    </div>
                    <Button onClick={() => openNew("capsules")}>
                      <Plus size={18} /> Kaffee hinzufügen
                    </Button>
                  </div>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="pill">
                        <span /> DEIN PERSÖNLICHER KAFFEEKOMPASS
                      </span>
                      <h2>
                        Jede Kapsel erzählt
                        <br />
                        eine <em>Geschichte.</em>
                      </h2>
                      <p>
                        Halte Aromen fest, entdecke deine Favoriten
                        <br className="desktop" /> und mach aus Probieren deinen
                        eigenen Kompass.
                      </p>
                      <Button
                        onClick={() =>
                          uid ? openNew("tastings") : setAuth(true)
                        }
                      >
                        <Plus size={17} />{" "}
                        {uid ? "Jetzt verkosten" : "Dein Tagebuch starten"}
                        <ArrowUpRight size={17} />
                      </Button>
                      {!uid && (
                        <button
                          className="demo-link"
                          onClick={() => void beginDemo()}
                        >
                          Erst einmal ausprobieren →
                        </button>
                      )}
                    </div>
                    <div className="coffee-scene" aria-hidden="true">
                      <div className="scene-ring ring-one" />
                      <div className="scene-ring ring-two" />
                      <span className="scene-caption">
                        EIN KLEINER MOMENT.
                        <br />
                        VIEL GESCHMACK.
                      </span>
                      <div className="saucer">
                        <div className="handle" />
                        <div className="cup">
                          <div className="espresso">
                            <div className="crema" />
                          </div>
                        </div>
                      </div>
                      <span className="bean b1" />
                      <span className="bean b2" />
                      <span className="bean b3" />
                      <span className="capsule-art" />
                      <span className="scene-note">
                        Deine nächste Lieblingssorte wartet schon.
                      </span>
                    </div>
                  </section>
                  <div className="stats">
                    {[
                      {
                        icon: Library,
                        n: capsules.length,
                        label: "Kaffees in deiner Sammlung",
                        sub: "So viel zu entdecken",
                      },
                      {
                        icon: Coffee,
                        n: tastings.length,
                        label: "Festgehaltene Verkostungen",
                        sub: "Jede Tasse zählt",
                      },
                      {
                        icon: Heart,
                        n: capsules.filter((c) => asCapsule(c).favorite).length,
                        label: "Persönliche Favoriten",
                        sub: "Die bleiben in Erinnerung",
                      },
                      {
                        icon: Star,
                        n: tastings.length
                          ? fmt(
                              tastings.reduce(
                                (s, t) => s + (t.data as Tasting).overall,
                                0,
                              ) / tastings.length,
                            )
                          : "—",
                        label: "Deine durchschnittliche Note",
                        sub: "Auf einer Skala von 1 bis 10",
                      },
                    ].map((s) => (
                      <section className="stat" key={s.label}>
                        <span className="stat-icon">
                          <s.icon size={19} />
                        </span>
                        <strong>{s.n}</strong>
                        <p>{s.label}</p>
                        <small>{s.sub}</small>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <PageTitle
                  eyebrow="DEINE ENTDECKUNGEN, GUT AUFGEHOBEN"
                  title="Meine Kaffeesammlung"
                  text="Alle Sorten, alle Eindrücke. Und dein nächster Lieblingskaffee."
                />
              )}
              <div className="section-head">
                <div>
                  <h2>
                    {route === "/" ? "Deine Kaffees" : "Alle Kaffees"}{" "}
                    <span className="count">{capsules.length}</span>
                  </h2>
                  {route === "/" && (
                    <p className="muted">
                      Ein Überblick über deine kleinen Alltagsentdeckungen.
                    </p>
                  )}
                </div>
                {route === "/" ? (
                  <a className="text-link" href="#/sammlung">
                    Zur Sammlung <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <Button onClick={() => openNew("capsules")}>
                    <Plus size={17} /> Kaffee hinzufügen
                  </Button>
                )}
              </div>
              <div className="toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Kaffee suchen"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Kaffee oder Marke suchen …"
                  />
                </label>
                <button
                  className={"filter-button " + (showFilters ? "selected" : "")}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={17} /> Filter
                </button>
                <select
                  aria-label="Sortieren"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="recent">Zuletzt hinzugefügt</option>
                  <option value="score">Beste Bewertung</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
              {showFilters && (
                <div className="filters">
                  <select
                    aria-label="Marke"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  >
                    <option value="">Alle Marken</option>
                    {[...new Set(capsules.map((c) => asCapsule(c).brand))].map(
                      (b) => (
                        <option key={b}>{b}</option>
                      ),
                    )}
                  </select>
                  <select
                    aria-label="Kapselsystem"
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                  >
                    <option value="">Alle Systeme</option>
                    {[...new Set(capsules.map((c) => asCapsule(c).system))].map(
                      (b) => (
                        <option key={b}>{b}</option>
                      ),
                    )}
                  </select>
                  <select
                    aria-label="Bewertungsstatus"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Alle Kaffees</option>
                    <option value="rated">Bewertet</option>
                    <option value="unrated">Noch unprobiert</option>
                    <option value="favorite">Favoriten</option>
                  </select>
                </div>
              )}
              <div className="coffee-grid">
                {filtered
                  .slice(0, route === "/" ? 6 : undefined)
                  .map((r, i) => (
                    <CoffeeCard
                      key={r.id}
                      row={r}
                      score={average(rows, r.id)}
                      count={tastingList(r.id).length}
                      photos={photos(r.id)}
                      index={i}
                      open={() => navigate("/kaffee/" + r.id)}
                    />
                  ))}
                {route === "/" && capsules.length > 0 && (
                  <button
                    className="add-card"
                    onClick={() => openNew("capsules")}
                  >
                    <span>
                      <Plus size={28} />
                    </span>
                    <h3>Was kommt als Nächstes?</h3>
                    <p>
                      Gib deiner nächsten
                      <br />
                      Entdeckung einen Platz.
                    </p>
                    <strong>
                      Kaffee hinzufügen <ArrowUpRight size={16} />
                    </strong>
                  </button>
                )}
              </div>
              {filtered.length === 0 && (
                <Empty
                  title={
                    capsules.length
                      ? "Kein Kaffee gefunden."
                      : "Deine Sammlung beginnt mit einer Kapsel."
                  }
                  text={
                    capsules.length
                      ? "Versuche einen anderen Suchbegriff oder passe die Filter an."
                      : "Füge deine erste Sorte mit Foto hinzu. Deine Bewertungen und Favoriten finden hier ihren Platz."
                  }
                  action={
                    <Button onClick={() => openNew("capsules")}>
                      <Plus size={17} /> Erste Sorte hinzufügen
                    </Button>
                  }
                />
              )}
              {!uid && (
                <p className="privacy-note">
                  Dein Geschmack gehört dir. Private Sammlung · Gezielte
                  Freigaben · Auf allen deinen Geräten
                </p>
              )}
            </>
          )}
          <footer>
            <Coffee size={15} />
            <span>Mit jeder Tasse ein bisschen mehr dein Geschmack.</span>
            <span>Kapselkompass</span>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav">
        {nav.map((n) => (
          <a
            href={"#" + n.path}
            className={route === n.path ? "active" : ""}
            key={n.path}
          >
            <n.icon size={21} />
            <span>{n.text.replace("Meine ", "").replace("Mein ", "")}</span>
          </a>
        ))}
      </nav>
      {modal && (
        <Modal
          title={
            modal.kind === "capsules"
              ? modal.row
                ? "Kaffee bearbeiten"
                : "Eine neue Entdeckung"
              : modal.row
                ? "Verkostung bearbeiten"
                : "Wie schmeckt dein Kaffee?"
          }
          close={() => setModal(null)}
        >
          <EntryForm
            kind={modal.kind}
            row={modal.row}
            capsule={modal.capsule}
            capsules={capsules}
            save={async (data, files) => {
              const row = await store.save(uid, modal.kind, data, modal.row);
              await store.addPhotos(uid, row.id, files);
              setModal(null);
              setNotice(
                demo
                  ? "In deiner lokalen Demo gespeichert."
                  : "Lokal gespeichert. Die Übertragung startet bei bestehender Verbindung.",
              );
              void synchronize();
            }}
          />
        </Modal>
      )}
      {(auth || recovery) && (
        <Modal
          title={
            recovery
              ? "Neues Passwort setzen"
              : "Willkommen in deiner Kaffeebar"
          }
          close={() => {
            setAuth(false);
            setRecovery(false);
          }}
        >
          <Auth
            recovery={recovery}
            done={() => {
              setAuth(false);
              setRecovery(false);
              navigate("/");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Das hat nicht geklappt. Bitte versuche es erneut.";
}
function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty">
      <span className="empty-icon">
        <Coffee size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  );
}
function CoffeeCard({
  row,
  score,
  count,
  photos,
  index,
  open,
}: {
  row: LocalRow;
  score: number | null;
  count: number;
  photos: LocalRow[];
  index: number;
  open: () => void;
}) {
  const c = asCapsule(row);
  return (
    <button className={"coffee-card tone-" + (index % 4)} onClick={open}>
      <div className="card-visual">
        {photos.length ? (
          <Photos rows={photos.slice(0, 1)} />
        ) : (
          <>
            <div className="product-capsule">
              <span>{c.brand.slice(0, 1)}</span>
            </div>
            <div className="product-shadow" />
          </>
        )}
        {c.favorite && (
          <span className="favorite-badge">
            <Heart size={15} fill="currentColor" />
          </span>
        )}
        <span className="system-badge">{c.system}</span>
      </div>
      <div className="card-body">
        <p className="eyebrow">{c.brand}</p>
        <h3>{c.name}</h3>
        <div className="card-meta">
          <span>
            {c.intensity ? "Intensität " + c.intensity : "Deine Entdeckung"}
          </span>
          {c.price !== undefined && (
            <span>
              {c.price.toLocaleString("de-DE", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
          )}
        </div>
        <div className="card-bottom">
          <span className={score === null ? "unrated" : "score"}>
            {score === null ? (
              <Coffee size={14} />
            ) : (
              <Star size={14} fill="currentColor" />
            )}
            {score === null ? "Noch unprobiert" : `${fmt(score)} / 10`}
          </span>
          <span>
            {count
              ? `${count} Verkostung${count === 1 ? "" : "en"}`
              : "Entdecken"}{" "}
            <ArrowUpRight size={14} />
          </span>
        </div>
      </div>
    </button>
  );
}
function TastingCard({
  row,
  photos,
  edit,
  remove,
  shared = false,
}: {
  row: LocalRow;
  photos: LocalRow[];
  edit?: () => void;
  remove?: () => void;
  shared?: boolean;
}) {
  const t = row.data as Tasting;
  return (
    <article className="panel tasting">
      <div className="section-head">
        <div>
          <p className="eyebrow">
            {new Date(t.date).toLocaleString("de-DE", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <h3>
            {t.method}
            {t.water ? ` · ${t.water} ml` : ""}
          </h3>
        </div>
        <span className="score large">
          <Star size={18} fill="currentColor" />
          {t.overall}
          <small>/10</small>
        </span>
      </div>
      <div className="tasting-scores">
        {criteria.slice(0, 5).map(([k, l]) => (
          <span key={k}>
            {l} <strong>{t[k]}</strong>
          </span>
        ))}
      </div>
      {t.notes && <p className="notes">{t.notes}</p>}
      <div className="tags">
        {t.tags.map((tag) => (
          <span className="chip" key={tag}>
            {tag}
          </span>
        ))}
        <span className="chip">
          Wiederkaufen:{" "}
          {t.rebuy === "yes" ? "Ja" : t.rebuy === "no" ? "Nein" : "Unsicher"}
        </span>
      </div>
      <Photos rows={photos} shared={shared} />
      {!shared && (
        <div className="tasting-actions">
          <span>{row.dirty ? "Nur lokal" : "Gespeichert"}</span>
          <button onClick={edit}>
            <Pencil size={15} /> Bearbeiten
          </button>
          <button onClick={remove}>
            <Trash2 size={15} /> Löschen
          </button>
        </div>
      )}
    </article>
  );
}
function EntryForm({
  kind,
  row,
  capsule,
  capsules,
  save,
}: {
  kind: Kind;
  row?: LocalRow;
  capsule?: string;
  capsules: LocalRow[];
  save: (data: Capsule | Tasting, files: File[]) => Promise<void>;
}) {
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [scores, setScores] = useState<Partial<Record<string, number>>>(
      row && kind === "tastings"
        ? Object.fromEntries(
            criteria.map(([k]) => [k, (row.data as Tasting)[k]]),
          )
        : {},
    );
  const c = (row?.data || {}) as Partial<Capsule>,
    t = (row?.data || {}) as Partial<Tasting>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const f = new FormData(e.currentTarget);
      if (
        files.some(
          (f) =>
            !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
            f.size > 10 * 1024 * 1024,
        )
      )
        throw Error(
          "Fotos müssen JPEG, PNG oder WebP sein und dürfen jeweils höchstens 10 MB haben.",
        );
      let data: Capsule | Tasting;
      if (kind === "capsules") {
        data = {
          name: String(f.get("name")).trim(),
          brand: String(f.get("brand")).trim(),
          system: String(f.get("system")).trim(),
          favorite: c.favorite || false,
          ...(f.get("intensity")
            ? { intensity: Number(f.get("intensity")) }
            : {}),
          ...(f.get("price") ? { price: Number(f.get("price")) } : {}),
        };
        if (!data.name || !data.brand || !data.system)
          throw Error("Bitte Name, Marke und System ausfüllen.");
      } else {
        data = {
          ...scores,
          capsule_id: String(f.get("capsule_id")),
          date: new Date(String(f.get("date"))).toISOString(),
          method: String(f.get("method")),
          water: f.get("water") ? Number(f.get("water")) : undefined,
          notes: String(f.get("notes")),
          tags: String(f.get("tags"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          rebuy: String(f.get("rebuy")),
        } as Tasting;
        if (!validateTasting(data))
          throw Error("Bitte alle sechs Skalen bewusst von 1 bis 10 bewerten.");
      }
      await save(data, files);
    } catch (e) {
      setErr(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="entry-form">
      {kind === "capsules" ? (
        <>
          <p className="muted">
            Eine Sorte, viele Eindrücke. Lege zuerst deinen Kaffee an.
          </p>
          <label>
            Name der Sorte
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={c.name}
              placeholder="z. B. Ristretto Italiano"
            />
          </label>
          <div className="form-grid">
            <label>
              Marke
              <input
                name="brand"
                required
                maxLength={80}
                defaultValue={c.brand}
                placeholder="z. B. Nespresso"
              />
            </label>
            <label>
              Kapselsystem
              <input
                name="system"
                list="systems"
                required
                maxLength={80}
                defaultValue={c.system || "Original"}
              />
              <datalist id="systems">
                {[
                  "Original",
                  "Vertuo",
                  "Dolce Gusto",
                  "Tassimo",
                  "Cafissimo",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </datalist>
            </label>
            <label>
              Herstellerintensität (optional)
              <input
                name="intensity"
                type="number"
                min="1"
                max="20"
                defaultValue={c.intensity}
              />
            </label>
            <label>
              Preis je Kapsel in € (optional)
              <input
                name="price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={c.price}
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <label>
              Kaffeesorte
              <select
                name="capsule_id"
                required
                defaultValue={t.capsule_id || capsule || ""}
              >
                <option value="" disabled>
                  Sorte auswählen
                </option>
                {capsules.map((c) => (
                  <option key={c.id} value={c.id}>
                    {asCapsule(c).brand} · {asCapsule(c).name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Zeitpunkt
              <input
                name="date"
                type="datetime-local"
                required
                defaultValue={
                  t.date
                    ? new Date(
                        new Date(t.date).getTime() -
                          new Date(t.date).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : today()
                }
              />
            </label>
            <label>
              Zubereitung
              <select name="method" defaultValue={t.method || "Espresso"}>
                {[
                  "Espresso",
                  "Ristretto",
                  "Lungo",
                  "Americano",
                  "Mit Milch",
                  "Cappuccino",
                  "Latte Macchiato",
                  "Andere",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Wassermenge in ml (optional)
              <input
                name="water"
                type="number"
                min="1"
                max="2000"
                defaultValue={t.water}
              />
            </label>
          </div>
          <h3>Dein Geschmacksprofil</h3>
          <p className="muted">
            Die ersten fünf Skalen beschreiben den Kaffee. Die Gesamtnote
            beschreibt, wie gut er dir gefällt.
          </p>
          {criteria.map(([k, label, left, right]) => (
            <fieldset className="rating" key={k}>
              <legend>
                {label}{" "}
                <strong>
                  {scores[k] ?? "—"}
                  <small> / 10</small>
                </strong>
              </legend>
              <div className="rating-buttons">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-label={`${label}: ${n} von 10`}
                    aria-pressed={scores[k] === n}
                    className={scores[k] === n ? "chosen" : ""}
                    onClick={() => setScores({ ...scores, [k]: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="scale-ends">
                <span>{left}</span>
                <span>{right}</span>
              </div>
            </fieldset>
          ))}
          <label>
            Geschmacksnoten, mit Komma getrennt
            <input
              name="tags"
              defaultValue={t.tags?.join(", ")}
              placeholder="Schokolade, Nuss, fruchtig …"
            />
          </label>
          <label>
            Deine Notizen
            <textarea
              name="notes"
              rows={3}
              maxLength={5000}
              defaultValue={t.notes}
              placeholder="Was bleibt dir von dieser Tasse in Erinnerung?"
            />
          </label>
          <label>
            Würdest du ihn wieder kaufen?
            <select name="rebuy" defaultValue={t.rebuy || "maybe"}>
              <option value="maybe">Noch unsicher</option>
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
        </>
      )}
      <label className="upload">
        <Camera size={24} />
        <strong>Fotos hinzufügen</strong>
        <span>Kamera oder Galerie · JPEG, PNG, WebP · bis 10 MB je Foto</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
      </label>
      {files.length > 0 && <p>{files.length} Foto(s) ausgewählt</p>}
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy || (kind === "tastings" && !capsules.length)}
      >
        <Check size={17} />
        {busy ? "Wird gespeichert …" : "In meinem Tagebuch speichern"}
      </Button>
      {kind === "tastings" && !capsules.length && (
        <p className="error">
          Lege zuerst eine Kaffeesorte in deiner Sammlung an.
        </p>
      )}
    </form>
  );
}
function Auth({ recovery, done }: { recovery: boolean; done: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setNotice("Die Supabase-Verbindung ist noch nicht eingerichtet.");
      return;
    }
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      password = String(f.get("password"));
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        done();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl() },
        });
        if (error) throw error;
        setNotice(
          "Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.",
        );
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl(),
        });
        if (error) throw error;
        setNotice(
          "Wenn ein Konto existiert, erhältst du eine E-Mail zum Zurücksetzen.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        done();
      }
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="entry-form" onSubmit={submit}>
      <p className="muted">
        Deine Sammlung bleibt privat. Mit einem Konto ist sie auf allen deinen
        Geräten dabei.
      </p>
      {!recovery && (
        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            Konto erstellen
          </button>
        </div>
      )}
      {!recovery && (
        <label>
          E-Mail-Adresse
          <input name="email" type="email" autoComplete="email" required />
        </label>
      )}
      {(recovery || mode !== "reset") && (
        <label>
          {recovery ? "Neues Passwort" : "Passwort"}
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={
              mode === "login" && !recovery
                ? "current-password"
                : "new-password"
            }
            required
          />
        </label>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <Button type="submit" disabled={busy || !configured}>
        {busy
          ? "Einen Moment …"
          : recovery
            ? "Passwort speichern"
            : mode === "login"
              ? "Anmelden"
              : mode === "signup"
                ? "Konto erstellen"
                : "Link anfordern"}
      </Button>
      {!recovery && (
        <button
          type="button"
          className="text-link"
          onClick={() => setMode(mode === "reset" ? "login" : "reset")}
        >
          {mode === "reset" ? "Zur Anmeldung" : "Passwort vergessen?"}
        </button>
      )}
    </form>
  );
}
function Profile({
  user,
  demo,
  logout,
  install,
  setNotice,
  login,
}: {
  user: User | null;
  demo: boolean;
  logout: () => void;
  install: any;
  setNotice: (s: string) => void;
  login: () => void;
}) {
  const [shares, setShares] = useState<any[]>([]),
    [received, setReceived] = useState<any[]>([]),
    [name, setName] = useState(""),
    [email, setEmail] = useState("");
  async function load() {
    if (!supabase || !user) return;
    const [a, b, c] = await Promise.all([
      supabase.from("coffee_shares").select("*").eq("owner_id", user.id),
      supabase
        .from("coffee_shares")
        .select("*,coffee_profiles!coffee_shares_owner_id_fkey(display_name)")
        .eq("viewer_id", user.id),
      supabase.from("coffee_profiles").select("*").eq("id", user.id).single(),
    ]);
    if (a.error || b.error || c.error) {
      setNotice(message(a.error || b.error || c.error));
      return;
    }
    setShares(a.data || []);
    setReceived(b.data || []);
    setName(c.data?.display_name || "");
  }
  useEffect(() => {
    void load();
  }, [user?.id]);
  return (
    <>
      <PageTitle
        eyebrow="DEIN PERSÖNLICHER BEREICH"
        title="Mein Kaffeeprofil"
        text="Dein Geschmack gehört dir. Du entscheidest, mit wem du ihn teilst."
      />
      {!user && !demo ? (
        <Empty
          title="Dein Tagebuch wartet auf dich."
          text="Melde dich an und nimm deine Sammlung auf alle Geräte mit."
          action={<Button onClick={login}>Anmelden</Button>}
        />
      ) : (
        <>
          <section className="panel">
            <h2>{demo ? "Lokale Demo" : user?.email}</h2>
            {user && (
              <form
                className="entry-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const { error } = await supabase!
                    .from("coffee_profiles")
                    .update({ display_name: name })
                    .eq("id", user.id);
                  setNotice(error ? error.message : "Profilname gespeichert.");
                }}
              >
                <label>
                  Profilname
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <Button type="submit" secondary>
                  Profil speichern
                </Button>
              </form>
            )}
            <Button secondary onClick={logout}>
              <LogOut size={17} />
              {demo ? "Demo verlassen und Daten löschen" : "Abmelden"}
            </Button>
          </section>
          <section className="panel">
            <h2>
              <Share2 size={20} /> Gezielte Freigaben
            </h2>
            <p className="muted">
              Eingeladene Personen sehen deine gesamte Sammlung inklusive Fotos
              und Bewertungen, können sie aber nicht bearbeiten. Sie benötigen
              bereits ein bestätigtes Konto.
            </p>
            {demo ? (
              <p>Freigaben sind mit einem angemeldeten Konto verfügbar.</p>
            ) : (
              <>
                <form
                  className="share-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const { error } = await supabase!.rpc("coffee_invite", {
                      p_email: email,
                    });
                    if (error) setNotice(error.message);
                    else {
                      setEmail("");
                      setNotice("Lesender Zugriff freigegeben.");
                      void load();
                    }
                  }}
                >
                  <input
                    type="email"
                    required
                    aria-label="E-Mail für die Freigabe"
                    placeholder="E-Mail-Adresse der Person"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button type="submit">Zugriff freigeben</Button>
                </form>
                {shares.map((s) => (
                  <div className="share-row" key={s.id}>
                    <span>{s.viewer_email}</span>
                    <button
                      onClick={async () => {
                        const { error } = await supabase!
                          .from("coffee_shares")
                          .delete()
                          .eq("id", s.id);
                        if (error) setNotice(error.message);
                        else void load();
                      }}
                    >
                      <X size={16} /> Widerrufen
                    </button>
                  </div>
                ))}
                <h3>Mit dir geteilt</h3>
                {received.length ? (
                  received.map((s) => (
                    <a
                      className="shared-link"
                      key={s.id}
                      href={"#/geteilt/" + s.owner_id}
                    >
                      {s.coffee_profiles?.display_name || "Kaffeeprofil"}{" "}
                      <ArrowUpRight size={16} />
                    </a>
                  ))
                ) : (
                  <p className="muted">
                    Hier erscheinen Profile, die für dich freigegeben wurden.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
      <section className="panel">
        <h2>Deine Kaffeebar für unterwegs</h2>
        <p>
          Installiere Kapselkompass auf deinem Startbildschirm. Eigene geladene
          Daten und neue Einträge sind auch offline verfügbar.
        </p>
        {install ? (
          <Button onClick={() => void install.prompt()}>
            App installieren
          </Button>
        ) : (
          <p className="muted">
            iPhone: In Safari „Teilen“ → „Zum Home-Bildschirm“. Android: Im
            Browsermenü „App installieren“.
          </p>
        )}
      </section>
    </>
  );
}
function Shared({
  owner,
  setNotice,
}: {
  owner: string;
  setNotice: (s: string) => void;
}) {
  const [rows, setRows] = useState<LocalRow[]>([]),
    [name, setName] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase || !navigator.onLine) {
        setRows([]);
        setLoading(false);
        return;
      }
      try {
        const [p, ...results] = await Promise.all([
          supabase
            .from("coffee_profiles")
            .select("display_name")
            .eq("id", owner)
            .maybeSingle(),
          ...(["capsules", "tastings", "photos"] as Kind[]).map((k) =>
            supabase!
              .from("coffee_" + k)
              .select("*")
              .eq("user_id", owner)
              .eq("deleted", false),
          ),
        ]);
        for (const r of [p, ...results]) if (r.error) throw r.error;
        if (alive) {
          setName((p.data as any)?.display_name || "Freigegebenes Profil");
          setRows(
            results.flatMap((r, i) =>
              ((r.data as any[]) || []).map((v) => ({
                ...v,
                kind: (["capsules", "tastings", "photos"] as Kind[])[i],
                baseVersion: v.version,
              })),
            ),
          );
        }
      } catch (e) {
        if (alive) {
          setRows([]);
          setNotice(message(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 15000);
    const clear = () => {
      if (!navigator.onLine) setRows([]);
      else void load();
    };
    window.addEventListener("offline", clear);
    window.addEventListener("online", clear);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("offline", clear);
      window.removeEventListener("online", clear);
    };
  }, [owner]);
  return (
    <>
      <PageTitle
        eyebrow="MIT DIR GETEILT · NUR LESEN"
        title={name || "Freigegebenes Profil"}
        text="Diese Inhalte sind nur online verfügbar und werden nicht für die Offline-Nutzung gespeichert."
      />
      {loading ? (
        <p>Profil wird geladen …</p>
      ) : rows.length ? (
        rows
          .filter((r) => r.kind === "capsules")
          .map((r) => (
            <section className="panel" key={r.id}>
              <p className="eyebrow">{asCapsule(r).brand}</p>
              <h2>
                {asCapsule(r).name}{" "}
                <span className="score">{fmt(average(rows, r.id))} / 10</span>
              </h2>
              <Photos
                rows={rows.filter(
                  (p) =>
                    p.kind === "photos" && (p.data as Photo).parent_id === r.id,
                )}
                shared
              />
              {rows
                .filter(
                  (t) =>
                    t.kind === "tastings" &&
                    (t.data as Tasting).capsule_id === r.id,
                )
                .map((t) => (
                  <TastingCard
                    key={t.id}
                    row={t}
                    photos={rows.filter(
                      (p) =>
                        p.kind === "photos" &&
                        (p.data as Photo).parent_id === t.id,
                    )}
                    shared
                  />
                ))}
            </section>
          ))
      ) : (
        <Empty
          title="Keine freigegebenen Inhalte verfügbar."
          text="Prüfe deine Verbindung und ob die Freigabe weiterhin besteht."
        />
      )}
    </>
  );
}
