# ☕ Kapselkompass

Dein persönliches Kaffeetagebuch als deutschsprachige PWA. React + TypeScript + Vite, Supabase Auth/Postgres/Storage, GitHub Pages.

## Korrektur v3.0.4: Barcode-Suche mit zusätzlichen Quellen

Die Suche prüft zuerst die eigene Sammlung und danach einen kleinen, mitgelieferten Kapselkatalog. Dieser enthält vier anhand der Hersteller-Verkaufsunterlagen geprüfte Mövenpick-Verbraucherpackungen: Crema Lungo (4006581061030), Classico Lungo (4006581061047), Der Himmlische Lungo (4006581061054) und Gusto Italiano Lungo (4006581061078), jeweils 10 Kapseln für Original. Versandkarton-EANs werden nicht als 10er-Packungen erkannt. Der Katalog ist auch offline verfügbar; die Produktangaben bleiben vor dem Speichern prüfbar. Preise und Intensität werden nicht aus widersprüchlichen älteren Produktangaben geschätzt.

Für weitere Barcodes fragt die authentifizierte Edge Function Open Food Facts und bei einem fehlenden Treffer oder Ausfall zusätzlich UPCitemdb ab. Es werden nur der Barcode und ein App-User-Agent an die Produktanbieter gesendet, keine Kontodaten, Bewertungen oder Bilder. UPCitemdb verwendet den kostenlosen, schlüssellosen Endpoint mit derzeit 100 Anfragen pro Tag und 6 pro Minute pro IP; es wird kein kostenpflichtiges Abo eingerichtet. Die bestehende tägliche Nutzerquote bleibt erhalten. Jede Quelle hat ein Zeitlimit von 8 Sekunden und ein Antwortlimit von 500 KB. Ein Treffer benötigt einen Produktnamen; UPCitemdb-Treffer müssen zusätzlich genau zur normalisierten EAN/UPC passen.

Fehlende Einträge werden von Ausfällen und Anbieterlimits unterschieden. Leere Produktantworten erscheinen nicht länger als angebliche Treffer. Bei einem fehlenden Ergebnis bleiben manuelle Erfassung, Zuordnung zu einer vorhandenen Sorte und eine ausdrücklich angeklickte Websuche möglich. Frühere Suchantworten können eine inzwischen geänderte Barcode-Eingabe nicht mehr überschreiben. Es gibt weiterhin keine vollständige Abdeckung aller Kapselmarken.

