# Phase 2 Spezifikation: KI-Chat & UI-Grundgerüst

## 1. Übersicht & Ziel

In **Phase 2** wird die Grundlage für die lokale KI-Integration in Archiv-Wiki geschaffen:
- Direkte, lokale Kommunikation mit dem **Ollama-Server** (`http://127.0.0.1:11434`).
- Ein neues Topbar-Icon **`[🤖]`** zum Öffnen und Schließen des Chat-Panels.
- Ein **schwebendes, verschiebbares Chat-Panel** über dem Arbeitsbereich.
- Streaming-Antworten der KI in Echtzeit.
- Verwaltung der Chat-Historie (lokal gespeichert, maximal 50 Einträge, mit Lösch-Button).
- Neuer Reiter **„KI-Assistent“** im Einstellungsfenster inkl. Modell-Auswahl und Verbindungstest.
- Standard-Modell: **`phi:2.7b`** (leicht, schnell, lokal).

> [!IMPORTANT]
> **Abgrenzung für Phase 2:**
> In Phase 2 findet noch **kein Lese- oder Schreibzugriff auf Notizen** statt. Die KI fungiert hier als intelligenter, lokaler Chat-Partner. Werkzeuge für Notizsuche und Bearbeitung folgen in Phase 3 und 5.

---

## 2. Architektur & Prozessgrenzen

### 2.1 Warum die Ollama-Anbindung im Main-Prozess liegt
Die Content Security Policy (CSP) in `renderer/index.html` erzwingt `connect-src 'self';`. Ein direkter `fetch()`-Aufruf aus dem Renderer zu `http://127.0.0.1:11434` wird vom Chromium-Browserblocker abgewiesen.
Aus diesem Grund läuft sämtliche Netzwerkkommunikation mit Ollama im **Main-Prozess** (`main/ai-ollama.js` und `main/ai-ipc.js`). Der Renderer empfängt Daten und Streams ausschließlich über typsichere Electron-IPC-Kanäle.

### 2.2 Zu erstellende / anzupassende Dateien
1. **Neu:** `main/ai-ollama.js` — Reiner HTTP-Client für die Ollama REST-API (`GET /api/tags`, `POST /api/chat`).
2. **Neu:** `main/ai-history.js` — Persistenz der letzten max. 50 Chat-Nachrichten im lokalen Speicher (`app-state.js` oder eigene JSON-Datei).
3. **Neu:** `main/ai-ipc.js` — IPC-Handler für die Registrierung aller `ai:*`-Kanäle, Validierung der Argumente und Streaming-Koordination.
4. **Anpassen:** `main.js` — Import und Initialisierung von `main/ai-ipc.js`.
5. **Anpassen:** `preload.js` — Exponierung von `window.archivAPI.ai` über die isolierte `contextBridge`.
6. **Neu:** `renderer/js/ai-chat.js` — UI-Controller für das Chat-Panel (Öffnen, Schließen, Dragging, Markdown-Rendering, Auto-Scroll).
7. **Anpassen:** `renderer/index.html` — Hinzufügen des `[🤖]`-Buttons in die Titelleiste (`appTitlebarZone3`) und des Chat-Panel-Containers.
8. **Anpassen:** `renderer/css/components.css` (oder eigenes `renderer/css/ai-chat.css`) — Styling des Chat-Panels und der Sprechblasen.
9. **Anpassen:** `renderer/js/settings-window.js` — Neuer Einstellungs-Reiter `ai` in `SETTINGS_SECTIONS`.
10. **Neu:** `test/ai-ollama.test.js` — Automatisierte Unit-Tests mit Mock-Ollama-Server.

---

## 3. Exakte IPC-Schnittstellenspezifikation (`preload.js` & `main/ai-ipc.js`)

Alle Aufrufe werden im Main-Prozess mit Fail-Closed-Validierung geprüft.

### 3.1 `ai:checkConnection`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Parameter:** `{ host?: string }` *(optional; falls nicht übergeben, wird der in den Einstellungen konfigurierte Host verwendet)*
* **Rückgabe:**
  ```typescript
  {
    online: boolean;
    version?: string;
    latencyMs?: number;
    error?: string;
  }
  ```

### 3.2 `ai:getModels`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Parameter:** `{ host?: string }` *(optional)*
* **Rückgabe:**
  ```typescript
  {
    success: boolean;
    models: Array<{
      name: string;        // z. B. "phi:2.7b"
      size: number;        // in Bytes
      modified_at: string; // ISO-Datum
      parameter_size?: string;
    }>;
    error?: string;
  }
  ```

### 3.3 `ai:sendMessage`
* **Richtung:** Renderer ➔ Main (Invoke) & Main ➔ Renderer (Streaming-Events)
* **Parameter:**
  ```typescript
  {
    messageId: string; // Eindeutige UUID/Client-ID
    model?: string;    // Gewähltes Modell (Default: konfigurierter Standard, z. B. "phi:2.7b")
    text: string;     // Benutzereingabe
    options?: {
      temperature?: number; // 0.0 - 1.0 (Default: 0.7)
      contextSize?: number; // num_ctx (Default: 4096)
    }
  }
  ```
