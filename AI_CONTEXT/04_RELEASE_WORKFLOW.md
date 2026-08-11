# Archiv-Wiki – Verbindlicher Release-Workflow

Diese Datei ist die dauerhaft verbindliche Release-Vorschrift für Archiv-Wiki.

Bei jeder zukünftigen Anfrage wie:

- Tag beenden
- Fertig, Tag beenden
- Release
- Leg los

ist ausschließlich diese Vorschrift anzuwenden.

Der Trigger startet den Release-Abschlussworkflow, ist aber keine blinde Freigabe. Schutzprüfungen, notwendige Audits, Realtests und ausdrücklich vorgesehene Nutzerfreigaben bleiben verbindlich. Fehlt eine Voraussetzung oder ist ein Releasebestandteil unklar, wird der Ablauf gestoppt und der konkrete Klärungsbedarf gemeldet.

---

# Ablauf

Immer in dieser Reihenfolge:

1. Alle Entwicklungs-, Audit- und Realtest-Voraussetzungen abschließen.
2. Den tatsächlich auf GitHub veröffentlichten Ausgangsstand bestimmen.
3. Git-Status sowie lokale, Remote- und veröffentlichte Tag-Zuordnungen prüfen.
4. Den Releaseumfang anhand der Änderungen seit dem veröffentlichten Ausgangsstand kuratieren.
5. Ausschließlich ausdrücklich freigegebene Projektänderungen einzeln stagen, prüfen und committen.
6. Eine SemVer-Zielversion nach den Projektregeln vorschlagen und vom Nutzer bestätigen lassen.
7. Release Notes aus Endnutzersicht erstellen und vom Nutzer bestätigen lassen.
8. Den bestätigten Versionsschritt ausschließlich mit `npm version patch|minor|major` durchführen.
9. Einen finalen Build erzeugen, der bereits die neue Zielversion trägt.
10. Die automatische CRX-Verifikation erfolgreich abschließen.
11. Genau das finale Artefakt der Zielversion real testen.
12. Vor dem Push Git-Status, Version, Tag, Build-Artefakt und Release Notes erneut prüfen.
13. Erst nach ausdrücklicher Nutzerfreigabe Commit und Tag pushen.
14. Den GitHub-Release-Entwurf erstellen.
15. Entwurf, Release Notes und Release-Artefakte auf GitHub manuell prüfen.
16. Den Release erst nach ausdrücklicher Nutzerentscheidung endgültig veröffentlichen.

Die Release Notes bleiben ein zentraler Bestandteil, werden aber erst aus dem geklärten veröffentlichten Ausgangsstand und dem kuratierten Releaseumfang abgeleitet.

---

# Release Notes

Release Notes werden ausschließlich aus Sicht der Endnutzer geschrieben.

Sie beschreiben ausschließlich sichtbare Ergebnisse.

Nicht erlaubt:

- interne Entwicklungsschritte
- Refactorings
- AI_CONTEXT
- Dateinamen
- Klassen
- Funktionsnamen
- technische Begriffe
- interne Architektur
- Entwicklungsphasen
- Fehler, die nie veröffentlicht wurden

Die Sprache ist:

- einfach
- verständlich
- sachlich
- für normale Nutzer geeignet

---

# Reihenfolge der Kategorien

Immer in dieser Reihenfolge:

✨ NEU

🐛 BEHOBEN

📝 SONSTIGES

✅ GEMACHT

Leere Kategorien werden vollständig weggelassen.

Es wird niemals geschrieben:

- Keine Änderungen
- Keine Fehler
- Offen
- Noch zu tun

---

# Zuordnung

## ✨ NEU

Nur Funktionen oder Möglichkeiten,

die es in der zuletzt veröffentlichten Version nachweislich noch nicht gab.

---

## 🐛 BEHOBEN

Nur Fehler,

die Nutzer der zuletzt veröffentlichten Version tatsächlich erleben konnten.

Nicht aufnehmen:

Fehler,

die während derselben Entwicklung entstanden und vor der Veröffentlichung bereits wieder behoben wurden.

Diese erscheinen niemals in den Release Notes.

---

## 📝 SONSTIGES

Kleine Textänderungen.

Beschriftungen.

Hinweise.

Sonstige kleine Anpassungen ohne geändertes Verhalten.

---

## ✅ GEMACHT

Abgeschlossene Verbesserungen,

die keine neue Funktion darstellen.

Zum Beispiel:

- bessere Bedienung
- bessere Übersicht
- bessere Konsistenz
- optische Vereinheitlichungen
- Qualitätsverbesserungen

---

# Verbindliche Regel zur Versionsbasis

Vor jeder Erstellung der Release Notes muss geprüft werden:

1. Welche Version ist aktuell auf GitHub als letzte veröffentlichte Version vorhanden?

