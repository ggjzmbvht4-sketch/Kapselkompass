# ☕ Kapselkompass

Dein persönliches Kaffeetagebuch als deutschsprachige PWA. React + TypeScript + Vite, Supabase Auth/Postgres/Storage, GitHub Pages.

## Funktionen

- Private Sammlung mit Fotos, Marken, Kapselsystemen, Favoriten und Suche
- EAN-/UPC-Erkennung per Kamera, Barcodefoto oder Zifferneingabe; eigene Zuordnungen offline und externe Suche über Open Food Facts
- Fotoerkennung von Verpackungen und beschrifteten losen Kapseln über OpenRouter, immer mit Prüfung vor Übernahme
- Produktimporte von Nespresso Deutschland und KaffeK; Kauflink und Preisstand bleiben erhalten
- Privater Kapselbestand mit Anfangsbestand, Packungseinkäufen, Verbrauch, Korrekturen und einstellbarer Nachkaufwarnung
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
2. `supabase/schema.sql`, danach `supabase/extension.sql` jeweils einmal im SQL Editor des neuen Projekts ausführen. Das Schema verwendet ausschließlich `coffee_*`-Tabellen, ein internes `coffee_private`-Schema und den privaten Bucket `coffee-photos`.
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


## Erweiterung v2: Bedienung und Datenfluss

Unter **Kaffee hinzufügen** stehen Manuell, Barcode, Foto erkennen und Shop-Link zur Wahl. Externe Ergebnisse sind Vorschläge und überschreiben gespeicherte Sorten nicht automatisch. Ein eigener Barcode-Treffer öffnet die vorhandene Sorte; dort lässt sich ein Einkauf buchen. Unbekannte Codes lassen sich manuell zuordnen. Unterstützt werden EAN-8, EAN-13 und UPC-A; UPC wird intern auf EAN-13 normalisiert. Barcodes sind innerhalb einer privaten Sammlung eindeutig.

