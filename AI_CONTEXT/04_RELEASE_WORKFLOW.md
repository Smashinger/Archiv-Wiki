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
5. Eine SemVer-Zielversion nach den Projektregeln vorschlagen und vom Nutzer bestätigen lassen.
6. Release Notes aus Endnutzersicht erstellen und vom Nutzer bestätigen lassen.
7. Genau diese bestätigten Release Notes für die bestätigte Zielversion in den lokalen In-App-Release-Notes-Datensatz übernehmen. GitHub und In-App-Anzeige verwenden denselben Wortlaut, dieselbe Reihenfolge und dieselben Kategorien.
8. Ausschließlich die ausdrücklich freigegebenen Projektänderungen einschließlich der In-App-Release-Notes einzeln stagen, prüfen und committen.
9. Prüfen, dass für den vorgesehenen Releasezustand keine ungeklärten Änderungen mehr vorhanden sind.
10. Den bestätigten Versionsschritt ausschließlich mit `npm version patch|minor|major` durchführen.
11. Einen finalen Build erzeugen, der bereits die neue Zielversion trägt.
12. Die automatische CRX-Verifikation erfolgreich abschließen und die erzeugten Update-Metadaten prüfen.
13. Genau das finale Artefakt der Zielversion real testen.
14. Vor dem Push Git-Status, Version, Tag, Build-Artefakt, `latest-linux.yml` und Release Notes erneut prüfen.
15. Erst nach ausdrücklicher Nutzerfreigabe `main` und ausschließlich den neu erzeugten Release-Tag pushen.
16. Den GitHub-Release-Entwurf erstellen.
17. Entwurf, Release Notes und Release-Artefakte auf GitHub manuell prüfen. Der Release muss mindestens das freigegebene AppImage und die dazu passende `latest-linux.yml` enthalten.
18. Den Release erst nach ausdrücklicher Nutzerentscheidung endgültig veröffentlichen.

Die Release Notes bleiben ein zentraler Bestandteil und werden erst aus dem geklärten veröffentlichten Ausgangsstand und dem kuratierten Releaseumfang abgeleitet. Sie werden vor dem Release-Commit bestätigt und anschließend als identische lokale In-App-Fassung und GitHub-Fassung verwendet.

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

## Einheitliche In-App- und GitHub-Fassung

Für jede Zielversion existiert inhaltlich nur eine freigegebene Release-Notes-Fassung.

Nach der Nutzerbestätigung wird exakt derselbe Inhalt:

1. lokal für die bestätigte Zielversion in Archiv-Wiki hinterlegt und
2. beim zugehörigen GitHub-Release veröffentlicht.

Wortlaut, Reihenfolge, Einleitung, Kategorien und Aufzählungspunkte bleiben identisch. Nur die visuelle Darstellung darf sich an die jeweilige Oberfläche anpassen.

Die In-App-Release-Notes werden lokal mit der Anwendung ausgeliefert und nicht beim Öffnen aus GitHub geladen. Die Anzeige verwendet die tatsächlich installierte App-Version als Schlüssel. Eine Release-Notes-Fassung einer anderen Version darf nicht ersatzweise angezeigt werden.

Die In-App-Release-Notes müssen bereits vor dem Release-Commit für die bestätigte Zielversion eingetragen sein. Sie nach dem Release-Commit nachzutragen und dadurch einen ungeklärten Working Tree vor `npm version` zu erzeugen, ist nicht zulässig.

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

1. Welche Version ist aktuell auf GitHub tatsächlich als letzte öffentliche Version veröffentlicht?
2. Welchem Commit ist dieser veröffentlichte Release zugeordnet?
3. Welche Änderungen wurden seit genau diesem veröffentlichten Stand tatsächlich umgesetzt?

Nur diese Änderungen dürfen in die Release Notes aufgenommen werden.

Bereits veröffentlichte Änderungen dürfen niemals erneut erscheinen.

Interne Entwicklungsarbeiten, Refactorings oder Fehler, die nie veröffentlicht wurden, dürfen niemals in den Release Notes erscheinen.