2. Welche Änderungen wurden seit genau dieser veröffentlichten Version tatsächlich umgesetzt?

Nur diese Änderungen dürfen in die Release Notes aufgenommen werden.

Bereits veröffentlichte Änderungen dürfen niemals erneut erscheinen.

Interne Entwicklungsarbeiten, Refactorings oder Fehler, die nie veröffentlicht wurden, dürfen niemals in den Release Notes erscheinen.

---

# Versionsentscheidung

Die KI ermittelt anhand dieser Regeln selbst eine begründete SemVer-Empfehlung. Bevor `npm version` ausgeführt wird, muss der Nutzer die vorgeschlagene Zielversion ausdrücklich bestätigen.

Regeln:

- Mindestens eine echte neue, für Endnutzer sichtbare Funktion:
  → `npm version minor`

- Ausschließlich Fehlerbehebungen und/oder Politur:
  → `npm version patch`

- Major:
  Nur wenn bestehendes Verhalten bewusst inkompatibel geändert wurde.

Nicht wegen:

- langer Entwicklungszeit
- vieler Commits
- Refactorings
- persönlicher Einschätzung

Kann die veröffentlichte Ausgangsversion oder der tatsächliche Releaseumfang nicht eindeutig bestimmt werden, wird keine Versionsnummer geraten. Der Release bleibt bis zur Klärung gestoppt.

---

# Web-Clipper-Prüfung und Paketressource

Die Archiv-Wiki-App und der Web Clipper besitzen getrennte Versionsbereiche. Die App-Version wird über `package.json` und den festgelegten `npm version`-Ablauf verwaltet. Die aktuelle Web-Clipper-Version ist `0.2.0`; beide Versionsnummern müssen nicht identisch sein.

Die Skripte `npm run dist` und `npm run release` führen vor `electron-builder` automatisch `build/verify-webclip-crx.mjs` aus. Schlägt die Prüfung fehl, darf der Build beziehungsweise Release nicht fortgesetzt werden.

Die Prüfung stellt sicher:

- Die signierte Chromium-CRX ist unter `extension/distribution/chromium/archiv-wiki-web-clipper.crx` vorhanden und lesbar.
- Das Artefakt besitzt eine gültige CRX3-Struktur mit lesbarem eingebettetem `manifest.json`.
- Die signierte ID im CRX3-Kopf und die aus dem öffentlichen Manifest-Schlüssel abgeleitete Extension-ID stimmen beide mit der festgelegten Chromium-ID `dengpgfllpkndkgkbikigaejieogndbp` überein.
- Die Manifest-Version der CRX entspricht der erwarteten Web-Clipper-Version `0.2.0`.

Die Prüfung verhindert, dass eine fehlende, beschädigte, falsch zugeordnete oder unerwartet versionierte Web-Clipper-CRX unbemerkt in ein Distributionsartefakt gelangt.

Beim Packaging bindet `electron-builder` die signierte CRX als `extraResource` ein. Quelle ist `extension/distribution/chromium/archiv-wiki-web-clipper.crx`; im gepackten Ressourcenbereich liegt sie unter `web-clipper/chromium/`.

Private Signierschlüssel gehören weder in das Repository noch in das Release-Paket. Entsprechende `.pem`- und `.key`-Dateien bleiben über die vorhandenen Ignore-Regeln ausgeschlossen; verteilt wird ausschließlich das bereits signierte CRX-Artefakt.

---

# Schutz bei Staging und Tag-Konflikten

Vor jedem Staging wird ausgeführt:

```bash
git status --short
```

Danach werden ausschließlich die konkret benannten Pfade gestagt, die zum ausdrücklich freigegebenen Releaseumfang gehören. Eine Datei wird niemals allein deshalb aufgenommen, weil sie geändert oder ungetrackt ist. Vorher müssen insbesondere temporäre Übergaben, lokale Arbeitsdateien, private Schlüssel, Build-Ausgaben, nicht freigegebene ungetrackte Dateien und sonstige releasefremde Artefakte ausgeschlossen oder geklärt sein.

Ist bei mindestens einer Datei unklar, ob sie in den Release-Commit gehört, gilt **STOP**. Zuerst wird eine Nutzerentscheidung eingeholt. Pauschales Staging des gesamten Working Trees ist nicht zulässig.

Besitzen lokale Tags, Remote-Tags oder veröffentlichte GitHub-Releases für denselben Versionsnamen unterschiedliche Commit-Zuordnungen, gilt ebenfalls **STOP**. Es werden weder Force-Tags gesetzt noch vorhandene Tags überschrieben, gelöscht oder remote verändert; auch die Git-Historie wird nicht umgeschrieben. Zuerst werden Ursache und gewünschter Zielzustand analysiert und dem Nutzer zur Entscheidung vorgelegt.

---

# Terminal-Schritte

## Schritt 1

```bash
cd ~/Downloads/archiv-wiki
git status --short
```

