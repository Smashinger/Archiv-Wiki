# Archiv-Wiki KI-Integration – Finaler Brief

## Vision

Vollständig integrierter, lokaler KI-Agent direkt in Archiv-Wiki.
- ✅ Lokal, ohne Cloud
- ✅ Optional ein/aus schaltbar
- ✅ Nutzt vorhandene Werkzeuge (Werkzeugleiste unverändert)
- ✅ Eigenständig arbeitender Agent
- ✅ Intelligentes Wissensmanagement

---

## Was die KI können soll

### Lesen & Suchen
- Einzelne und mehrere Notizen lesen
- Gesamtes Wiki durchsuchen
- Fragen anhand der Wissenssammlung beantworten
- Zusammenhänge erkennen

### Schreiben & Bearbeiten
- Neue Notizen erstellen
- Bestehende Notizen ändern
- Inhalte umschreiben und strukturieren
- Wiki-Links aktualisieren

### Organisieren
- Kategorien (Haupt + Sub) erstellen/umbenennen/verschieben
- Notizen verschieben/umbenennen
- Mehrere Dateien in einem Auftrag bearbeiten
- Intelligente Struktur erkennen und umsetzen

### Analysieren & Optimieren
- Duplikate finden
- Widersprüche erkennen
- Verwaiste Dateien finden
- Verbesserungen vorschlagen
- Intelligente Wiki-Links vorschlagen

### Beispiel-Auftrag
```
"Untersuche mein gesamtes Wiki und organisiere es sinnvoll.
Erstelle eine bessere Ordnerstruktur, verschiebe Notizen
und aktualisiere Wiki-Links."
```

→ KI macht: Analyse → Plan → (nach Bestätigung) Ausführung → Ergebnis

---

## Wie es funktioniert

### 4-Phasen pro Auftrag

1. **INPUT**: User gibt Auftrag in Chatfenster
2. **PLAN**: KI analysiert, erstellt Änderungsplan
3. **FREIGABE**: User sieht Plan, kann editieren, bestätigt dann
4. **AUSFÜHRUNG**: KI führt Plan aus, zeigt Ergebnis

### Wichtig: Werkzeuge

Die KI nutzt die **gleichen internen Funktionen** wie die Werkzeugleiste:
- Keine neuen UI-Buttons
- Keine Klick-Simulation
- Einfach: KI ruft `createNote()` auf (wie der Button intern auch)
- Ergebnis: Notiz wird erstellt, ohne dass Nutzer klicken muss

### Sicherheit

- **Plan vor Ausführung**: User sieht was passiert
- **Freigabe erforderlich**: Kein Auto-Execute
- **Werkzeuge kontrolliert**: KI darf nur freigegebene Wikis ändern
- **Undo möglich**: Sicherung + Rollback
- **Keine Shell-Befehle**: Nur Datei-Operationen über Archiv-Wiki

### UI-Integration

**Chat-Fenster Zugang:**
- **Topbar Icon [🤖]** oben rechts (neben Settings, WEBDAV, etc.)
- Ein-Klick → Chat-Fenster öffnet/schließt
- Schwebendes Fenster über dem Editor
- Position/Größe speichern (Nutzer kann verschieben)
- Kein neuer Button in Werkzeugleiste [Haupt] [Unter] [Notiz]

**Chat-Fenster Layout:**
- Oben: Modell-Auswahl
- Mitte: Chat-Verlauf
- Unten: Input-Feld
- Rechts: Mode-Buttons (Safe/Auto/Plan)

---

## 7 Entwicklungsphasen

| Phase | Fokus | Ergebnis |
|-------|-------|----------|
| **1** | Architektur-Audit | Analyse des bestehenden Codes, Plan |
| **2** | KI-Chat & UI | Lokaler Chat mit Ollama + Topbar-Icon [🤖] |
| **3** | Lesender Zugriff | KI kann Notizen suchen und lesen |
| **4** | Agentensteuerung | KI führt mehrere Werkzeuge nacheinander aus |
| **5** | Schreiben | KI erstellt, bearbeitet, reorganisiert Notizen |
| **6** | Wiki-Organisation | Große Umstrukturierungen wie Grimoire |
| **7** | Wissenspflege | Duplikate, Widersprüche, Optimierungen finden |

