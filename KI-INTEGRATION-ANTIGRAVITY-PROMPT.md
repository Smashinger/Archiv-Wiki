# Prompt für Antigravity – Phase 1 Start

---

Antigravity, bitte lies zunächst den kompletten Brief:

**Datei:** `KI-INTEGRATION-BRIEF.md`

Dieser Brief fasst zusammen:
- Vision: Lokaler KI-Agent in Archiv-Wiki
- Funktionalität: Was die KI können soll (Lesen, Schreiben, Organisieren, Analysieren)
- 7 Entwicklungsphasen
- Rollen & Workflow
- UI-Integration (Topbar Icon für Chat)
- Sicherheitskonzept
- Hardware-Constraints

Lies den Brief vollständig.

---

Nach dem Lesen: Starte mit **Phase 1 – Architektur-Audit**.

## Phase 1: Architektur-Audit (Lesend, Analytisch)

**Keine Implementierung, keine Commits, keine Veränderungen.**

### Schritt 1: Projektregeln lesen
- Lies `AGENTS.md` im Archiv-Wiki Repo
- Beachte alle Entwicklungsregeln und Constraints

### Schritt 2: Quellcode untersuchen
1. **Projektstruktur** - Verzeichnisse, Electron-Version, Node.js
2. **Main-Prozess & Renderer** - Wie kommunizieren sie?
3. **IPC-Struktur** - Welche IPC-Channels existieren?
4. **UI-Framework** - Wird Vue/React/Vanilla JS genutzt?
5. **Dateiverwaltung** - Wie funktionieren: Notizen erstellen, lesen, speichern, verschieben?
6. **Bestehende Systeme:**
   - Suche (Volltext? Wie implementiert?)
   - Wiki-Links (wie aufgelöst?)
   - Backup (Funktionen vorhanden?)
   - Undo (wie implementiert?)
   - WebDAV (Integration?)

### Schritt 3: Sicherheit prüfen
- Path Traversal Schutz?
- Symlink-Ausbrüche möglich?
- Zugriffskontrolle auf Wiki-Verzeichnisse?
- WebDAV-Konflikte beachten?

### Schritt 4: Dokumentieren & Planen
Nach der Analyse erstelle:
- **Bestandsaufnahme:** Was existiert wirklich (nicht: was könnte)
- **Zielarchitektur:** Wie KI integriert werden sollte
- **Werkzeugkatalog:** Alle benötigten Funktionen (create_note, update_note, etc.)
- **Sicherheitskonzept:** Konkrete Maßnahmen (nicht abstrakt)
- **7-Phasen-Plan:** Detailliert ausgearbeitet mit Abhängigkeiten
- **Offene Fragen:** Was muss der Nutzer noch klären?
- **Risikoanalyse:** Technische Risiken identifizieren

**Wichtig:** Unterscheide zwischen:
- ✅ Nachweislich vorhanden
- ⚠️ Teilweise vorhanden
- ❌ Nicht vorhanden
- ❓ Geplant (aber noch nicht gebaut)

---

**Dein Ziel nach Phase 1:**
- Bestandsaufnahme (was existiert wirklich)
- Zielarchitektur (wie sollte KI integriert werden)
- Werkzeugkatalog (alle benötigten Funktionen)
- Sicherheitskonzept (konkrete Maßnahmen)
- Vollständiger Entwicklungsplan (7 Phasen ausgearbeitet)
- Offene Fragen (was muss der Nutzer klären)

---

**Warte dann auf Nutzer-Freigabe bevor du Phase 2 planst.**

Viel Erfolg! 🚀