Nur nach geklärtem Releaseumfang wird ein Staging-Befehl mit den tatsächlich freigegebenen Einzelpfaden zusammengestellt. Das Schema lautet:

```bash
git add -- <ausschließlich konkret freigegebene Pfade>
git diff --cached --name-status
git diff --cached --check
git commit -m "<kurze Beschreibung>"
```

Die Platzhalter werden vor der Ausführung durch die real freigegebenen Pfade beziehungsweise eine konkrete Commit-Beschreibung ersetzt. Nicht freigegebene Dateien bleiben ungestagt. Nach dem Commit muss der Working Tree für den vorgesehenen Releasezustand nachvollziehbar und frei von ungeklärten Änderungen sein.

---

## Schritt 2

Erst nach Nutzerbestätigung der Zielversion und der Release Notes, je nach bestätigter Versionsentscheidung:

```bash
npm version patch
```

oder

```bash
npm version minor
```

Dieser Befehl ist die einzige erlaubte Methode,

die Versionsnummer zu erhöhen und den Git-Tag anzulegen.

Nicht erlaubt:

- package.json manuell ändern
- git tag manuell erstellen

solange `npm version` erfolgreich funktioniert.

---

## Schritt 3

Nach dem Versionsschritt werden `package.json`, der erzeugte Tag und die Zuordnung des Tags zu `HEAD` geprüft. Anschließend wird der finale Build der neuen Zielversion erzeugt:

```bash
npm run dist
```

Die automatische CRX-Verifikation muss dabei erfolgreich sein. Das neu erzeugte AppImage muss im Dateinamen und in der Anwendung bereits die bestätigte Zielversion tragen. Ein früherer Testbuild mit der Ausgangsversion gilt nicht als final getestetes Release-Artefakt der neuen Version.

Genau dieses neu erzeugte Zielversions-Artefakt wird real getestet. Ein vorhandenes älteres AppImage oder ein Build mit einer anderen Versionsnummer darf diesen Test nicht ersetzen.

---

## Schritt 4

Vor dem Push werden erneut mindestens geprüft:

- `git status --short`
- Version in `package.json`
- erwarteter Tag und seine Zuordnung zu `HEAD`
- Dateiname und Version des real getesteten AppImage
- erfolgreiche CRX-Verifikation
- freigegebene Release Notes

Bei jeder Abweichung gilt **STOP**. Erst nach ausdrücklicher Nutzerfreigabe:

```bash
git push origin main --tags
```

---

## Schritt 5

Nur falls für die Release-Erstellung erforderlich:

```text
https://github.com/settings/tokens/new
```

```bash
export GH_TOKEN="dein_token"
```

Der Token wird ausschließlich als Umgebungsvariable gesetzt.

Niemals in die Git-URL einbauen.

---

## Schritt 6

```bash
npm run release
```

Dadurch wird der GitHub-Release-Entwurf erstellt. Da dieser Befehl erneut baut und hochlädt, müssen die im Entwurf enthaltenen Artefakte vor der Veröffentlichung nochmals auf Zielversion, erwarteten Inhalt und Übereinstimmung mit dem freigegebenen Releasezustand geprüft werden. Ist das bereitgestellte Artefakt nicht das freigegebene beziehungsweise real geprüfte Zielversions-Artefakt, gilt **STOP** und es darf nicht veröffentlicht werden.

---

## Schritt 7

Manuell:

- GitHub öffnen
- Releases
- neuen Entwurf öffnen
- bestätigte Release Notes einfügen beziehungsweise abgleichen
- Zielversion, Tag und Artefakte prüfen
- endgültige Nutzerfreigabe einholen
- erst danach `Publish release` auswählen

Die KI behauptet niemals,

dass dieser Schritt bereits erledigt wurde.

---

# Abschluss

Nach der endgültigen Veröffentlichung nennt die KI immer ausdrücklich:

- die neue Versionsnummer
- warum Patch oder Minor gewählt wurde

Erst die tatsächlich veröffentlichte Versionsnummer gilt anschließend als Ausgangspunkt für den nächsten Release.

---

# Dauerhafte Projektregel

Diese Datei ist die einzige verbindliche Release-Vorschrift für Archiv-Wiki.

Sie ersetzt alle früheren Release-Anleitungen.

Künftige Anfragen wie:

- Tag beenden
- Release
- Fertig
- Leg los

werden ausschließlich nach dieser Datei ausgeführt.

Der Ablauf wird nicht jedes Mal neu interpretiert. Der Trigger startet ihn, erlaubt aber niemals, fehlende Voraussetzungen, unklare Dateien, Tag-Konflikte, Audits, Realtests oder Nutzerfreigaben zu überspringen. Ist eine Schutzvoraussetzung nicht erfüllt, wird der Release gestoppt und der fehlende Punkt konkret gemeldet.