Die Versionsbasis wird niemals allein aus der numerisch höchsten lokalen Tag-Zeile, einem Ordnernamen, ZIP-Namen oder einer vermuteten Versionsnummer abgeleitet. Lokale Tags, Remote-Tags und der tatsächlich veröffentlichte GitHub-Release werden getrennt geprüft. Bei widersprüchlichen Zuordnungen gilt **STOP**.

---

# Versionsentscheidung

Die KI ermittelt anhand dieser Regeln selbst eine begründete SemVer-Empfehlung. Bevor In-App-Release-Notes für die Zielversion eingetragen oder `npm version` ausgeführt wird, muss der Nutzer die vorgeschlagene Zielversion ausdrücklich bestätigen.

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

Die Archiv-Wiki-App und der Web Clipper besitzen getrennte Versionsbereiche. Die App-Version wird über `package.json` und den festgelegten `npm version`-Ablauf verwaltet. Die aktuelle Web-Clipper-Version ist `0.2.1`; beide Versionsnummern müssen nicht identisch sein.

Die Skripte `npm run dist` und `npm run release` führen vor `electron-builder` automatisch `build/verify-webclip-crx.mjs` aus. Schlägt die Prüfung fehl, darf der Build beziehungsweise Release nicht fortgesetzt werden.

Die Prüfung stellt sicher:

- Die signierte Chromium-CRX ist unter `extension/distribution/chromium/archiv-wiki-web-clipper.crx` vorhanden und lesbar.
- Das Artefakt besitzt eine gültige CRX3-Struktur mit lesbarem eingebettetem `manifest.json`.
- Die kryptografische CRX3-Signatur ist gültig und gehört zum signierten Kopf- und Archivinhalt.
- Die signierte ID im CRX3-Kopf und die aus dem öffentlichen Manifest-Schlüssel abgeleitete Extension-ID stimmen beide mit der festgelegten Chromium-ID `dengpgfllpkndkgkbikigaejieogndbp` überein.
- Die Manifest-Version der CRX entspricht der erwarteten Web-Clipper-Version `0.2.1`.

Die Prüfung verhindert, dass eine fehlende, beschädigte, falsch zugeordnete, kryptografisch ungültige oder unerwartet versionierte Web-Clipper-CRX unbemerkt in ein Distributionsartefakt gelangt.

Beim Packaging bindet `electron-builder` die signierte CRX als `extraResource` ein. Quelle ist `extension/distribution/chromium/archiv-wiki-web-clipper.crx`; im gepackten Ressourcenbereich liegt sie unter `web-clipper/chromium/`.

Private Signierschlüssel gehören weder in das Repository noch in das Release-Paket. Entsprechende `.pem`- und `.key`-Dateien bleiben über die vorhandenen Ignore-Regeln ausgeschlossen; verteilt wird ausschließlich das bereits signierte CRX-Artefakt.

---

# Update-Artefakte

Für einen Linux-AppImage-Release gehören mindestens zwei zusammengehörige Dateien zum veröffentlichten Update-Stand:

- das finale AppImage der bestätigten Zielversion
- die dazu passende `latest-linux.yml`

Die `latest-linux.yml` muss zur exakt veröffentlichten AppImage-Datei gehören. Vor der Veröffentlichung werden mindestens Zielversion, Dateiname, Dateigröße und die von `electron-builder` erzeugten Integritätsangaben gegen das finale Artefakt geprüft.

Ein GitHub-Release ohne passende `latest-linux.yml` gilt für den Auto-Update-Weg nicht als vollständig. Der Release darf deshalb nicht veröffentlicht werden, solange diese Datei fehlt oder nicht zum freigegebenen AppImage passt.

Wird durch `npm run release` ein neuer Build für den Entwurf erzeugt, müssen genau die dort hochgeladenen Artefakte nochmals mit dem freigegebenen Releasezustand abgeglichen werden. Ein abweichend neu gebautes oder ungeprüftes Artefakt darf nicht allein deshalb veröffentlicht werden, weil der Upload erfolgreich war.

---

