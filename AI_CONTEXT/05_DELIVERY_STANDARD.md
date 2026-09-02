# Archiv-Wiki — Standard für die Übergabe fertiger Arbeiten

## Vor der Übergabe verbindlich

- **Syntax-Prüfung** aller geänderten JavaScript-Dateien, bevor irgendetwas verpackt wird.
- **Editor-Bundle neu bauen**, wenn `build/editor-entry.js` verändert wurde — eine Änderung ohne Neubau ist im Ergebnis nicht enthalten und darf nicht als erledigt übergeben werden.
- **Echtes Testen in einer laufenden Instanz** (headless über xvfb ausreichend), nicht nur Code-Durchsicht. Das gilt für jede Änderung, auch kleine.
- **Test-Arbeitsverzeichnisse und temporäre Kopien vollständig entfernen**, bevor das Ergebnis verpackt wird — keine Test-Rückstände in der Übergabe.
- Werden beim Testen selbst neue, unbeabsichtigte Probleme entdeckt (auch durch die eigene, gerade vorgenommene Änderung verursacht), werden diese vor der Übergabe behoben, nicht mit der Übergabe mit ausgeliefert und erst danach erklärt.

## Form der Übergabe

- Fertige Arbeit wird immer als tatsächliche, herunterladbare Datei übergeben, nicht nur im Chat beschrieben.
- Nach der Bereitstellung folgt keine lange Nacherzählung des Dateiinhalts — die Datei spricht für sich, der Nutzer kann sie direkt öffnen.
- Eine klare, kurze Installations-/Anwendungsanleitung (Entpacken, Abhängigkeiten installieren, Startbefehl) begleitet jede Code-Übergabe, damit sofort ausprobiert werden kann.

## Inhalt der Zusammenfassung bei Übergabe

Jede Übergabe erklärt knapp und in dieser Reihenfolge:
1. **Was geändert wurde** — welche Dateien, welcher Umfang.
2. **Warum diese Lösung gewählt wurde**, wenn eine Wahl zwischen mehreren Herangehensweisen bestand oder die Ursache nicht offensichtlich war.
3. **Was tatsächlich getestet wurde** und mit welchem Ergebnis — nicht nur, dass getestet wurde, sondern was genau geprüft wurde.

## Vorbereitung und Dev-Version in der Abschlussmeldung

Nach jeder Änderung an Quellcode oder ausführbarem Projektverhalten wird vor der Abschlussmeldung konkret geprüft:

1. Sind neue oder geänderte npm-Abhängigkeiten vorhanden?
2. Ist deshalb `npm install` oder ein anderer Dependency-Schritt notwendig?
3. Ist ein Build, Rebuild oder anderer Vorbereitungsschritt notwendig?
4. Ist ein besonderer Installer- oder Setup-Schritt notwendig?
5. Muss Archiv-Wiki, ein Browser oder ein anderer beteiligter Prozess neu gestartet werden?
6. Kann der aktuelle Stand direkt mit dem normalen Dev-Befehl gestartet werden?

Die Abschlussmeldung enthält danach mindestens diese Abschnitte:

- `## GEÄNDERT`
- `## VON DIR GEPRÜFT`
- `## VOR DEM START NOTWENDIG`
- `## DEV-VERSION STARTEN`
- `## DAS MUSST DU JETZT SELBST TESTEN`

Unter `## VOR DEM START NOTWENDIG` steht ausschließlich, was für den konkreten geänderten Stand tatsächlich erforderlich ist. Wenn nichts zusätzlich vorbereitet werden muss, lautet die Angabe ausdrücklich: „Keine zusätzlichen Vorbereitungsschritte erforderlich.“ Sind Schritte notwendig, werden die exakten, direkt kopierbaren Befehle beziehungsweise Handlungen in der richtigen Reihenfolge genannt und kurz eingeordnet.

`npm install` wird nur verlangt, wenn neue oder geänderte Abhängigkeiten diesen Schritt tatsächlich erforderlich machen. Ebenso werden Builds, Rebuilds, Installer, Berechtigungen, bereitzustellende Dateien, besondere Testmodi sowie Neustarts von Archiv-Wiki, Browsern oder anderen Prozessen nur genannt, wenn sie für den konkreten Test notwendig sind. Vorhandene Benutzerdaten werden niemals ohne vorherigen ausdrücklichen Hinweis und Freigabe gelöscht oder zurückgesetzt.

Unter `## DEV-VERSION STARTEN` steht der direkt kopierbare Befehl für den gerade bearbeiteten lokalen Entwicklungsstand. Vor seiner Ausgabe werden der aktuelle `dev`-Script in `package.json`, die Startbarkeit der Änderung und gegebenenfalls notwendige Vorbereitungsschritte geprüft. Für den normalen aktuellen Archiv-Wiki-Dev-Start lautet er:

```sh
npm run dev -- --user-data-dir="$HOME/.archiv-wiki-dev-settings"
```

Ein `cd` zum Hauptprojekt wird standardmäßig nicht mit ausgegeben. Nur wenn ein Befehl zwingend aus einem anderen Verzeichnis ausgeführt werden muss, wird der notwendige Verzeichniswechsel ausdrücklich genannt. Erfordert der konkrete Test einen anderen Startweg, wird dieser zusätzlich beziehungsweise stattdessen direkt kopierbar angegeben und kurz begründet. Unter `## DAS MUSST DU JETZT SELBST TESTEN` folgt eine konkrete, auf die Änderung bezogene Testliste einschließlich tatsächlich erforderlicher Neustarts oder Setup-Schritte.

Bei reinen `AI_CONTEXT`-, Markdown- oder sonstigen Dokumentationsänderungen ohne Auswirkung auf die Anwendung ist kein Dev-Start erforderlich. Die Abschlussmeldung hält dann ausdrücklich fest: „Kein App-Start erforderlich – reine Dokumentationsänderung.“

## Ehrlichkeit über den Umfang

- Nur das umsetzen und übergeben, was tatsächlich beauftragt wurde — keine zusätzlichen, ungefragten Änderungen im selben Arbeitsschritt.
- Bekannte, bewusst nicht behobene Einschränkungen oder Randfälle werden bei der Übergabe offen benannt, nicht verschwiegen oder als vollständig gelöst dargestellt.
- Wird während der Arbeit ein zusätzliches, ursprünglich nicht angefragtes Problem entdeckt, wird es benannt und zur Entscheidung vorgelegt, nicht eigenmächtig mit erledigt.
