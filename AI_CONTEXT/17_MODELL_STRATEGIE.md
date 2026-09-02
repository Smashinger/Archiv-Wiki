# 17 – Modell-Strategie für Archiv-Wiki (OpenCode)

Stand: 2026-09-01 | Build-Modus aktiv
Basis: 3 Credentials aktiv (OpenAI oauth, Google api, Anthropic api)

## Grundregel
Standard: `anthropic/claude-sonnet-4-5` (festgelegt 2026-09-01).
Alle 3 Anbieter sind in OpenCode verfügbar. Wechsel jederzeit via `/model` in der TUI.
Anzeige unten hinkt 1 Prompt hinterher – nach dem nächsten Senden steht das neue Modell dort.

## Fallback wenn Claude Limit erreicht
1. Automatisch `openai/gpt-5.4` nehmen (gleich stark für Logik)
2. Falls auch OpenAI limitiert: `google/gemini-flash-latest` (schnell, für 80% reicht es)
3. Optional parallel: ChatGPT Codex (unlimitiert) für Vorarbeit nutzen, dann in OpenCode einbauen
Erkennung: Fehlermeldung `rate_limit` / `quota exceeded` -> sofort `/model openai/gpt-5.4`

## Welches Modell wofür

| Aufgabe | Empfohlenes Modell | Warum |
|---|---|---|
| **Analyse & Planung** (Code verstehen, Plan schreiben) | `anthropic/claude-sonnet-4-5` | Sehr stark für große Codebasen, Electron/JS, saubere Pläne |
| **Komplexe Logik / Refactoring / Architektur** | `openai/gpt-5.4` oder `anthropic/claude-opus-4-5` | Beste Code-Qualität, präzise Logik |
| **Schnelle Umsetzung / kleine Fixes / Markdown/UI** | `google/gemini-flash-latest` (= faktisch 3.7 Flash) | Schnell, günstig, ideal für 80% der Tasks |
| **Gegencheck / Review** | Das jeweils andere Modell (z.B. Planung mit Sonnet, Review mit GPT-5.4) | 2-Rollen-Prinzip: einer codet, einer prüft |
| **Kosten sparen / Bulk** | `google/gemini-flash-latest` oder lokal via Ollama | Für Massenänderungen, Tests |

## Hybrid mit ChatGPT Codex (aktuell ohne Limit)
- Codex (unlimitiert) für große Voranalysen / viele Varianten nutzen
- Ergebnis als kurzen Diff + Ziel hierher geben
- OpenCode baut es isoliert ein und testet mit `HOME="$PWD/.Codex-test-home" npm run dev`

## Workflow-Kurzform
1. Analyse (read-only) 2. Mini-Plan (Freigabe) 3. Code (Modell je Aufgabe) 4. Isolierter Test 5. Bericht + STOP

## Hinweis TUI-Auswahl
`opencode models` zeigt alle Modelle aus models.dev. Die TUI-Dropdown zeigt nur von Google für deinen Key freigeschaltete Modelle. `gemini-3.7-flash` = `gemini-flash-latest` nutzen.