---

## Rollen & Workflow

### Antigravity (Analyst/Planner)
- Analysiert Archiv-Wiki Quellcode (Phase 1)
- Erstellt Zielarchitektur
- Plant alle 7 Phasen
- Prüft später die Ergebnisse
- **Schreibt Implementierungsaufträge für Claude Code**

### Claude (Supporter)
- Diskutiert Architektur-Entscheidungen
- Verbessert den Plan
- Prüft auf Sicherheitslücken
- Unterstützt bei Fragen

### Claude Code (Implementer)
- Programmiert nur freigegebene Phasen
- Nutzt bestehende Archiv-Wiki-Funktionen
- Schreibt Tests
- Berichtet über Ergebnisse

### Nutzer (Projektverantwortlicher)
- Entscheidet Architektur
- Gibt Phasen frei (nacheinander, nicht alle auf einmal)
- Bestätigt Pläne vor Ausführung
- Prüft Ergebnisse

---

## Ollama & Modelle

**Ollama-Server** läuft lokal (localhost:11434)

**Modell-Wahl** bleibt dem Nutzer überlassen:
- Nutzer installiert was er will (phi:2.7b, mistral:7b, etc.)
- KI erkennt verfügbare Modelle automatisch
- Nutzer kann im Model-Picker wechseln
- Info-Text zeigt: "Modell sollte mindestens X GB haben"

**Settings** können in zwei Systemen konfiguriert werden:
- **Ollama**: Temperature, Context-Size, Top-P (technisch)
- **Archiv-Wiki**: An/Aus, Mode (Safe/Auto/Plan), Logging

---

## Was NICHT verändert wird

- ❌ Werkzeugleiste
- ❌ Bestehende UI
- ❌ Archiv-Wiki ohne KI (muss funktionieren)
- ❌ Markdown-Speicherformat
- ❌ Wiki-Link-Format
- ❌ WebDAV-Kompatibilität
- ❌ Backup-System (wird genutzt, nicht geändert)

---

## Hardware & Performance

**Verfügbare Hardware:**
- AMD Ryzen 5 3600
- RTX 3080 (10 GB VRAM)
- 32 GB RAM
- Fedora Linux

**Performance-Ziele:**
- Plan-Generierung: < 10s
- Notiz-Suche: < 5s
- Effiziente Kontextverwaltung
- Abbruch laufender Operationen möglich

---

## Sicherheitskonzept

**Werkzeug-Validierung:**
- Jedes Werkzeug wird serverseitig geprüft
- Keine direkten Shell-Befehle
- Pfad-Schutz gegen Path Traversal
- Zugriff nur auf freigegebene Wiki-Verzeichnisse

**Freigabe-Workflow:**
- Plan zeigen → User editiert (optional) → User bestätigt → KI führt aus
- Für Löschungen: Extra Freigabe
- Für Konflikte: Fragen vor Aktion

**Datenschutz:**
- Keine Telemetrie
- Keine Cloud-Fallback
- Chats lokal gespeichert (oder nicht persistent)
- Transparente Verwaltung von Logs

**Undo & Wiederherstellung:**
- Sicherung vor Änderungen
- Undo über Rollback-Stack
- Integritätsprüfung nach Operationen
- Wiederherstellung aus Backups möglich

---

## Nächste Schritte

**Antigravity startet mit Phase 1:**
1. Liest `AGENTS.md` und Projektregeln
2. Untersucht Archiv-Wiki Quellcode (lesend)
3. Dokumentiert bestehende Funktionen
4. Erstellt Zielarchitektur
5. Plant alle 7 Phasen detailliert
6. Erstellt Risiko-Analyse
7. Schreibt Entwicklungsplan

**Nach Phase 1:**
- Claude und Nutzer diskutieren Plan
- Ggf. Anpassungen
- Nutzer gibt Phase 1-Ergebnis frei
- Antigravity erstellt Implementierungsauftrag für Phase 2
- Claude Code programmiert Phase 2
- Wiederholen für Phase 3-7

---

## Verbindliche Regel

**Keine Implementierung ohne ausdrückliche Freigabe des Nutzers.**

Jede Phase wird separat freigegeben.

Antigravity plant, Claude unterstützt, Claude Code programmiert, Nutzer entscheidet.
