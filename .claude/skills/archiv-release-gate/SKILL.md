---
name: archiv-release-gate
description: Orchestriert einen ausdruecklich gestarteten Archiv-Wiki-Release mit Versionsbasis, Nutzerfreigaben, Release Notes, CRX-, AppImage- und Update-Artefakt-Pruefungen.
argument-hint: "<Releaseumfang oder gewuenschte Zielversion>"
disable-model-invocation: true
user-invocable: true
---

# Archiv-Wiki Release Gate

Dieser Skill darf nur durch den Nutzer mit `/archiv-release-gate` gestartet
werden. `$ARGUMENTS` beschreibt Releaseumfang oder gewuenschte Zielversion,
ersetzt aber keine der vorgeschriebenen Pruefungen und Freigaben.

## 1. Kanonische Regeln laden

Lies vor jeder Releasehandlung vollstaendig:

- `${CLAUDE_PROJECT_DIR}/CLAUDE.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/README.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/00_PROJECT_STATUS.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/03_PROGRAMMING_RULES.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/04_RELEASE_WORKFLOW.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/05_DELIVERY_STANDARD.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/12_KNOWN_DECISIONS.md`
- `${CLAUDE_PROJECT_DIR}/AI_CONTEXT/16_WEB_CLIPPER.md`
- `${CLAUDE_PROJECT_DIR}/package.json`

`04_RELEASE_WORKFLOW.md` ist die einzige verbindliche Release-Prozedur. Dieser
Skill strukturiert sie, ersetzt oder verkuerzt sie aber nicht. Bei Widerspruch
gilt die kanonische Datei und der Release stoppt bis zur Klaerung.

## 2. Harte Vorbedingungen

Fuehre zuerst nur Read-only-Pruefungen aus:

- aktueller Projektpfad ist exakt `${CLAUDE_PROJECT_DIR}`,
- der Ordner ist ein vorhandenes Git-Repository,
- Working Tree, Branch, Remotes und Tags sind nachvollziehbar,
- der tatsaechlich zuletzt veroeffentlichte GitHub-Release und sein Commit
  sind eindeutig bestimmbar,
- lokale Tags, Remote-Tags und veroeffentlichte Releases widersprechen sich
  nicht,
- Releaseumfang enthaelt keine ungeklärten, privaten, temporaeren oder
  releasefremden Dateien.

Ist eine Vorbedingung nicht erfuellt: keine Reparatur improvisieren, nichts
initialisieren, nichts stagen und keine Historie veraendern. Konkreten Blocker
melden und stoppen.

## 3. Freigabe-Gates

Arbeite in getrennten, nachvollziehbaren Phasen. Ueberspringe kein Gate:

1. veroeffentlichte Ausgangsversion und Releaseumfang belegen,
2. begruendete SemVer-Zielversion vorschlagen,
3. ausdrueckliche Nutzerfreigabe der Zielversion abwarten,
4. Release Notes ausschliesslich aus Endnutzersicht entwerfen,
5. ausdrueckliche Nutzerfreigabe der Release Notes abwarten,
6. identische freigegebene Fassung fuer In-App und GitHub verwenden,
7. erst danach die in `04_RELEASE_WORKFLOW.md` erlaubten lokalen Release-
   Schritte ausfuehren,
8. vor Push und vor endgueltiger Veroeffentlichung erneut die jeweils
   geforderte Nutzerfreigabe abwarten.

Eine Skill-Ausfuehrung ist keine pauschale Erlaubnis fuer Git-/GitHub-
Schreibaktionen. Es gelten weiterhin alle expliziten Stopps und Freigaben aus
`CLAUDE.md` und `04_RELEASE_WORKFLOW.md`.

## 4. Releaseumfang und Release Notes

- Ausgangsbasis ist der tatsaechlich veroeffentlichte GitHub-Release, nicht
  die hoechste lokale Versionsnummer oder ein Dateiname.
- Nur Aenderungen seit diesem veroeffentlichten Commit duerfen in den Umfang.
- Interne Zwischenfehler und nie veroeffentlichte Regressionen nicht als
  Endnutzer-Bugfix nennen.