Quellen: [Mövenpick-Herstellerangaben](https://professional.darboven.com/de-de/produkte/marken/moevenpick/einzelhandels-sortiment), EAN-Zuordnungen aus dem Mövenpick-Verkaufsblatt „Enjoy Best Taste“ (2024, Kapseln, Feld EAN Code CU), [zusätzliche Bestätigung für die gemeldete Crema-Lungo-EAN](https://www.lebensmittel-sonderposten.de/produkte/kaffee-kakao-tee/kaffee-kapseln/19737/moevenpick-kapseln-nespresso-crema-lungo-10er-57g-mhd-30.11.25), [UPCitemdb-Free-Limits](https://www.upcitemdb.com/wp/docs/main/development/plan/).

## Korrektur v3.0.3: Fotos, Skalen und App-Aktualisierung

Ausgewählte Fotos werden sofort aus Kamera/Galerie in unabhängige Dateibytes eingelesen. Bis das abgeschlossen ist, bleibt Speichern gesperrt. Der bestehende binäre Upload und die Wiederherstellung ausstehender Fotos bleiben erhalten. Nach einem Fotoersatz unter derselben Datensatz-ID lädt die Vorschau neu; fehlgeschlagene Anzeigen lassen sich erneut laden.

Jede Bewertungsskala nennt ihre Bedeutung ausdrücklich mit „1: …“ und „10: …“ über den Zahlen. Die Auswahl steht separat darunter als „Ausgewählt: … von 10“. Dadurch bleiben die Endpunkte auch bei zwei Zahlenreihen auf dem Handy eindeutig.

Unter Profil steht die tatsächlich geladene App-Version samt Update-Prüfung. Verfügbare Updates lassen sich über „Jetzt aktualisieren“ aktivieren; geöffnete Erfassungsdialoge müssen zuerst gespeichert oder geschlossen werden. Frühe Update-Meldungen bleiben bis zum Aufbau der Oberfläche erhalten. Beim Zurückkehren in die App und beim Wiederverbinden wird auf Updates geprüft. IndexedDB und ausstehende Uploads werden beim Update nicht gelöscht.

Der mobile Browsercheck prüft den gesamten Fotoablauf von der Dateiauswahl bis zu übertragenen Bytes, bestätigten Metadaten und einer dekodierten Vorschau mit simuliertem Backend. `node scripts/pwa-update-smoke.mjs` prüft nach `npm run build` einen echten Service-Worker-Wechsel einschließlich Neuladen und erhaltener ausstehender Fotobytes. Beide Browserprüfungen laufen in Chromium; ein erneuter Versuch auf dem betroffenen iPhone ist zusätzlich nötig.

## Funktionen

- Private Sammlung mit Fotos, Marken, Kapselsystemen, Favoriten und Suche
- EAN-/UPC-Erkennung per Kamera, Barcodefoto oder Zifferneingabe; eigene Zuordnungen offline und externe Suche über Open Food Facts
- Fotoerkennung von Verpackungen und beschrifteten losen Kapseln über OpenRouter, immer mit Prüfung vor Übernahme
- Produktimporte von Nespresso Deutschland und KaffeK; Kauflink und Preisstand bleiben erhalten
- Privater oder gemeinsamer Haushaltsbestand mit Anfangsbestand, Packungseinkäufen, Verbrauch, Korrekturen und einstellbarer Nachkaufwarnung
- Haushalte mit eigenen Logins, angenommenen Einladungen, persönlichen Favoriten und fair gewichteten Haushaltsnoten
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
2. `supabase/schema.sql`, danach `supabase/extension.sql` und `supabase/households.sql` jeweils einmal im SQL Editor des neuen Projekts ausführen. Das Schema verwendet ausschließlich `coffee_*`-Tabellen, ein internes `coffee_private`-Schema und den privaten Bucket `coffee-photos`.
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

Eigene Offline-Bestände sind vorläufig. Stabile Vorgangs-IDs und versionierte Verkostungen vermeiden doppelte Abbuchungen. Nach Bestätigung einer Verkostung werden deren Ledger-Einträge in derselben lokalen Transaktion übernommen, damit ein anschließender Netzabbruch nicht zu einer falschen lokalen Menge führt. Die Synchronisierung lädt wachsende Bestandsverläufe seitenweise. Private Bestands- und Einkaufsdaten sind nur für den Besitzer lesbar; Haushaltsbestände für die aktuellen Mitglieder. Gewöhnliche Profilfreigaben enthalten ausschließlich private Bewertungen ohne Verbrauchsangaben und niemals Haushaltsdaten.

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


## Erweiterung v3: Haushalte

Unter **Haushalte** kann ein angemeldeter Nutzer einen oder mehrere Haushalte anlegen. Jede Person behält ihr eigenes Login. Oben in der App lässt sich zwischen **Mein privater Bereich** und einem Haushalt wechseln. Die gemeinsame Sammlung führt jede Sorte einmal je Haushalt; alle Mitglieder können Produktangaben ergänzen, Einkäufe und Korrekturen buchen und Verbrauch bei einer eigenen Verkostung ausdrücklich bestätigen. Gemeinsame Sorten werden in der Oberfläche nicht gelöscht, damit niemand die Bewertungen anderer entfernt.

Die Haushaltsverwaltung lädt andere bereits registrierte Personen über ihre bestätigte E-Mail-Adresse ein. Einladungen erscheinen in der App und müssen angenommen werden; es werden keine E-Mails versendet. Nur die Verwaltung darf Mitglieder entfernen, Einladungen zurückziehen oder den Haushalt umbenennen. Sie kann die Verwaltung an ein bestehendes Mitglied übertragen; vor einem eigenen Austritt ist dies erforderlich. Ein Haushalt bleibt mindestens unter der Verwaltung einer Person erhalten.

Bewertungen, Fotos zu Bewertungen und Favoriten bleiben ihrem Autor zugeordnet. Andere Mitglieder können die Bewertungen lesen, aber nicht bearbeiten oder löschen. Favoriten werden pro Person und Haushaltsprodukt separat gespeichert. Die Sammlung und der Sortenvergleich lassen sich zwischen **Haushaltsnoten** und **Meine Noten** umschalten. Für jede Skala wird zuerst der Durchschnitt einer Person je Sorte berechnet und anschließend der Durchschnitt dieser persönlichen Werte: Zehn Bewertungen mit persönlichem Mittelwert 8 und eine andere Person mit 6 ergeben 7. Die Haushaltsnote in Karten und Vergleich berücksichtigt aktuelle Mitglieder; historische Beiträge ehemaliger Mitglieder bleiben im Verlauf und können in der Detailauswertung ausdrücklich einbezogen werden. Die Detailauswertung zeigt Teilnehmerzahl, Zahl der Verkostungen, persönliche Werte, die Spannweite und Filter nach Zubereitung. Beim Wiederkaufen zählt nur die neueste Entscheidung je Person in der gewählten Auswahl. Der Übersichts-Wert ist im Haushaltsbereich der Durchschnitt der bewerteten Sortennoten, nicht die Summe aller Einzelverkostungen.

Private Daten werden durch Beitritt oder Einladung nicht automatisch geteilt. Unter **Private Sorte in einen Haushalt übernehmen** wird die gewünschte Sorte ausdrücklich ausgewählt. Es kann eine neue Haushaltsorte angelegt oder eine passende vorhandene Sorte ausgewählt werden. Gleiche Barcodes werden innerhalb einer Sammlung abgefangen; beim Zusammenführen muss der Zielkaffee ausdrücklich gewählt werden. Eine Momentaufnahme der eigenen Bewertungen und Fotos wird in den Haushalt kopiert. Dabei bleibt die private Bewertung erhalten; spätere Bearbeitungen synchronisieren sich nicht zwischen den beiden Bereichen. Die Kopien werden mit Verbrauch 0 angelegt, damit die ursprünglichen Verkostungen nicht nochmals vom gemeinsamen Bestand abgezogen werden.

Die optionale Bestandsübernahme bucht den aktuell am Server vorhandenen privaten Vorrat als Korrektur ab und als Zugang im Haushalt ein. Anfangsbestand, vorhandene Verbrauchsbuchungen und bereits gezählte Haushaltsmengen werden nicht summiert oder neu interpretiert. Ist kein privater Anfangsbestand erfasst, wird keine Menge angenommen. Negative private Bestände müssen vor der Übernahme korrigiert werden. Die gesamte Übernahme ist atomar und pro privater Sorte und Zielhaushalt einmalig; eine Wiederholung nach Verbindungsabbruch gibt das bestehende Ergebnis zurück. Bereits synchronisierte Daten sind Voraussetzung. Die Importzuordnung und stabile Vorgangs-IDs verhindern doppelte Mengen und Bewertungskopien.

Haushaltsbewertungen und Bestandsbuchungen bleiben beim Austritt oder Entfernen als attribuierte Historie im Haushalt erhalten. Der Server prüft die aktuelle Mitgliedschaft bei jedem Zugriff, unabhängig vom Alter des JWT. Bei der nächsten Online-Synchronisierung werden lokal zwischengespeicherte Daten und ausstehende Änderungen entzogener Haushalte vor weiteren Uploads entfernt. Geräte ohne Verbindung können bereits geladene Inhalte bis dahin weiterhin anzeigen; heruntergeladene Informationen lassen sich nicht rückwirkend zurückholen. Haushaltsverwaltung und Übernahmen benötigen Internet. Neue Bewertungen, Bestandsbuchungen und eigene Fotos im gewählten Haushalt bleiben offline erfassbar; die Anzeige ist bis zur Synchronisierung vorläufig. Die aktive App synchronisiert beim Wiederverbinden und alle 30 Sekunden sowie über den manuellen Synchronisieren-Knopf.

Der Offline-Cache verwendet ab v3 Kontoschlüssel plus Datensatz-ID. Bestehende private v1/v2-Einträge werden beim IndexedDB-Upgrade übernommen. Getrennte Konten können dieselben Haushaltsdaten auf demselben Gerät getrennt zwischenspeichern; Abmelden löscht nur die Daten dieses Kontos. Ein Synchronisierungslauf hält die auslösende Identität fest, damit ein Kontowechsel während eines Uploads keine Daten unter dem anderen Konto anlegt. Nach dem Update gegebenenfalls alle alten App-/Browserfenster schließen, damit der lokale Datenbankwechsel abgeschlossen werden kann.

### Technische Einführung

Bestehende v2-Projekte wenden `supabase/households.sql` einmalig an; frische Projekte zuerst das Basis- und Erweiterungsschema. Die Migration ergänzt `household_id` an den bestehenden Datensätzen, Mitgliedschaften, angenommene Einladungen und persönliche Produktpräferenzen. `user_id` bleibt Autor bzw. Buchungsakteur. Private Datensätze behalten `household_id = null`; es erfolgt keine automatische Umschreibung bestehender Daten. Die bisherigen Bestandsbuchungen bleiben unveränderlich. Im produktiven Projekt wurde die Migration als `coffee_household_scopes` angewandt.

RLS trennt persönliche Bereiche, Haushalte und gewöhnliche Profilfreigaben. Mitgliedschaftsverwaltung und Übernahme laufen über autorisierte RPCs mit eng begrenzten internen Funktionen; privilegierte Funktionen befinden sich ausschließlich in `coffee_private`. Fotos nach einer Übernahme können in beiden Bereichen auf dieselben hochgeladenen Bytes verweisen. Deren Löschung wird am Server erst erlaubt, wenn kein aktiver Fotodatensatz mehr auf die Datei zeigt, auch wenn eine solche Referenz für den Uploader nach einem Austritt nicht mehr sichtbar ist.

Die Tests prüfen mehrere Nutzer und Haushalte, bestätigte Einladungen, fremde Autorenrechte, persönliche Favoriten, identische Barcodes in verschiedenen Bereichen, gemeinsam gebuchten Verbrauch, Widerruf von Daten- und Fotozugriffen, Verwaltungstransfer, atomare und wiederholbare Übernahmen, die Migration des vorhandenen Offline-Caches sowie gleich gewichtete Haushaltsnoten. Ein manueller Test mit echten Konten auf iPhone/Android steht zusätzlich zur automatisierten Abnahme an.


## Korrektur v3.0.1: mobile Tagebucheinträge und iPhone-Fotoupload

Lange Notizen, Links, Sortennamen und Tags umbrechen innerhalb ihrer Karten. Formulare verwenden auf schmalen Geräten eine Spalte und die Bewertungsskalen fünf Schaltflächen je Zeile. Horizontales Scrollen ist nur innerhalb der Vergleichstabelle beziehungsweise Fotoleiste vorgesehen. Browserprüfungen decken 320, 375, 390, 430 und 768 Pixel ab.

Safari kann beim Hochladen eines aus IndexedDB wiederhergestellten Fotos einen leeren Multipart-Request senden. Neue Fotos werden vor dem Speichern als konkrete Dateibytes eingelesen. Auch bereits vorgemerkte Fotos werden vor dem Upload eingelesen und als binärer Request mit explizitem Bildtyp übertragen; der Storage-Client erzeugt dafür kein FormData. Leere oder nicht mehr lesbare Dateien werden vor dem Netzwerkaufruf abgefangen und bleiben als ausstehender Eintrag erhalten. **Foto erneut auswählen** ersetzt ausschließlich die vorgemerkte Bilddatei unter derselben Datensatz-ID und demselben Speicherpfad. Tagebucheinträge und andere lokale Daten werden dabei nicht gelöscht.

Der zusätzliche Browsercheck verwendet einen lokalen Testserver und vollständig simulierte Backend-Antworten; es werden keine echten Konten, Bewertungen oder Bilder geschrieben:

```sh
npm run dev -- --mode production --host 127.0.0.1 --port 5173
# In einem weiteren Terminal, mit lokal installiertem Chromium:
npm run test:mobile
```

Über `CHROMIUM_PATH` lässt sich der Browserpfad ändern, über `APP_URL` die Serveradresse. Der Check prüft private und gemeinsame Tagebucheinträge, das Bewertungsformular und die Haushaltsverwaltung sowie den realen SDK-Request eines vorgemerkten PNG-Fotos. Die automatische Browserprüfung verwendet Chromium; ein erneuter Upload auf dem betroffenen iPhone bestätigt zusätzlich das Verhalten im echten Safari.


## Korrektur v3.0.2: feste mobile Ansicht

Die mobile Oberfläche bleibt auf der vorgesehenen Gerätebreite. Der Viewport begrenzt Touch-Zoom; zusätzlich verhindern nicht-passive WebKit-Gestenhandler und Multitouch-Handler Pinch-Zoom in der Touch-Ansicht. Normales Ein-Finger-Scrollen bleibt erlaubt. Es gibt keine Handler, die Desktop-Tastaturkürzel oder die Vergrößerung durch Betriebssystemfunktionen abfangen.

Alle nativen Textfelder, Auswahllisten und Textbereiche verwenden auf schmalen beziehungsweise Touch-Geräten mindestens 16px Schrift, einschließlich Suche, Filter, Profil, Haushaltsverwaltung und Zubereitungsfilter. Dadurch wird der automatische Safari-Fokuszoom vermieden. Lange Vergleichsfilter umbrechen innerhalb ihrer Schaltflächen; Such- und Filterfelder erhalten eigene begrenzte Grid-Spalten. Der Dokumentbereich kann weder horizontal scrollen noch seitlich überschwingen. Vergleichstabellen und Fotoleisten behalten ihre eigene horizontale Scrollfläche. Die installierte App berücksichtigt sichere Displayränder.

`npm run test:mobile` deckt zusätzlich Startseite, neue Kapseln, Barcode-/Foto-/Shop-Erfassung, Sammlung mit Filtern, ausgewählten Vergleich, Profil und Haushalte ab. Die Prüfung kontrolliert Feldgrößen und -positionen, sichtbare Seitenbreite, horizontale Dokumentverschiebung, die unveränderte Zoomstufe sowie Pinch-Gesten und weiterhin mögliches vertikales beziehungsweise inneres Tabellen-Scrollen. Sie läuft in Chromium; die echte Safari-Ansicht sollte nach dem Update auf dem betroffenen Gerät erneut geprüft werden.