# Schutz bei Staging und Tag-Konflikten

Vor jedem Staging wird ausgeführt:

```bash
git status --short
```

Danach werden ausschließlich die konkret benannten Pfade gestagt, die zum ausdrücklich freigegebenen Releaseumfang gehören. Eine Datei wird niemals allein deshalb aufgenommen, weil sie geändert oder ungetrackt ist. Vorher müssen insbesondere temporäre Übergaben, lokale Arbeitsdateien, private Schlüssel, Build-Ausgaben, nicht freigegebene ungetrackte Dateien und sonstige releasefremde Artefakte ausgeschlossen oder geklärt sein.

Die bereits bestätigten In-App-Release-Notes der Zielversion gehören zum Releaseumfang und werden gemeinsam mit den übrigen freigegebenen Änderungen in den Release-Commit aufgenommen.

Ist bei mindestens einer Datei unklar, ob sie in den Release-Commit gehört, gilt **STOP**. Zuerst wird eine Nutzerentscheidung eingeholt. Pauschales Staging des gesamten Working Trees ist nicht zulässig.

Besitzen lokale Tags, Remote-Tags oder veröffentlichte GitHub-Releases für denselben Versionsnamen unterschiedliche Commit-Zuordnungen, gilt ebenfalls **STOP**. Es werden weder Force-Tags gesetzt noch vorhandene Tags überschrieben, gelöscht oder remote verändert; auch die Git-Historie wird nicht umgeschrieben. Zuerst werden Ursache und gewünschter Zielzustand analysiert und dem Nutzer zur Entscheidung vorgelegt.

Beim Push werden alte lokale Tags niemals pauschal mitgesendet. `git push origin main --tags` ist für Archiv-Wiki nicht zulässig. Gepusht werden ausschließlich `main` und der in diesem Release neu erzeugte, vorher geprüfte Tag.

---

# Terminal-Schritte

## Schritt 1 — Ausgangsstand und Releaseumfang prüfen

```bash
cd ~/Downloads/archiv-wiki
git status --short
```

Zusätzlich werden der tatsächlich veröffentlichte GitHub-Release, die lokale/Remote-Tag-Zuordnung und die Änderungen seit diesem veröffentlichten Stand geprüft.

In diesem Schritt wird noch nicht blind alles committed oder gepusht. Unklare Dateien oder Tag-Zuordnungen führen zu **STOP**.

---

## Schritt 2 — Zielversion und Release Notes bestätigen, lokal übernehmen und committen

Zuerst schlägt die KI anhand des geklärten Releaseumfangs die Zielversion vor. Nach Nutzerbestätigung werden die Release Notes erstellt und ebenfalls vom Nutzer bestätigt.

Danach wird exakt diese freigegebene Fassung für die bestätigte Zielversion in den lokalen In-App-Release-Notes-Datensatz eingetragen.

Erst jetzt wird ein Staging-Befehl mit den tatsächlich freigegebenen Einzelpfaden zusammengestellt. Das Schema lautet:

```bash
git add -- <ausschließlich konkret freigegebene Pfade>
git diff --cached --name-status
git diff --cached --check
git commit -m "<kurze Beschreibung>"
```

Die Platzhalter werden vor der Ausführung durch die real freigegebenen Pfade beziehungsweise eine konkrete Commit-Beschreibung ersetzt. Nicht freigegebene Dateien bleiben ungestagt.

Nach dem Commit wird erneut geprüft:

```bash
git status --short
```

Für den vorgesehenen Releasezustand dürfen keine ungeklärten Änderungen verbleiben.

---

## Schritt 3 — Versionsschritt

Erst nach Nutzerbestätigung der Zielversion und Release Notes sowie nach dem geklärten Release-Commit, je nach bestätigter Versionsentscheidung:

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

- `package.json` manuell ändern
- `git tag` manuell erstellen

solange `npm version` erfolgreich funktioniert.

Nach dem Versionsschritt werden mindestens geprüft:

- Version in `package.json`
- der neu erzeugte Tag
- Zuordnung des Tags zu `HEAD`
- `git status --short`