Die externe Barcode-Suche verwendet [Open Food Facts](https://world.openfoodfacts.org/) unter der [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Herkunft und Produktlink werden mit übernommen. Die Abdeckung ist unvollständig; fehlende Produkte und Kapselsysteme müssen manuell ergänzt werden. Es werden keine Produktdaten an Open Food Facts zurückgeschrieben und keine fremden Produktbilder automatisch übernommen.

Shop-Importe unterstützen `https://kaffek.de/…` und deutsche `https://www.nespresso.com/de/…`-Produktseiten. Importiert werden verfügbare JSON-LD-Daten und KaffeK-Produktattribute. Ein blockierter Abruf oder fehlende Metadaten führt zur manuellen Ergänzung. Nicht eindeutig zuordenbare Verkaufseinheiten werden nicht automatisch in Kapselpreise umgerechnet. Shop-Anmeldung, Bestellimport, automatische Käufe und laufende Preisüberwachung sind nicht enthalten.

Auf der Detailseite einer Sorte wird der Bestand ausdrücklich über den Anfangsbestand aktiviert. Bisherige Verkostungen ohne Verbrauchsbuchung werden nicht nachträglich abgezogen. Jede neue Verkostung verlangt eine ausdrückliche Verbrauchsentscheidung. Änderungen und Löschungen korrigieren den gebuchten Verbrauch atomar durch Gegenbuchungen. Die Buchungshistorie ist unveränderlich; Fehler werden durch weitere Korrekturbuchungen ausgeglichen. Bei zwei offline eingerichteten Anfangsbeständen wird der zweite vom Server abgelehnt; die unbestätigte lokale Buchung kann verworfen werden. Negative Bestände bleiben als **Bestand prüfen** sichtbar.

Eigene Offline-Bestände sind vorläufig. Stabile Vorgangs-IDs und versionierte Verkostungen vermeiden doppelte Abbuchungen. Nach Bestätigung einer Verkostung werden deren Ledger-Einträge in derselben lokalen Transaktion übernommen, damit ein anschließender Netzabbruch nicht zu einer falschen lokalen Menge führt. Die Synchronisierung lädt wachsende Bestandsverläufe seitenweise. Bestands- und Einkaufsdaten sind nur für den Besitzer lesbar. Freigegebene Bewertungen werden über einen eigens autorisierten RPC ohne Verbrauchsangaben ausgegeben.

## OpenRouter sicher aktivieren

Die Edge Function `coffee-discover` ist im Projekt bereitgestellt. Barcode und Shop-Import benötigen keinen KI-Schlüssel. Fotoerkennung bleibt bis zur vollständigen Einrichtung abgeschaltet:

1. In [OpenRouter](https://openrouter.ai/settings/keys) einen eigenen App-Schlüssel mit einem selbst gewählten Kostenlimit anlegen. Das App-Anfragelimit ist kein Euro-Budget.
2. Unter [Supabase → Edge Functions → Secrets](https://supabase.com/dashboard/project/izeljoxjipzfdwuqzrqv/functions/secrets) `OPENROUTER_API_KEY` als Secret hinterlegen. Den Schlüssel niemals in Browserkonfiguration, GitHub oder Chat schreiben.
3. Erst nach Einrichtung des Kostenlimits das Secret `COFFEE_AI_ENABLED` auf `true` setzen. Ein erneutes Deployment ist nicht erforderlich. Mit `false` lässt sich die Funktion abschalten.
4. Optional `COFFEE_VISION_MODEL` setzen; Standard ist `google/gemini-2.5-flash-lite`. Ein Modellwechsel erfordert eine erneute Prüfung von Bildunterstützung, Kosten und Antwortformat.

Jede Fotoerkennung verlangt die ausdrückliche Bestätigung der Übertragung. Bilder werden im Browser als JPEG mit maximal 1024 Pixeln längster Kante neu gerendert und dadurch ohne EXIF-Metadaten übertragen. Erkennungsbilder werden nicht automatisch als Sammlungsfoto gespeichert. Ohne lesbare Merkmale darf die KI keine Identifikation allein anhand der Farbe behaupten. Die Anbindung überträgt maximal 100 eigene Sortennamen als Kandidaten, aber keine Bewertungen oder Bestandsdaten.

Das serverseitige Tageslimit beträgt 10 KI-Anfragen je bestätigtem Nutzerkonto und insgesamt 50 KI-Anfragen pro UTC-Tag. Für Barcode- und Shop-Suche gelten jeweils 100 pro Nutzer und 1000 pro App. Reservierungen erfolgen atomar, fehlgeschlagene externe Aufrufe zählen mit. Es erfolgen keine automatischen kostenpflichtigen Wiederholungen. Die API verwendet ausschließlich serverseitige Credentials und prüft die Anmeldung zusätzlich zur JWT-Prüfung am Gateway. Private Zähler sind nicht für App-Nutzer zugänglich.

## Schema- und Funktionsdeployment

Bestehende v1-Projekte wenden ausschließlich `supabase/extension.sql` einmalig an; neue Projekte zuerst das Basisschema. Im produktiven Projekt sind die Erweiterung als `coffee_discovery_and_inventory` und die explizite Zugriffsverweigerung für private Zähler als `coffee_discovery_quota_policy` angewandt. Der Code der Funktion liegt unter `supabase/functions/coffee-discover/`; `index.ts` und `core.ts` werden mit aktivierter JWT-Prüfung bereitgestellt. Tests prüfen zusätzlich die Begrenzung externer Abrufe, Weiterleitungen, KI-Zustimmung, Quoten und Antwortvalidierung.

Nach Veröffentlichung ist ein manueller Gerätetest für Kamera, Fotoauswahl und PWA-Offline-Nutzung auf iPhone und Android weiterhin erforderlich. Eine echte KI-Erkennung kann erst nach Aktivierung des OpenRouter-Schlüssels geprüft werden.
