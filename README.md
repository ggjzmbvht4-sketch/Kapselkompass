# ☕ Kapselkompass

Dein persönliches Kaffeetagebuch als deutschsprachige PWA. React + TypeScript + Vite, Supabase Auth/Postgres/Storage, GitHub Pages.

## Funktionen

- Private Sammlung mit Fotos, Marken, Kapselsystemen, Favoriten und Suche
- Beliebig viele Verkostungen pro Sorte: sechs getrennte Skalen von 1–10, Zubereitung, Datum, Geschmackstags, Notizen und Wiederkaufentscheidung
- Durchschnittswerte und Vergleich von bis zu drei Sorten
- Eigene Daten offline lesen, neue Einträge und Fotos vormerken, beim Öffnen oder Wiederverbinden synchronisieren
- Versionierte Konflikterkennung statt stiller Überschreibung; idempotente Übertragung nach Verbindungsabbrüchen
- Lesende Profilfreigaben an die exakte E-Mail eines bestätigten registrierten Kontos, jederzeit widerrufbar
- Installierbare Oberfläche und lokaler Demo-Modus, klar von echten Konten getrennt

## Lokal starten

Node 24 und npm verwenden:

```sh
npm ci
cp .env.example .env.local
# Die beiden öffentlich verwendbaren Supabase-Werte in .env.local eintragen.
npm run dev
```

Die App liegt unter `/Kapselkompass/`. Ohne Konfiguration lässt sich die Oberfläche mit der lokalen Demo ausprobieren. Der Demo-Modus speichert ausschließlich auf dem Gerät. Niemals einen `service_role`- oder Secret-Key in Browser-Variablen eintragen.

```sh
npm test
npm run build
```

Die Datenbanktests führen das echte Schema in isoliertem WASM-Postgres (PGlite) mit nachgebildeten Supabase Auth-/Storage-Systemtabellen aus. Sie prüfen RLS, Freigaben, Bildzugriffe, Skalengrenzen, Fremdschlüssel, Versionskonflikte und Wiederholbarkeit. Sie ersetzen keinen Gerätetest des gehosteten Supabase-Storage-Dienstes.

## Supabase einrichten

1. Eigenes EU-Projekt anlegen. Bei Erreichen des Free-Projektlimits muss zunächst ein Platz frei sein oder der Tarif angepasst werden.
2. `supabase/schema.sql` einmal im SQL Editor des neuen Projekts ausführen. Das Schema verwendet ausschließlich `coffee_*`-Tabellen, ein internes `coffee_private`-Schema und den privaten Bucket `coffee-photos`.
3. Auth → URL Configuration: Site URL `https://ggjzmbvht4-sketch.github.io/Kapselkompass/`; dieselbe URL und für die Entwicklung `http://localhost:5173/Kapselkompass/` als erlaubte Redirects eintragen. E-Mail-Bestätigung aktiv lassen.
4. Für echte Nutzer einen eigenen SMTP-Anbieter in Supabase konfigurieren. Der integrierte Testversand ist beschränkt und kann externe Empfänger ablehnen.
5. Die öffentlichen Projektwerte stehen bereits in `.env.production`. Der Publishable Key ist für Browserzugriffe bestimmt und kein Geheimnis; RLS schützt die Inhalte. Für lokale Entwicklung die Werte in `.env.local` übernehmen. GitHub-Variablen sind nicht erforderlich.
6. Workflow erneut starten. Zwei echte Testkonten anlegen, E-Mails bestätigen, einen Kaffee mit Foto erfassen, gegenseitige Freigabe und Widerruf testen.

Das versionierte SQL ist die Quelle für die initiale Einrichtung. Sobald eine lokale Supabase-CLI zur Verfügung steht, mit `supabase migration new initial_coffee_schema` eine Migration erzeugen und den SQL-Inhalt übernehmen. Hier konnte die CLI wegen ihres schreibgeschützten Konfigurationsverzeichnisses nicht initialisiert werden.

## GitHub Pages

Unter Settings → Pages als Quelle **GitHub Actions** aktivieren. Der Workflow prüft Tests und Produktionsbuild vor der Veröffentlichung. Hash-Routing unterstützt direkte Unterseitenaufrufe. Der Basispfad ist `/Kapselkompass/`; bei einem anderen Repositorynamen muss er in `vite.config.ts` angepasst werden.

## Offline und Datenschutz

- IndexedDB enthält nur eigene Datensätze, lokale Änderungen und eigene heruntergeladene Fotos. Der Service Worker speichert nur die App-Dateien, keine Supabase-API-Antworten oder freigegebenen Fotos.
- Freigegebene Inhalte werden ausschließlich im Arbeitsspeicher gehalten und bei bestehender Verbindung alle 15 Sekunden neu geprüft. Widerruf beendet zukünftige Zugriffe; bereits betrachtete oder heruntergeladene Inhalte können nicht zurückgeholt werden.
- Offline-Synchronisierung läuft bei aktiver App, beim Wiederverbinden und mindestens alle 30 Sekunden. Keine Zusage einer Hintergrundübertragung bei geschlossener App.
- Abmelden entfernt lokale Nutzerdaten. Bei ausstehenden Übertragungen muss deren Verwerfen bestätigt werden. Browser können lokale Daten bei Speichermangel entfernen: Als dauerhaft gesichert gelten erst erfolgreich übertragene Einträge.
- Löschungen verwenden versionierte Tombstones, damit alte Geräte keine gelöschten Inhalte wiederherstellen. Gelöschte Fotoobjekte werden bei der Synchronisierung aus Storage entfernt; Datenbank-Tombstones bleiben als Synchronisierungsmarkierungen erhalten.
- Fotoformate JPEG/PNG/WebP, höchstens 10 MB pro Datei. Die Fotos werden unverändert hochgeladen; gegebenenfalls enthaltene EXIF-Metadaten bleiben erhalten.

## Manuelle Abnahme vor dem produktiven Einsatz

- iPhone/Safari und Android/Chrome: Installation, Navigation, Kamera/Galerie, Schriftgröße und Tastatur
- Flugmodus: neue Sorte, Verkostung und Foto, App neu öffnen, Verbindung wiederherstellen, Duplikate ausschließen
- Zwei Geräte: denselben Eintrag bearbeiten, Konflikt auflösen
- Zwei Konten: komplette Isolation, Lesefreigabe, Schreibverbot, Widerruf einschließlich Fotozugriff
- Registrierung, Bestätigung und Passwortreset mit konfiguriertem SMTP und echten Redirect-URLs

## Struktur

`src/App.tsx`: Oberfläche und Formulare · `src/store.ts`: IndexedDB, Warteschlange und Synchronisierung · `src/domain.ts`: Fachtypen und Berechnungen · `supabase/schema.sql`: Datenbank, RPCs, RLS und Storage-Policies.

## Aktuelles Backend

Projekt `izeljoxjipzfdwuqzrqv` in Frankfurt; das initiale Schema ist als `initial_coffee_schema` auf dem gehosteten Projekt angewandt. Auth-Redirects und SMTP müssen in den Supabase-Auth-Einstellungen konfiguriert sein.
