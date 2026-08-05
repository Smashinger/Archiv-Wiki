# Archiv-Wiki – Verbindlicher Release-Workflow

Diese Datei ist die dauerhaft verbindliche Release-Vorschrift für Archiv-Wiki.

Bei jeder zukünftigen Anfrage wie:

- Tag beenden
- Fertig, Tag beenden
- Release
- Leg los

ist ausschließlich diese Vorschrift anzuwenden.

Es erfolgt keine Rückfrage.

---

# Ablauf

Immer in dieser Reihenfolge:

1. Release Notes erstellen
2. Versionsart bestimmen
3. Terminal-Befehle ausgeben
4. GitHub-Release erstellen
5. Neue Versionsnummer nennen

Die Release Notes sind immer der wichtigste Bestandteil.

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

# Endergebnis statt Weg dorthin

Bei jedem „Tag beenden" wird zuerst geprüft, was sich zwischen dem letzten „Tag beenden" und dem jetzigen tatsächlich als Endergebnis geändert hat — nicht der Weg dorthin. Die Release Notes bilden ausschließlich dieses Endergebnis ab.

Nicht erwähnt werden:

- zu technische Details
- Dinge, die nur zwischen zwei Releases als Zwischenschritt passiert sind (z. B. eine Änderung, die später wieder verworfen oder ersetzt wurde)
- sonstige Zwischenschritte, die für den Nutzer nicht von Interesse sind

---

# Nachweisbarkeit von Änderungen

Release Notes werden ausschließlich für Änderungen erstellt, die im Diff/Commit-Verlauf tatsächlich nachweisbar sind — niemals für vermutete, mögliche oder nur im Test entstandene Änderungen (z. B. Textanpassungen, die nur zum Prüfen einer Regel gemacht wurden, nicht als bewusste Produktentscheidung).

Im Zweifel wird nachgefragt, ob eine gefundene, uncommittete Änderung tatsächlich released werden soll, statt sie automatisch einzuschließen.

---

# Versionsentscheidung

Die KI entscheidet selbst.

Keine Rückfrage.

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

---

# Terminal-Schritte

Die Terminal-Befehle werden immer als einzelne, nummerierte Schritte mit jeweils eigenem Code-Block ausgegeben, nicht als ein zusammengefasster Block. Jeder Schritt bekommt eine kurze Überschrift, die erklärt was er tut.

Die nummerierten Schritte enthalten immer auch den Schritt zum GitHub-Zugangs-Token (Erstellen unter https://github.com/settings/tokens/new mit Scope „repo", danach `export GH_TOKEN=...` als Umgebungsvariable, niemals in die Remote-URL eingebettet) — als eigener, klar gekennzeichneter Schritt mit dem Hinweis „nur nötig, falls das bisherige Token abgelaufen ist". Dieser Schritt wird nicht weggelassen, nur weil er bedingt ist.

## Schritt 1

```bash
cd ~/Downloads/archiv-wiki
git status
```

Falls Änderungen vorhanden:

```bash
git add .
git commit -m "<kurze Beschreibung>"
```

Falls `git status` meldet:

```
nichts zu committen
```

direkt weiter.

---

## Schritt 2

Je nach Versionsentscheidung:

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

```bash
git push origin main --tags
```

---

## Schritt 4

Nur falls erforderlich: 
```bash
https://github.com/settings/tokens/new
```

```bash
export GH_TOKEN="dein_token"
```

Der Token wird ausschließlich als Umgebungsvariable gesetzt.

Niemals in die Git-URL einbauen.

---

## Schritt 5

```bash
npm run release
```

Dadurch wird der GitHub-Release-Entwurf erstellt.

---

## Schritt 6

Manuell:

- GitHub öffnen
- Releases
- neuen Entwurf öffnen
- Release Notes einfügen
- Publish release

Die KI behauptet niemals,

dass dieser Schritt bereits erledigt wurde.

---

# Abschluss

Am Ende nennt die KI immer ausdrücklich:

- die neue Versionsnummer
- warum Patch oder Minor gewählt wurde

Diese Versionsnummer gilt anschließend als Ausgangspunkt für den nächsten Release.

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

Der Ablauf wird nicht jedes Mal neu interpretiert.