---

## Schritt 4 — Final bauen und real testen

```bash
npm run dist
```

Die automatische CRX-Verifikation muss erfolgreich sein.

Das neu erzeugte AppImage muss im Dateinamen und in der Anwendung bereits die bestätigte Zielversion tragen. Ein früherer Testbuild mit der Ausgangsversion gilt nicht als final getestetes Release-Artefakt der neuen Version.

Zusätzlich wird die zum Build gehörende `latest-linux.yml` geprüft. Sie muss auf das finale AppImage der Zielversion verweisen und zu dessen tatsächlich erzeugten Metadaten passen.

Genau dieses neu erzeugte Zielversions-AppImage wird real getestet. Ein vorhandenes älteres AppImage oder ein Build mit einer anderen Versionsnummer darf diesen Test nicht ersetzen.

---

## Schritt 5 — Letzte Prüfung und gezielter Push

Vor dem Push werden erneut mindestens geprüft:

- `git status --short`
- Version in `package.json`
- erwarteter neuer Tag und seine Zuordnung zu `HEAD`
- Dateiname und Version des real getesteten AppImage
- passende `latest-linux.yml`
- erfolgreiche CRX-Verifikation
- lokal hinterlegte In-App-Release-Notes
- freigegebene GitHub-Release-Notes; Inhalt muss mit der In-App-Fassung identisch sein

Bei jeder Abweichung gilt **STOP**.

Erst nach ausdrücklicher Nutzerfreigabe werden ausschließlich `main` und der neue Tag gepusht. Beispiel für eine bestätigte Zielversion `vX.Y.Z`:

```bash
git push origin main vX.Y.Z
```

`vX.Y.Z` wird vor Ausführung durch den tatsächlich neu erzeugten und geprüften Release-Tag ersetzt.

Nicht zulässig:

```bash
git push origin main --tags
```

Alte lokale Tags werden nicht mitgesendet, verändert oder bereinigt.

---

## Schritt 6 — GitHub-Token nur falls erforderlich

Nur falls für die Release-Erstellung erforderlich:

```text
https://github.com/settings/tokens/new
```

```bash
export GH_TOKEN="dein_token"
```

Der Token wird ausschließlich als Umgebungsvariable gesetzt.

Niemals in die Git-Remote-URL einbauen.

Insbesondere nicht zulässig ist ein Remote im Format:

```text
https://BENUTZER:TOKEN@github.com/...
```

Ein Authentifizierungsfehler rechtfertigt keine Ausnahme von dieser Regel.

---

## Schritt 7 — GitHub-Release-Entwurf erstellen

```bash
npm run release
```

Dadurch wird der GitHub-Release-Entwurf erstellt. Da dieser Befehl erneut bauen und hochladen kann, müssen die im Entwurf enthaltenen Artefakte vor der Veröffentlichung nochmals auf Zielversion, erwarteten Inhalt und Übereinstimmung mit dem freigegebenen Releasezustand geprüft werden.

Der Entwurf muss mindestens enthalten:

- das freigegebene AppImage der Zielversion
- die dazu passende `latest-linux.yml`

Fehlt `latest-linux.yml`, stimmt sie nicht mit dem AppImage überein oder ist das hochgeladene AppImage nicht das freigegebene beziehungsweise real geprüfte Zielversions-Artefakt, gilt **STOP** und der Release darf nicht veröffentlicht werden.

Die Release Notes im GitHub-Entwurf müssen inhaltlich exakt der bereits lokal eingebauten und vom Nutzer bestätigten In-App-Fassung entsprechen.

---

## Schritt 8 — Manuelle Veröffentlichung

Manuell:

- GitHub öffnen
- Releases
- neuen Entwurf öffnen
- bestätigte Release Notes einfügen beziehungsweise exakt abgleichen
- Zielversion und Tag prüfen
- AppImage prüfen
- `latest-linux.yml` prüfen
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

Die für diese Version lokal ausgelieferten In-App-Release-Notes und die veröffentlichten GitHub-Release-Notes bleiben inhaltlich identisch.

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