- Vorgeschriebene Kategorien, Reihenfolge und Wortlautregeln aus
  `04_RELEASE_WORKFLOW.md` unveraendert anwenden.
- In-App- und GitHub-Release-Notes muessen inhaltlich identisch sein.

## 5. Staging, Version und Tags

- Nie pauschal den gesamten Working Tree stagen.
- Nur einzeln benannte und vom Nutzer freigegebene Pfade aufnehmen.
- Keine Branches neu anlegen, Tags ueberschreiben, Force-Aktionen ausfuehren
  oder Git-Historie umschreiben.
- Nie `git push ... --tags`; nur `main` und den neu erzeugten, bestaetigten
  Release-Tag nach dem vorgesehenen Gate pushen.
- Token und Zugangsdaten nie in Remote-URLs, Dateien, Logs oder Berichte
  schreiben.

## 6. Build- und Artefakt-Gate

Vor jedem Releaseabschluss:

1. vorgeschriebene Syntax- und Funktionstests ausfuehren,
2. automatische CRX-Verifikation erfolgreich abschliessen,
3. finales AppImage mit der bestaetigten Zielversion bauen,
4. genau dieses Zielversions-AppImage real testen,
5. `latest-linux.yml` gegen Version, Dateiname, Groesse und Integritaetswerte
   des finalen AppImage pruefen,
6. signierte Chromium-ID, erwartete Web-Clipper-Version und Paketressource
   gemaess den kanonischen Dateien pruefen,
7. private Signierschluessel sicher ausschliessen,
8. finalen Git-Status, Tag, Artefakte und beide Release-Notes-Fassungen erneut
   abgleichen.

Ein aelterer Testbuild ersetzt niemals den Test des finalen Zielversions-
Artefakts. Ein erfolgreicher Upload ersetzt keine Artefaktpruefung.

## 7. Codex-Gegenpruefung

Plane bei einem Release eine unabhaengige Read-only-Gegenpruefung nach Claudes
lokaler Finalpruefung und vor Push beziehungsweise Veroeffentlichung ein.

- Verwende den im Steuerungsauftrag bestimmten Codex-Befehl; bei
  releasekritischem Gesamtcheck ist `/codex:adversarial-review` passend.
- Codex prueft Scope, Version, Notes, Tags, CRX, AppImage,
  `latest-linux.yml`, ungeklärte Dateien und Stop-Gates.
- Codex darf nichts aendern, stagen, taggen, pushen oder veroeffentlichen.
- Ist Codex nicht verfuegbar, offen melden und keine unabhaengige Pruefung
  behaupten.

## 8. GitHub-Entwurf und manuelle Veroeffentlichung

- Nur den in `04_RELEASE_WORKFLOW.md` vorgesehenen GitHub-Release-Entwurf
  erstellen.
- Hochgeladene Artefakte und Notes nach dem Upload erneut gegen den
  freigegebenen lokalen Zustand pruefen.
- Endgueltige Veroeffentlichung bleibt eine ausdrueckliche Nutzerentscheidung
  und der dort dokumentierte manuelle letzte Schritt.

## 9. Abschlussbericht

Berichte phasenbezogen und ohne Zugangsdaten:

1. veroeffentlichte Ausgangsbasis und belegter Releaseumfang,
2. bestaetigte Zielversion,
3. bestaetigte Release Notes und identische In-App-/GitHub-Fassung,
4. gezielt aufgenommene Dateien,
5. Tests und Ergebnisse,
6. CRX-, AppImage- und `latest-linux.yml`-Nachweise,
7. Codex-Ergebnis oder klar benannte Verifikationsgrenze,
8. Git-, Tag-, Push- und GitHub-Status,
9. noch ausstehende Nutzerfreigabe oder manueller Schritt,
10. Blocker, Unsicherheiten und Bestaetigung, dass nichts ausserhalb des
    freigegebenen Releaseumfangs veraendert wurde.

Nach jedem Gate nur bis zum naechsten erlaubten Schritt weiterarbeiten. Bei
fehlender Freigabe oder ungeklärtem Zustand stoppen.