* **Streaming-Ereignisse (an `mainWindow.webContents.send`):**
  * `ai:stream-chunk`: `{ messageId: string, delta: string }`
  * `ai:stream-end`: `{ messageId: string, fullText: string, stats?: { evalCount?: number, totalDurationMs?: number } }`
  * `ai:stream-error`: `{ messageId: string, error: string, category: 'connection' | 'model_not_found' | 'context_overflow' | 'aborted' | 'unknown' }`
* **Invoke-Rückgabe:** `{ started: boolean, messageId: string }`

### 3.4 `ai:abort`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Parameter:** `{ messageId: string }`
* **Wirkung:** Bricht die laufende Anfrage an Ollama via `AbortController` sofort ab.
* **Rückgabe:** `{ aborted: boolean }`

### 3.5 `ai:getHistory`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Parameter:** Keine
* **Rückgabe:**
  ```typescript
  Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    model?: string;
  }>
  ```
  *(Maximal die letzten 50 Einträge, sortiert von alt nach neu).*

### 3.6 `ai:clearHistory`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Parameter:** Keine
* **Wirkung:** Löscht alle gespeicherten Nachrichten der Historie.
* **Rückgabe:** `{ success: boolean }`

### 3.7 `ai:getSettings` & `ai:updateSettings`
* **Richtung:** Renderer ➔ Main (Invoke)
* **Datenstruktur:**
  ```typescript
  {
    enabled: boolean;          // Default: true
    host: string;              // Default: "http://127.0.0.1:11434"
    defaultModel: string;      // Default: "phi:2.7b"
    temperature: number;       // Default: 0.7
    contextSize: number;       // Default: 4096
    persistHistory: boolean;   // Default: true (max 50)
  }
  ```

---

## 4. Ollama HTTP-Client Spezifikation (`main/ai-ollama.js`)

Modul nutzt Standard-Node-Module (`node:http` oder `node:https`, alternativ natives `fetch` ab Node 18).

### 4.1 Endpunkte
1. **Tags / Modelle auflisten:**
   * `GET /api/tags`
   * Timeout: 5.000 ms
2. **Chat-Generierung mit Streaming:**
   * `POST /api/chat`
   * Body:
     ```json
     {
       "model": "phi:2.7b",
       "messages": [
         {
           "role": "system",
           "content": "Du bist der integrierte KI-Assistent von Archiv-Wiki. Antworte stets präzise, sachlich, auf Deutsch und formatiere deine Antworten in sauberem Markdown."
         },
         {
           "role": "user",
           "content": "..."
         }
       ],
       "stream": true,
       "options": {
         "temperature": 0.7,
         "num_ctx": 4096
       }
     }
     ```
   * Parsing: Zeilenweiser NDJSON-Stream (`response.on('data')` mit Buffer-Split auf `\n`).
   * Extrahiert: `json.message.content` pro Chunk.

### 4.2 Fehler-Klassifizierung & Benutzer-Feedback
| Fehlerursache | HTTP / Systemfehler | Fehlerkategorie | Anwender-Meldung |
| :--- | :--- | :--- | :--- |
| Ollama läuft nicht | `ECONNREFUSED`, `ENOTFOUND` | `connection` | „Ollama ist nicht erreichbar. Bitte stelle sicher, dass Ollama lokal gestartet ist (`ollama serve`).“ |
| Modell fehlt | HTTP 404 (`model not found`) | `model_not_found` | „Das Modell ist nicht installiert. Führe im Terminal `ollama run <modell>` aus.“ |
| Anfrage abgebrochen | `AbortError` | `aborted` | „Antwort wurde gestoppt.“ |
| Timeout | `ETIMEDOUT` (> 30s ohne Daten) | `timeout` | „Zeitüberschreitung: Ollama hat nicht rechtzeitig geantwortet.“ |

---

## 5. UI & Layout-Spezifikation

### 5.1 Topbar-Icon `[🤖]`
* **Position:** In `renderer/index.html` innerhalb von `<div class="app-titlebar-zone3">`, direkt links neben dem Einstellungs-Button (`#titlebarSettingsBtn`).
* **HTML:**
  ```html
  <button class="app-titlebar-btn" id="titlebarAiChatBtn" type="button" title="KI-Assistent (Alt+A)" aria-label="KI-Assistent öffnen">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8.01" y2="16"/>
      <line x1="16" y1="16" x2="16.01" y2="16"/>
    </svg>
    <span class="ai-status-indicator" id="aiTopbarStatusDot"></span>
  </button>
  ```
* **Shortcut:** `Alt+A` schaltet das Chat-Panel ein/aus.

