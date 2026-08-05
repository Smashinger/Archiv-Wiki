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

## Ehrlichkeit über den Umfang

- Nur das umsetzen und übergeben, was tatsächlich beauftragt wurde — keine zusätzlichen, ungefragten Änderungen im selben Arbeitsschritt.
- Bekannte, bewusst nicht behobene Einschränkungen oder Randfälle werden bei der Übergabe offen benannt, nicht verschwiegen oder als vollständig gelöst dargestellt.
- Wird während der Arbeit ein zusätzliches, ursprünglich nicht angefragtes Problem entdeckt, wird es benannt und zur Entscheidung vorgelegt, nicht eigenmächtig mit erledigt.