### 5.2 Schwebendes Chat-Panel (`#aiChatPanel`)
* **Verhalten:**
  * Floating Window über dem Editor.
  * Frei verschiebbar durch Ziehen an der Header-Leiste (`cursor: grab`).
  * Größenänderung an den Ecken/Kanten via CSS `resize: both; overflow: hidden;`.
  * Mindestgröße: 380 × 500 px. Standard: 440 × 620 px.
  * Koordinaten und Abmessungen werden in den App-Einstellungen gespeichert.
* **Header-Komponenten:**
  * Drag-Griff & Titel *„KI-Assistent“*
  * Kleiner Modell-Picker (`<select>` mit aktiven Ollama-Modellen)
  * History-Löschen-Icon (`[🗑]`)
  * Schließen-Button (`[×]`)
* **Nachrichten-Bereich:**
  * Nachrichten des Nutzers: Rechtsbündig, dezente Akzentfarbe.
  * Nachrichten des Assistenten: Linksbündig, gerendert via `marked` (Markdown) mit Syntax-Highlighting für Codeblöcke.
  * Während des Streamings: Sanfter Typing-Cursor (`▋`).
* **Eingabe-Bereich:**
  * Mehrzeiliges Auto-Growing Textfeld.
  * Senden mit `Enter`, neue Zeile mit `Shift+Enter`.
  * Sendeknopf `[▶]` schaltet während der Generierung auf Stoppknopf `[■]` um.

### 5.3 Einstellungs-Reiter *„KI-Assistent“*
In `renderer/js/settings-window.js`:
* **ID:** `ai`, **Label:** `KI-Assistent`, **Spalten:** 2.
* **Inhalt Spalte 1:**
  * Toggle: *KI-Assistent aktivieren*
  * Textfeld: *Ollama-Server URL* (`http://127.0.0.1:11434`)
  * Status-Pille + Button: *Verbindung testen*
* **Inhalt Spalte 2:**
  * Dropdown: *Standard-Modell* (Live-Abfrage der installierten Modelle)
  * Slider: *Temperatur* (`0.0` - `1.0`, Schritt `0.05`, Standard `0.7`)
  * Slider / Dropdown: *Kontext-Größe* (`2048`, `4096`, `8192`)
  * Schalter: *Chat-Verlauf lokal sichern (max. 50 Nachrichten)*
  * Gefahren-Button: *Gesamten Chatverlauf löschen*

---

## 6. Historien-Verwaltung (`main/ai-history.js`)

* **Kapazität:** Strikt maximal 50 Nachrichten.
* **Rotations-Prinzip:** FIFO (First In, First Out). Erreicht die Liste 51 Einträge, wird der älteste Eintrag verworfen.
* **Persistenz:** Gespeichert als JSON in der lokalen App-Konfiguration.
* **Datenschutz:** Enthält niemals Notizinhalte oder Dateipfade, solange diese nicht explizit vom Nutzer im Chat eingegeben wurden. Ein Klick auf *„Verlauf leeren“* löscht die Daten restlos.

---

## 7. Risikoanalyse für Phase 2

1. **Ollama läuft nicht beim Start:**
   * *Risiko:* Fehler-Popups blockieren den Benutzerfluss.
   * *Lösung:* Stiller Verbindungscheck. Wenn Ollama offline ist, zeigt das Panel eine saubere Hinweiskarte (*„Ollama nicht erreichbar“*) mit *„Erneut verbinden“*-Button.
2. **Streaming erzeugt IPC-Flaschenhals:**
   * *Risiko:* Sehr schnelle Modelle senden hunderte IPC-Nachrichten pro Sekunde.
   * *Lösung:* Chunks werden im Main-Prozess gesammelt und im 30-ms-Intervall gebündelt übertragen, falls Chunks zu schnell eintreffen.
3. **Verlust des Drag-Fokus bei schnellen Mausbewegungen:**
   * *Risiko:* Panel bleibt an der Maus kleben oder stoppt.
   * *Lösung:* Event-Listener für `pointermove` und `pointerup` auf `window` registrieren (analog zu bestehenden Split-Dividern in Archiv-Wiki).

---

## 8. Test- und Verifikationsplan (ohne aktives Ollama)

Für automatisierte Tests in `test/ai-ollama.test.js` erstellt Claude Code einen leichtgewichtigen **Mock-Ollama-Server** mit `node:http`:
1. **Test 1:** Abfrage von `/api/tags` liefert gültige Modell-Liste.
2. **Test 2:** Streaming von `/api/chat` emittiert korrekte Chunks und schließt mit `done: true`.
3. **Test 3:** Verbindungsfehler (`ECONNREFUSED`) wird sauber abgefangen und erzeugt eine benutzerfreundliche Fehlermeldung.
4. **Test 4:** Historien-Manager begrenzt Nachrichten strikt auf 50 Einträge.
5. **Test 5:** `ai:abort` bricht den laufenden HTTP-Stream sofort ab.

Alle Tests müssen via `npm test` mit 0 externen Abhängigkeiten grün durchlaufen.
