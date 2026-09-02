# 📙 Archiv-Wiki Human Interface Guidelines

---

# 1. Einleitung

Die Human Interface Guidelines beschreiben die gestalterischen und ergonomischen Grundsätze von Archiv-Wiki.

Während das Designsystem verbindliche Regeln definiert, erklären die Human Interface Guidelines den Hintergrund dieser Entscheidungen.

Sie richten sich an Entwickler, Designer und KI-Systeme.

Ihr Ziel ist es, nicht nur festzulegen, wie Archiv-Wiki aussieht, sondern warum bestimmte Gestaltungsentscheidungen getroffen wurden.

Dieses Dokument ergänzt das Designsystem.

Es ersetzt dieses nicht.

---

# Ziel

Archiv-Wiki soll sich wie ein hochwertiges Desktop-Werkzeug anfühlen.

Die Oberfläche soll den Nutzer bei seiner Arbeit unterstützen, ohne selbst im Mittelpunkt zu stehen.

Gute Gestaltung wird dabei nicht an möglichst vielen Funktionen gemessen.

Sie zeigt sich darin, dass der Nutzer möglichst wenig über die Benutzeroberfläche nachdenken muss.

Eine gute Oberfläche erklärt sich selbst.

Sie wirkt ruhig, konsistent und vorhersehbar.

---

# Für wen dieses Dokument gedacht ist

Dieses Dokument richtet sich an:

- Entwickler
- Designer
- KI-Systeme
- Mitwirkende am Projekt

Alle zukünftigen Änderungen an der Benutzeroberfläche sollen die hier beschriebenen Grundsätze berücksichtigen.

---

# Zuständigkeit und Verhältnis zu den anderen Design-Dokumenten

`02_DESIGN_GUIDELINES.md` beschreibt die allgemeinen visuellen Regeln und Designprinzipien. `14_DESIGNSYSTEM.md` beschreibt die strukturelle UI-Systematik und die Beziehungen der Oberflächenbereiche.

Diese Human Interface Guidelines beschreiben die dauerhaften Bedienprinzipien, das Interaktionsverhalten und die Nutzerführung: wie sich vorhandene Strukturen bedienen lassen, welches Feedback sie geben und warum diese Bedienmuster vorhersehbar bleiben sollen.

Die Detailbeschreibungen von Sidebar, Editor und Einstellungen verbleiben in `07_SIDEBAR.md`, `08_EDITOR.md` und `09_SETTINGS.md`. Dieses Dokument erzeugt keine konkurrierende zweite Beschreibung ihrer vollständigen Oberfläche.

---

# 2. Wahrnehmung

Benutzer nehmen eine Oberfläche nicht Element für Element wahr.

Das menschliche Gehirn erkennt zunächst große Strukturen, anschließend Gruppen und erst danach einzelne Details.

Eine gute Benutzeroberfläche berücksichtigt diese natürliche Wahrnehmung und unterstützt sie bewusst.

Archiv-Wiki orientiert sich deshalb nicht daran, möglichst viele Informationen gleichzeitig darzustellen, sondern sie in einer logischen Reihenfolge erfassbar zu machen.

---

# Das menschliche Gehirn sucht nach Ordnung

Innerhalb weniger Millisekunden versucht das Gehirn, eine Oberfläche zu strukturieren.

Es beantwortet unbewusst folgende Fragen:

Wo beginne ich?

↓

Was ist wichtig?

↓

Was gehört zusammen?

↓

Was kann ich tun?

↓

Was kann ich ignorieren?

Wenn diese Fragen ohne Nachdenken beantwortet werden können, wirkt eine Oberfläche intuitiv.

---

# Aufmerksamkeit ist begrenzt

Die Aufmerksamkeit des Nutzers ist eine begrenzte Ressource.

Jedes auffällige Element konkurriert mit allen anderen Elementen auf dem Bildschirm.

Deshalb besitzt Aufmerksamkeit einen hohen gestalterischen Wert.

Archiv-Wiki verwendet Aufmerksamkeit bewusst.

Nicht jede Funktion benötigt dieselbe Sichtbarkeit.

---

# Informationshierarchie

Der Nutzer soll niemals gezwungen sein, wichtige Informationen zwischen weniger wichtigen Informationen zu suchen.

Die Oberfläche vermittelt ihre Hierarchie durch:

- Position
- Größe
- Kontrast
- Abstand
- Gruppierung

Nicht durch möglichst viele Farben.

---

# Das Auge folgt einem natürlichen Weg

Während der Arbeit bewegt sich der Blick in einer vorhersehbaren Reihenfolge.

Zuerst wird die Orientierung wahrgenommen.

Anschließend das aktuelle Dokument.

Danach die Werkzeuge.

Erst anschließend werden Details betrachtet.

Archiv-Wiki unterstützt diese natürliche Blickführung.

Die Oberfläche führt den Blick.

Sie lenkt ihn nicht ab.

---

# Wiederholung erzeugt Sicherheit

Wiederkehrende Muster ermöglichen schnelles Arbeiten.

Der Nutzer entwickelt mit der Zeit ein räumliches Gedächtnis.

Dadurch weiß er bereits vor dem Hinschauen:

- wo sich Werkzeuge befinden
- wo Dokumentinformationen erscheinen
- wo Aktionen ausgeführt werden

Konsistenz reduziert dadurch den Denkaufwand erheblich.

---

# Weniger Entscheidungen bedeuten weniger Belastung

Jede zusätzliche Entscheidung kostet Aufmerksamkeit.

Eine gute Oberfläche reduziert unnötige Entscheidungen.

Beispiele:

Nicht mehrere Speicherbuttons.

Nicht verschiedene Toolbar-Konzepte.

Nicht wechselnde Dialoge.

Sondern ein konsistentes Bedienmodell.

---

# Ruhe entsteht durch Ordnung

Eine ruhige Oberfläche besitzt nicht weniger Funktionen.

Sie besitzt eine klarere Struktur.

Ordnung entsteht durch:

- Ausrichtung
- Abstand
- Hierarchie
- Wiederholung
- Konsistenz

Nicht durch große Freiflächen oder minimale Gestaltung.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki verfolgt das Ziel, den Inhalt möglichst schnell erfassbar zu machen.

Deshalb besitzt der Editor höchste Priorität.

Dokumentinformationen unterstützen den Inhalt.

Werkzeuge unterstützen den Arbeitsfluss.

Die Oberfläche tritt bewusst in den Hintergrund.

---

# Gute Beispiele

✓ Klar getrennte Funktionsbereiche

✓ Konsistente Werkzeuggruppen

✓ Einheitliche Abstände

✓ Wiederkehrende Muster

✓ Wenige Akzentfarben

---

# Schlechte Beispiele

✗ Gleich wichtige Darstellung aller Elemente

✗ Unterschiedliche Ausrichtungen

✗ Mehrere konkurrierende Blickfänge

✗ Zufällige Abstände

✗ Vermischung unterschiedlicher Funktionen

---

# Merksätze

- Das Gehirn sucht zuerst Ordnung.
- Aufmerksamkeit ist begrenzt.
- Gute Hierarchie reduziert Denkaufwand.
- Wiederholung schafft Sicherheit.
- Ordnung ist wichtiger als Dekoration.

---

# 3. Kognitive Belastung

Eine Benutzeroberfläche sollte möglichst wenig geistige Energie vom Nutzer verlangen.

Jede Entscheidung, jede Suche und jede Interpretation kostet Aufmerksamkeit.

Das Ziel einer guten Benutzeroberfläche besteht deshalb nicht darin, möglichst viele Informationen bereitzustellen, sondern den Denkaufwand während der Arbeit so gering wie möglich zu halten.

Archiv-Wiki unterstützt den Nutzer dabei, sich auf seine Inhalte zu konzentrieren.

Die Benutzeroberfläche arbeitet im Hintergrund.

---

# Was ist kognitive Belastung?

Kognitive Belastung beschreibt die geistige Anstrengung, die notwendig ist, um eine Aufgabe zu verstehen oder auszuführen.

Je mehr Informationen gleichzeitig verarbeitet werden müssen, desto höher wird diese Belastung.

Eine hohe kognitive Belastung führt zu:

- langsamerem Arbeiten
- häufigeren Fehlern
- schnellerer Ermüdung
- Unsicherheit
- Frustration

Eine gute Benutzeroberfläche reduziert diese Belastung bewusst.

---

# Erkennen statt Nachdenken

Menschen erkennen Informationen deutlich schneller, als sie diese bewusst suchen oder interpretieren.

Eine gute Oberfläche sorgt deshalb dafür, dass Funktionen sofort erkannt werden können.

Der Nutzer sollte möglichst selten überlegen müssen:

- Wo befindet sich diese Funktion?
- Ist das ein Button?
- Gehört diese Information zum Dokument?
- Ist das eine Aktion oder nur eine Information?

Je weniger solche Fragen entstehen, desto angenehmer fühlt sich die Anwendung an.

---

# Entscheidungen kosten Energie

Jede zusätzliche Entscheidung beansprucht Aufmerksamkeit.

Deshalb gilt:

Nicht jede Funktion muss ständig sichtbar sein.

Nicht jede Funktion benötigt denselben Stellenwert.

Häufig verwendete Funktionen erhalten einen festen Platz.

Selten genutzte Funktionen dürfen in Menüs oder Dialogen untergebracht werden.

---

# Informationsgruppen

Das Gehirn verarbeitet Gruppen deutlich schneller als einzelne Elemente.

Zusammengehörige Informationen sollen deshalb immer gemeinsam erscheinen.

Beispiele:

Dokumentinformationen

↓

Titel

Tags

Beziehungen

Werkzeuge

↓

Formatierung

Listen

Links

Tabellen

Der Nutzer erkennt dadurch Zusammenhänge unmittelbar.

---

# Konkurrenz um Aufmerksamkeit

Jedes auffällige Element konkurriert mit allen anderen Elementen auf dem Bildschirm.

Mehr Aufmerksamkeit bedeutet nicht automatisch bessere Bedienbarkeit.

Wenn mehrere Elemente gleichzeitig hervorgehoben werden, verliert jedes einzelne an Bedeutung.

Archiv-Wiki verwendet Aufmerksamkeit daher bewusst und sparsam.

---

# Weniger bedeutet nicht weniger Funktion

Eine ruhige Oberfläche besitzt nicht weniger Möglichkeiten.

Sie präsentiert diese lediglich besser.

Funktionen werden:

- logisch gruppiert
- sinnvoll priorisiert
- bei Bedarf eingeblendet
- eindeutig voneinander getrennt

Dadurch wirkt die Anwendung ruhiger, obwohl der Funktionsumfang unverändert bleibt.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki soll den Nutzer möglichst schnell zum Schreiben bringen.

Werkzeuge unterstützen diesen Prozess.

Sie sollen niemals den Eindruck vermitteln, wichtiger zu sein als das eigentliche Dokument.

Jede Änderung wird deshalb darauf geprüft, ob sie:

- den Arbeitsfluss verbessert
- zusätzliche Entscheidungen vermeidet
- Informationen klarer strukturiert
- die Aufmerksamkeit sinnvoll lenkt

---

# Gute Beispiele

✓ Klare Werkzeuggruppen

✓ Einheitliche Positionen

✓ Wenige Primäraktionen

✓ Dokumentinformationen an einem festen Ort

✓ Vorhersehbare Navigation

---

# Schlechte Beispiele

✗ Zu viele gleich wichtige Buttons

✗ Mehrere konkurrierende Blickfänge

✗ Unterschiedliche Bedienkonzepte

✗ Versteckte oder schwer auffindbare Funktionen

✗ Unklare Gruppierungen

---

# Merksätze

- Aufmerksamkeit ist begrenzt.
- Jede Entscheidung kostet Energie.
- Erkennen ist besser als Suchen.
- Gruppen reduzieren Denkaufwand.
- Weniger Belastung bedeutet produktiveres Arbeiten.

---

# 4. Gestaltgesetze

Die Gestaltgesetze beschreiben, wie das menschliche Gehirn visuelle Informationen automatisch organisiert.

Menschen nehmen Benutzeroberflächen nicht als einzelne Elemente wahr.

Sie erkennen Muster, Gruppen und Zusammenhänge.

Archiv-Wiki nutzt diese natürlichen Wahrnehmungsmechanismen bewusst, um Orientierung zu schaffen und die kognitive Belastung zu reduzieren.

---

# Warum Gestaltgesetze wichtig sind

Das Gehirn versucht innerhalb weniger Millisekunden Ordnung zu schaffen.

Es verbindet automatisch Elemente miteinander, wenn diese ähnlich aussehen oder nah beieinander liegen.

Eine gute Benutzeroberfläche nutzt diese Eigenschaften.

Eine schlechte Oberfläche arbeitet dagegen.

---

# Gesetz der Nähe

Elemente, die räumlich nah beieinander liegen, werden automatisch als zusammengehörig wahrgenommen.

Archiv-Wiki verwendet Nähe zur Gruppierung von:

- Werkzeugen
- Dokumentinformationen
- Navigation
- Statusinformationen

Nicht zusammengehörige Bereiche besitzen bewusst größere Abstände.

Abstände sind daher ein Gestaltungsmittel und kein Zufallsprodukt.

---

# Gesetz der Ähnlichkeit

Elemente mit gleichem Aussehen werden als zusammengehörig interpretiert.

Deshalb besitzen innerhalb Archiv-Wiki:

- Buttons dieselbe Form
- Icons denselben Stil
- Tags dieselbe Gestaltung
- Dialoge dieselbe Struktur

Eine unterschiedliche Gestaltung derselben Funktion erzeugt Unsicherheit.

---

# Gesetz der Kontinuität

Das Auge folgt bevorzugt geraden Linien und klaren Ausrichtungen.

Archiv-Wiki richtet deshalb Komponenten an gemeinsamen vertikalen und horizontalen Achsen aus.

Unnötige Sprünge oder versetzte Elemente werden vermieden.

Dadurch entsteht Ruhe.

---

# Gesetz der Geschlossenheit

Das Gehirn ergänzt unvollständige Formen automatisch.

Deshalb müssen Bereiche nicht immer durch sichtbare Rahmen getrennt werden.

Oft reichen:

- Abstand
- Hintergrund
- Ausrichtung

um eine Gruppe eindeutig erkennbar zu machen.

Archiv-Wiki verwendet deshalb möglichst wenige dekorative Rahmen.

---

# Gesetz der gemeinsamen Region

Elemente innerhalb eines gemeinsamen Bereiches werden als zusammengehörig wahrgenommen.

Panels, Dialoge oder Gruppen dienen deshalb einer klaren funktionalen Trennung.

Zusätzliche Container werden jedoch nur verwendet, wenn sie die Orientierung tatsächlich verbessern.

---

# Figur und Hintergrund

Der Nutzer muss jederzeit erkennen:

Was ist Inhalt?

Was ist Oberfläche?

Der Inhalt besitzt immer Vorrang.

Die Benutzeroberfläche tritt bewusst in den Hintergrund.

Dadurch entsteht der Eindruck eines ruhigen Arbeitsplatzes.

---

# Bedeutung für Archiv-Wiki

Alle zukünftigen Layoutentscheidungen berücksichtigen die Gestaltgesetze.

Besonders wichtig sind:

- Werkzeuggruppen
- Sidebar
- Editor Workspace
- Dashboard
- Einstellungen

Nicht dekorative Gestaltung erzeugt Ordnung.

Sondern die bewusste Anwendung dieser Prinzipien.

---

# Gute Beispiele

✓ Werkzeuggruppen mit einheitlichen Abständen

✓ Gemeinsame Ausrichtung aller Überschriften

✓ Klar erkennbare Dokumentinformationen

✓ Einheitliche Buttongruppen

✓ Gemeinsame Panels

---

# Schlechte Beispiele

✗ Zufällige Abstände

✗ Unterschiedliche Buttonformen

✗ Versetzte Ausrichtungen

✗ Übermäßige Rahmen

✗ Viele kleine Einzelgruppen

---

# Merksätze

- Nähe erzeugt Zusammengehörigkeit.
- Ähnlichkeit erzeugt Wiedererkennung.
- Ausrichtung erzeugt Ruhe.
- Abstand ist ein Gestaltungsmittel.
- Der Inhalt bleibt die Figur, die Oberfläche bildet den Hintergrund.

---

# 5. Fitts's Law

Fitts's Law beschreibt den Zusammenhang zwischen der Größe eines Bedienelements, seiner Entfernung und der Zeit, die benötigt wird, um dieses Ziel zu erreichen.

Je größer ein Ziel ist und je näher es sich befindet, desto schneller und sicherer kann es angeklickt werden.

Dieses Prinzip beeinflusst nahezu jede professionelle Desktop-Anwendung.

---

# Warum Fitts's Law wichtig ist

Während der täglichen Arbeit werden dieselben Funktionen häufig hunderte Male verwendet.

Schon kleine Unterschiede in der Erreichbarkeit summieren sich über längere Zeit zu einer deutlich besseren oder schlechteren Benutzererfahrung.

Eine gute Oberfläche reduziert unnötige Mausbewegungen.

---

# Kurze Mauswege

Häufig verwendete Funktionen befinden sich möglichst nah am Arbeitsbereich.

Der Nutzer soll seine Aufmerksamkeit möglichst selten vom eigentlichen Inhalt lösen müssen.

Werkzeuge werden deshalb bevorzugt in unmittelbarer Nähe des Editors platziert.

Nicht in weit entfernten Menüs.

---

# Große Ziele

Bedienelemente müssen ausreichend groß sein, damit sie sicher getroffen werden können.

Zu kleine Klickflächen führen zu:

- Fehlklicks
- Frustration
- langsamerem Arbeiten

Die Größe eines Bedienelements richtet sich nach seiner Nutzungshäufigkeit.

Nicht nach seiner optischen Wirkung.

---

# Häufigkeit bestimmt Position

Nicht jede Funktion besitzt dieselbe Bedeutung.

Deshalb gilt:

Häufig verwendete Funktionen

↓

leicht erreichbar

Selten verwendete Funktionen

↓

dürfen weiter entfernt liegen

oder

in Menüs untergebracht werden.

---

# Nähe zum Arbeitsbereich

Werkzeuge sollen möglichst nahe an der Stelle liegen, an der sie benötigt werden.

Beispiele:

Editor

↓

Toolbar

↓

Dokument

Nicht:

Editor

↓

großer Mausweg

↓

Werkzeug

↓

großer Mausweg zurück

---

# Bildschirmränder

Die Ränder eines Bildschirms stellen besonders leicht erreichbare Ziele dar.

Desktop-Betriebssysteme nutzen diesen Effekt beispielsweise:

- Taskleisten
- Menüleisten
- Dock

Archiv-Wiki berücksichtigt diese Eigenschaft bei dauerhaft sichtbaren Bereichen.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki unterstützt lange Arbeitssitzungen.

Kurze Mauswege reduzieren dabei die körperliche Belastung.

Besonders wichtig sind:

- Sidebar
- Editor Workspace
- Toolbar
- Kontextmenüs

Häufig genutzte Funktionen sollen möglichst wenige Mausbewegungen erfordern.

---

# Gute Beispiele

✓ Toolbar direkt über dem Editor

✓ Kontextmenü in Mausnähe

✓ Große Klickflächen

✓ Gut erreichbare Hauptaktionen

---

# Schlechte Beispiele

✗ Kleine Icons ohne ausreichende Klickfläche

✗ Häufig benötigte Funktionen tief in Menüs

✗ Lange Mauswege zwischen Editor und Werkzeugen

✗ Viele kleine Bedienelemente dicht nebeneinander

---

# Merksätze

- Häufig genutzte Funktionen gehören in Reichweite.
- Große Ziele sind schneller erreichbar.
- Kurze Mauswege erhöhen die Produktivität.
- Die Position einer Funktion ist wichtiger als ihre Farbe.

---

# 6. Hick's Law

Hick's Law beschreibt den Zusammenhang zwischen der Anzahl möglicher Entscheidungen und der Zeit, die ein Nutzer benötigt, um eine Auswahl zu treffen.

Je mehr gleichwertige Optionen gleichzeitig angeboten werden, desto länger dauert die Entscheidung.

Eine gute Benutzeroberfläche reduziert deshalb unnötige Auswahlmöglichkeiten und strukturiert komplexe Funktionen sinnvoll.

Archiv-Wiki nutzt dieses Prinzip, um die Benutzeroberfläche übersichtlich und effizient zu halten.

---

# Warum Hick's Law wichtig ist

Der Nutzer möchte seine eigentliche Aufgabe erledigen.

Nicht die Benutzeroberfläche analysieren.

Jede zusätzliche Auswahl erhöht die geistige Belastung.

Je schneller eine Entscheidung getroffen werden kann, desto flüssiger fühlt sich die Arbeit an.

---

# Weniger Auswahl bedeutet mehr Geschwindigkeit

Eine große Anzahl gleichzeitig sichtbarer Optionen wirkt zunächst leistungsfähig.

In der Praxis führt sie jedoch häufig zu:

- längerer Orientierung
- Unsicherheit
- langsameren Entscheidungen
- höherer geistiger Belastung

Archiv-Wiki bevorzugt deshalb wenige klar erkennbare Optionen.

---

# Gruppierung statt Aufzählung

Viele Funktionen werden nicht entfernt.

Sie werden sinnvoll gruppiert.

Beispiel:

Statt:

- Fett
- Kursiv
- Unterstrichen
- Durchgestrichen
- Code
- Zitat
- Tabelle
- Link
- Bild
- Emoji
- ...

werden Werkzeuge in logische Gruppen eingeteilt.

Dadurch verarbeitet das Gehirn zunächst wenige Gruppen und erst danach einzelne Werkzeuge.

---

# Priorisierung

Nicht jede Funktion besitzt dieselbe Bedeutung.

Häufig verwendete Funktionen erhalten eine höhere Sichtbarkeit.

Selten verwendete Funktionen können:

- in vorhandenen, klar zugeordneten Menüs oder Untermenüs
- in Kontextmenüs
- in Dialogen

untergebracht werden.

---

# Progressive Offenlegung

Komplexität wird nicht entfernt.

Sie wird schrittweise sichtbar gemacht.

Der Nutzer sieht zunächst nur das, was für die aktuelle Aufgabe notwendig ist.

Weitere Funktionen erscheinen erst dann, wenn sie benötigt werden.

Dadurch bleibt die Oberfläche ruhig.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki wächst kontinuierlich.

Mit jeder neuen Funktion steigt die Gefahr einer überladenen Oberfläche.

Vor jeder neuen Funktion wird deshalb geprüft:

- Ist diese Funktion häufig notwendig?
- Gehört sie in die Hauptoberfläche?
- Kann sie sinnvoll gruppiert werden?
- Ist ein Menü besser geeignet?

Nicht jede neue Funktion benötigt einen eigenen Button.

---

# Gute Beispiele

✓ Werkzeuggruppen

✓ Vorhandene Kontextmenüs oder Dialoge für passend zugeordnete seltene Aktionen

✓ Kontextabhängige Funktionen

✓ Klare Priorisierung

✓ Wenige Primäraktionen

---

# Schlechte Beispiele

✗ Zwanzig gleich wichtige Buttons

✗ Mehrere Werkzeugleisten

✗ Gleichzeitige Darstellung aller Optionen

✗ Viele unterschiedliche Primäraktionen

✗ Mehrere Speicherfunktionen

---

# Praxisbeispiel

Situation:

Der Editor erhält immer mehr Funktionen.

Analyse:

Alle Werkzeuge werden dauerhaft sichtbar.

Folge:

Die Orientierung dauert länger.

Neue Nutzer fühlen sich schneller überfordert.

Lösung:

Werkzeuge logisch gruppieren.

Selten genutzte Funktionen in Menüs verschieben.

Die wichtigsten Werkzeuge sichtbar lassen.

UX-Prinzip:

Hick's Law

---

# Merksätze

- Jede Entscheidung kostet Zeit.
- Weniger gleichzeitige Auswahl erhöht die Geschwindigkeit.
- Gruppen sind schneller erfassbar als lange Listen.
- Nicht jede Funktion braucht einen eigenen Button.
- Komplexität wird organisiert, nicht versteckt.

---

# 7. Jakob's Law

Jakob's Law beschreibt die Erwartung von Nutzern, dass sich eine Anwendung ähnlich verhält wie andere bekannte Anwendungen.

Menschen verbringen täglich viele Stunden mit unterschiedlichen Programmen.

Sie entwickeln dadurch feste Erwartungen an Navigation, Werkzeuge und Bedienabläufe.

Eine gute Benutzeroberfläche nutzt diese vorhandenen Erfahrungen.

Sie zwingt den Nutzer nicht dazu, neue Bedienkonzepte zu erlernen.

Archiv-Wiki orientiert sich deshalb bewusst an etablierten Desktop-Mustern, sofern diese den Arbeitsfluss unterstützen.

---

# Warum Jakob's Law wichtig ist

Jeder Nutzer bringt bereits Erfahrung mit.

Beispiele:

- Dateimanager
- IDEs
- Browser
- Office-Anwendungen
- Markdown-Editoren

Diese Erfahrungen bilden ein mentales Modell.

Wenn Archiv-Wiki dieses Modell unterstützt, fühlt sich die Anwendung sofort vertraut an.

---

# Bekanntes Verhalten

Bekannte Funktionen sollen sich erwartungsgemäß verhalten.

Beispiele:

Strg + S

↓

Speichern

Strg + F

↓

Suchen

Rechtsklick

↓

Kontextmenü

Doppelklick

↓

Öffnen oder Bearbeiten

Drag & Drop

↓

Verschieben

Der Nutzer sollte vorhandenes Wissen weiterverwenden können.

---

# Innovation mit Bedacht

Archiv-Wiki darf neue Ideen einführen.

Diese dürfen jedoch niemals grundlegende Bedienmuster ersetzen.

Innovation ergänzt Bekanntes.

Sie ersetzt Bekanntes nicht.

Neue Konzepte müssen einen klaren Mehrwert besitzen.

---

# Konsistente Bedienung

Ein einmal erlerntes Verhalten gilt überall innerhalb der Anwendung.

Beispiele:

Ein Button verhält sich überall gleich.

Ein Dialog öffnet sich immer auf dieselbe Weise.

Werkzeugleisten besitzen dieselbe Struktur.

Der Nutzer muss Bedienkonzepte nur einmal lernen.

---

# Desktop-Konventionen

Archiv-Wiki orientiert sich an bewährten Desktop-Konventionen.

Dazu gehören unter anderem:

- Fenster
- Dialoge
- Kontextmenüs
- Tastaturkürzel
- Werkzeugleisten
- Statusleisten
- Navigation

Diese Konventionen werden bewusst übernommen.

---

# Wann Archiv-Wiki davon abweichen darf

Eine Abweichung ist nur gerechtfertigt, wenn sie nachweislich:

- den Arbeitsfluss verbessert
- die Bedienung vereinfacht
- Fehler reduziert
- schneller erlernbar ist

Reine Designtrends sind kein ausreichender Grund.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki entwickelt eine eigene Identität.

Diese entsteht jedoch nicht durch ungewöhnliche Bedienkonzepte.

Sondern durch:

- ruhige Gestaltung
- hohe Konsistenz
- effiziente Arbeitsabläufe
- klare Informationsarchitektur

Der Nutzer soll sich sofort zurechtfinden.

Nicht weil Archiv-Wiki wie jede andere Anwendung aussieht.

Sondern weil bekannte Prinzipien sinnvoll genutzt werden.

---

# Gute Beispiele

✓ Standard-Tastaturkürzel

✓ Erwartbare Kontextmenüs

✓ Bekannte Symbolik

✓ Vorhersehbares Drag & Drop

✓ Einheitliche Dialoge

---

# Schlechte Beispiele

✗ Eigene Tastenkürzel ohne Grund

✗ Ungewöhnliche Navigation

✗ Mehrdeutige Icons

✗ Versteckte Hauptfunktionen

✗ Unterschiedliche Bedienkonzepte

---

# Praxisbeispiel

Situation:

Eine neue Toolbar wird entworfen.

Analyse:

Einige Werkzeuge sollen ungewöhnlich angeordnet werden, um sich von anderen Editoren zu unterscheiden.

Folge:

Der Nutzer muss bekannte Arbeitsabläufe neu lernen.

Lösung:

Bekannte Gruppen beibehalten.

Verbesserungen innerhalb der bestehenden Struktur entwickeln.

UX-Prinzip:

Jakob's Law

---

# Merksätze

- Nutzer bringen Erfahrung mit.
- Bekanntes Verhalten reduziert Lernaufwand.
- Innovation ergänzt Bekanntes.
- Konsistenz schafft Vertrauen.
- Gute Software fühlt sich sofort vertraut an.

---

# 8. Progressive Disclosure

Progressive Disclosure beschreibt das Prinzip, Informationen und Funktionen schrittweise bereitzustellen.

Der Nutzer sieht zunächst nur die Elemente, die für seine aktuelle Aufgabe notwendig sind.

Weitere Informationen oder Funktionen werden erst sichtbar, wenn sie tatsächlich benötigt werden.

Archiv-Wiki nutzt dieses Prinzip bewusst, um eine ruhige und übersichtliche Arbeitsumgebung zu schaffen.

Komplexität wird dabei nicht entfernt.

Sie wird sinnvoll organisiert.

---

# Warum Progressive Disclosure wichtig ist

Moderne Anwendungen besitzen häufig einen großen Funktionsumfang.

Werden alle Funktionen gleichzeitig dargestellt, entsteht schnell eine überladene Oberfläche.

Der Nutzer muss:

- mehr Informationen verarbeiten
- länger suchen
- häufiger Entscheidungen treffen

Dies erhöht die kognitive Belastung.

Eine schrittweise Offenlegung reduziert diese Belastung erheblich.

---

# Komplexität ist nicht das Problem

Nicht der Funktionsumfang entscheidet über die Qualität einer Oberfläche.

Entscheidend ist,

wann

und

wie

Funktionen sichtbar werden.

Eine umfangreiche Anwendung kann einfach wirken,

wenn sie den Nutzer nicht gleichzeitig mit allen Möglichkeiten konfrontiert.

---

# Priorisierung

Archiv-Wiki unterscheidet zwischen:

Primären Funktionen

↓

werden dauerhaft angezeigt

Sekundären Funktionen

↓

erscheinen bei Bedarf

Erweiterten Funktionen

↓

werden über Menüs oder Dialoge geöffnet

Diese Priorisierung sorgt für einen ruhigen Arbeitsbereich.

---

# Sichtbarkeit nach Nutzung

Häufig verwendete Funktionen bleiben sichtbar.

Selten genutzte Funktionen dürfen verborgen werden,

solange sie leicht auffindbar bleiben.

Verstecken bedeutet niemals:

schwer erreichbar.

---

# Kontextabhängige Funktionen

Viele Funktionen werden erst relevant,

wenn der Nutzer sich in einer bestimmten Situation befindet.

Beispiele:

Eine Tabellenfunktion wird erst interessant,

wenn mit Tabellen gearbeitet wird.

Ein Markdown-Hilfsdialog wird erst benötigt,

wenn Hilfe gewünscht ist.

Archiv-Wiki bevorzugt kontextabhängige Werkzeuge gegenüber dauerhaft sichtbaren Bedienelementen.

---

# Dialoge und Menüs

Dialoge und Menüs dienen dazu,

Komplexität aus dem Hauptarbeitsbereich auszulagern.

Sie ersetzen keine häufig benötigten Werkzeuge.

Sie ergänzen diese.

Objektbezogene Kontextmenüs, insbesondere im Wiki-Baum, sind gleichwertig per Maus und Tastatur erreichbar: per Rechtsklick sowie am fokussierten Element mit `Shift+F10` oder der Kontextmenü-Taste. Beim Öffnen wechselt der Fokus in das Menü; Pfeiltasten sowie Home/End navigieren, Enter oder Leertaste führen eine Aktion aus und Escape schließt das Menü mit Rückkehr zum auslösenden Element. Damit bleibt keine Kontextaktion eine versteckte Nur-Maus-Bedienung. Die Sidebar-Details stehen in `07_SIDEBAR.md`.

---

# Bedeutung für Archiv-Wiki

Der Editor besitzt höchste Priorität.

Die Benutzeroberfläche unterstützt den Schreibprozess.

Nicht jede Funktion benötigt deshalb einen dauerhaften Platz im Workspace.

Vor jeder neuen Funktion wird geprüft:

- Wird sie häufig verwendet?
- Ist sie während des Schreibens notwendig?
- Reicht ein Menü?
- Reicht ein Kontextmenü?
- Reicht ein Dialog?

Erst danach wird entschieden,

ob eine dauerhafte Darstellung sinnvoll ist.

---

# Gute Beispiele

✓ Erweiterte Einstellungen in einem Dialog

✓ Seltene objektbezogene Aktionen im vorhandenen Kontextmenü

✓ Kontextmenüs für objektbezogene Funktionen

✓ Werkzeuge nur dort anzeigen, wo sie benötigt werden

✓ Erweiterte Optionen einklappbar gestalten

---

# Schlechte Beispiele

✗ Jede Funktion dauerhaft sichtbar

✗ Mehrere Werkzeugleisten

✗ Große Einstellungsdialoge ohne Struktur

✗ Seltene Funktionen als Hauptbuttons

✗ Zusätzliche Buttons für Ausnahmefälle

---

# Praxisbeispiel

Situation:

Der Editor erhält immer neue Funktionen.

Analyse:

Jede neue Funktion bekommt einen eigenen Button.

Folge:

Der Workspace wirkt überladen.

Neue Nutzer verlieren schneller die Orientierung.

Lösung:

Nur häufig genutzte Funktionen bleiben dauerhaft sichtbar.

Seltene Funktionen werden sinnvoll gruppiert oder ausgelagert.

UX-Prinzip:

Progressive Disclosure

---

# Merksätze

- Nicht alles muss gleichzeitig sichtbar sein.
- Komplexität wird organisiert.
- Häufiges bleibt sichtbar.
- Seltenes wird ausgelagert.
- Eine ruhige Oberfläche besitzt oft genauso viele Funktionen.

---

# 9. Visuelle Balance

Visuelle Balance beschreibt das harmonische Zusammenspiel aller Elemente einer Benutzeroberfläche.

Eine ausgewogene Oberfläche wirkt ruhig, hochwertig und vertrauenswürdig.

Der Nutzer nimmt diese Balance meist unbewusst wahr.

Fehlt sie, entsteht häufig das Gefühl, dass etwas „nicht stimmt“, obwohl einzelne Komponenten für sich betrachtet korrekt gestaltet sind.

Archiv-Wiki betrachtet visuelle Balance deshalb als grundlegenden Bestandteil der Benutzererfahrung.

---

# Warum visuelle Balance wichtig ist

Menschen beurteilen eine Oberfläche innerhalb weniger Sekunden.

Noch bevor Inhalte gelesen werden, entsteht ein erster Eindruck.

Das Gehirn bewertet dabei unbewusst:

- Ordnung
- Symmetrie
- Gewicht
- Ausrichtung
- Proportionen

Eine ausgewogene Oberfläche vermittelt Ruhe.

Eine unausgewogene Oberfläche erzeugt Spannung und Unruhe.

---

# Visuelles Gewicht

Nicht jedes Element besitzt dasselbe visuelle Gewicht.

Das Gewicht entsteht unter anderem durch:

- Größe
- Farbe
- Kontrast
- Form
- Abstand
- Position

Ein großer Button besitzt mehr Gewicht als ein kleiner.

Eine orange Fläche besitzt mehr Gewicht als eine graue.

Fetter Text besitzt mehr Gewicht als normaler Text.

Archiv-Wiki verteilt dieses Gewicht bewusst.

---

# Gleichgewicht

Visuelle Balance bedeutet nicht,

dass beide Seiten identisch aussehen.

Balance bedeutet,

dass sich das gesamte Layout ausgeglichen anfühlt.

Ein großer Titel kann beispielsweise mehrere kleine Buttons ausgleichen.

Ein breiter Editor kann eine schmale Sidebar ausgleichen.

Balance entsteht durch das Gesamtbild.

---

# Weißraum besitzt Gewicht

Leerer Raum ist kein verschwendeter Platz.

Weißraum schafft:

- Orientierung
- Struktur
- Ruhe

Zu wenig Abstand führt zu einem gedrängten Eindruck.

Zu viel Abstand lässt Bereiche voneinander getrennt wirken.

Archiv-Wiki sucht bewusst den Mittelweg.

---

# Ausrichtung erzeugt Qualität

Gemeinsame Ausrichtungslinien gehören zu den wichtigsten Merkmalen professioneller Software.

Elemente,

die dieselbe Aufgabe besitzen,

sollen sich an denselben Achsen orientieren.

Bereits wenige Pixel Unterschied können dazu führen,

dass eine Oberfläche unruhig wirkt.

---

# Rhythmus

Wiederkehrende Abstände erzeugen einen visuellen Rhythmus.

Der Nutzer erkennt dadurch unbewusst,

welche Bereiche zusammengehören.

Archiv-Wiki verwendet deshalb möglichst wenige unterschiedliche Abstände.

Ein konsistenter Rhythmus wirkt hochwertiger

als viele individuell gewählte Werte.

---

# Dominanz

Nicht alle Bereiche dürfen gleichzeitig Aufmerksamkeit verlangen.

Der Nutzer soll sofort erkennen,

welcher Bereich aktuell wichtig ist.

Grundsätzlich gilt:

Editor

↓

Dokument

↓

Werkzeuge

↓

Navigation

↓

Status

Diese Reihenfolge bestimmt die visuelle Gewichtung.

---

# Überladung

Eine Oberfläche wirkt überladen,

wenn mehrere Elemente gleichzeitig Aufmerksamkeit verlangen.

Typische Ursachen:

- viele Primärbuttons
- viele Farben
- unterschiedliche Buttongrößen
- viele Rahmen
- unterschiedliche Iconstile
- wechselnde Ausrichtungen

Archiv-Wiki vermeidet diese Konkurrenz bewusst.

---

# Kompaktheit

Kompakt bedeutet nicht,

möglichst wenig Abstand.

Kompakt bedeutet,

möglichst viele Informationen

ruhig

geordnet

und gut erfassbar

darzustellen.

Eine dichte Oberfläche kann sehr ruhig wirken,

wenn ihre Informationsarchitektur stimmt.

---

# Bedeutung für Archiv-Wiki

Jede neue Oberfläche wird auch unter dem Gesichtspunkt

der visuellen Balance bewertet.

Nicht jede Verbesserung entsteht durch:

- kleinere Buttons
- weniger Abstand
- mehr Funktionen

Oft entsteht Qualität dadurch,

dass bestehende Elemente

besser zueinander ausgerichtet werden.

---

# Gute Beispiele

✓ Gemeinsame Ausrichtung aller Bereiche

✓ Konsistente Abstände

✓ Ruhige Werkzeuggruppen

✓ Ausgewogene Verteilung des visuellen Gewichts

✓ Klar erkennbare Dominanz des Editors

---

# Schlechte Beispiele

✗ Viele unterschiedlich große Buttons

✗ Große leere Bereiche neben dicht gepackten Bereichen

✗ Versetzte Ausrichtungen

✗ Mehrere konkurrierende Blickfänge

✗ Unterschiedliche Abstände ohne erkennbares System

---

# Praxisbeispiel

Situation:

Der Header enthält alle benötigten Funktionen.

Trotzdem wirkt die Oberfläche gedrängt.

Analyse:

Nicht die Anzahl der Funktionen ist das Problem.

Sondern:

- ungleichmäßige Abstände
- unterschiedliche Höhen
- mehrere dominante Bereiche
- fehlende gemeinsame Achsen

Lösung:

Funktionen logisch gruppieren.

Gemeinsame Ausrichtungen herstellen.

Visuelles Gewicht gleichmäßig verteilen.

Erst danach Abstände oder Größen verändern.

UX-Prinzip:

Visuelle Balance

---

# Merksätze

- Balance entsteht durch das Gesamtbild.
- Gleichgewicht ist wichtiger als Symmetrie.
- Weißraum besitzt Funktion.
- Gemeinsame Achsen erzeugen Ruhe.
- Kompakt bedeutet nicht gedrängt.
- Der Editor bleibt das visuelle Zentrum.

---

# 10. Content First, Chrome Second

Archiv-Wiki ist ein Werkzeug zum Erstellen, Organisieren und Pflegen von Wissen.

Nicht die Benutzeroberfläche steht im Mittelpunkt.

Sondern der Inhalt.

Die Aufgabe der Oberfläche besteht darin, den Inhalt zu unterstützen.

Nicht darin, Aufmerksamkeit auf sich selbst zu ziehen.

Dieses Prinzip wird als

**Content First, Chrome Second**

bezeichnet.

Dabei beschreibt "Chrome" sämtliche Bestandteile der Benutzeroberfläche:

- Sidebar
- Toolbar
- Header
- Statusleisten
- Buttons
- Dialoge
- Rahmen
- Icons
- Panels

Alle diese Elemente dienen ausschließlich dazu, den Nutzer beim Arbeiten zu unterstützen.

---

# Warum dieses Prinzip wichtig ist

Der Nutzer öffnet Archiv-Wiki nicht,

um Buttons anzusehen.

Nicht,

um Menüs zu bedienen.

Nicht,

um Dialoge zu bewundern.

Er öffnet Archiv-Wiki,

um Informationen zu schreiben,

zu lesen,

zu organisieren

und wiederzufinden.

Die Benutzeroberfläche ist Mittel zum Zweck.

Nicht der Zweck selbst.

---

# Der Inhalt besitzt höchste Priorität

Während der Arbeit gilt stets folgende Reihenfolge:

Inhalt

↓

Dokument

↓

Werkzeuge

↓

Navigation

↓

Systeminformationen

Diese Priorität bestimmt sämtliche zukünftigen Designentscheidungen.

---

# Die Oberfläche bleibt zurückhaltend

Eine gute Oberfläche arbeitet im Hintergrund.

Sie drängt sich nicht auf.

Sie unterstützt den Nutzer,

ohne ständig Aufmerksamkeit einzufordern.

Werkzeuge sind jederzeit erreichbar,

dominieren jedoch niemals den Arbeitsbereich.

---

# Aufmerksamkeit wird bewusst eingesetzt

Jede Hervorhebung besitzt einen Grund.

Beispiele:

- aktiver Button
- Fokus
- Warnung
- Fehler
- Auswahl

Nicht jede Schaltfläche benötigt eine Akzentfarbe.

Nicht jede Information benötigt einen Rahmen.

Nicht jedes Werkzeug benötigt einen sichtbaren Button.

Je weniger Elemente Aufmerksamkeit verlangen,

desto stärker wirken diejenigen,

die tatsächlich hervorgehoben werden.

---

# Der Editor ist der Arbeitsplatz

Der Editor bildet das Zentrum der Anwendung.

Alle übrigen Bereiche unterstützen den Editor.

Kein Bereich darf den Eindruck vermitteln,

wichtiger zu sein

als das eigentliche Dokument.

Neue Funktionen werden deshalb immer darauf geprüft,

ob sie den verfügbaren Arbeitsbereich unnötig verkleinern.

---

# Werkzeuge treten in den Hintergrund

Werkzeuge sollen leicht erreichbar sein.

Sie sollen jedoch niemals den Eindruck erzeugen,

wichtiger zu sein

als die eigentliche Arbeit.

Werkzeugleisten wirken deshalb ruhig,

geordnet

und funktional.

Nicht dekorativ.

---

# Navigation unterstützt Orientierung

Die Sidebar ist der primäre Navigations- und Zugriffsbereich für Projektfunktionen und Wiki-Inhalte.

Sie erschließt feste Projektbereiche ebenso wie Suche, Erstellen-Aktionen und den Wiki-Baum, ohne selbst den Editor zu ersetzen. Ihre vollständige Struktur und ihr responsives Verhalten sind in `07_SIDEBAR.md` beschrieben.

Sie konkurriert nicht mit dem Editor.

Sie unterstützt den Arbeitsfluss.

---

# Weniger Oberfläche bedeutet mehr Konzentration

Eine reduzierte Oberfläche bedeutet nicht,

weniger Funktionen.

Sie bedeutet,

dass Funktionen besser organisiert werden.

Archiv-Wiki entfernt keine Möglichkeiten.

Es reduziert lediglich unnötige visuelle Belastung.

---

# Gute Beispiele

✓ Große Arbeitsfläche

✓ Ruhige Werkzeugleisten

✓ Dezente Statusinformationen

✓ Dokument im Mittelpunkt

✓ Wenige Akzentfarben

✓ Klare Informationshierarchie

---

# Schlechte Beispiele

✗ Dominante Werkzeugleisten

✗ Große Primärbuttons

✗ Mehrere auffällige Farben

✗ Große dekorative Panels

✗ Oberfläche wichtiger als Inhalt

✗ Permanente Ablenkung

---

# Praxisbeispiel

Situation:

Ein neuer Button soll in die Toolbar eingefügt werden.

Analyse:

Die Funktion wird nur selten verwendet.

Frage:

Benötigt sie dauerhaft einen Platz?

Oder reicht:

- Kontextmenü
- Dialog

Lösung:

Nur häufig genutzte Funktionen bleiben dauerhaft sichtbar.

Dadurch bleibt der Fokus auf dem Dokument.

UX-Prinzip:

Content First, Chrome Second

---

# Merksätze

- Der Inhalt ist das Produkt.
- Die Oberfläche unterstützt den Inhalt.
- Aufmerksamkeit wird bewusst eingesetzt.
- Werkzeuge helfen.
- Der Editor bleibt Mittelpunkt.
- Gute Software macht sich selbst unsichtbar.

---

# 11. Der Workspace

Der Workspace bildet das Zentrum der täglichen Arbeit.

Er verbindet Navigation, Dokumentinformationen, Werkzeuge und Inhalte zu einer ruhigen und konsistenten Arbeitsumgebung.

Der Workspace ist kein Header.

Er ist der Arbeitsplatz des Nutzers.

Jede Entscheidung innerhalb des Workspace dient ausschließlich dazu, den Arbeitsfluss zu unterstützen.

---

# Warum der Workspace wichtig ist

Der Nutzer verbringt den größten Teil seiner Zeit im Workspace.

Bereits kleine Irritationen summieren sich während langer Arbeitssitzungen.

Deshalb wird der Workspace nicht für einzelne Funktionen optimiert,

sondern für stundenlanges konzentriertes Arbeiten.

---

# Der Workspace besitzt einen Mittelpunkt

Jeder Workspace benötigt ein eindeutiges Zentrum.

In Archiv-Wiki ist dies immer:

das Dokument.

Nicht die Toolbar.

Nicht die Sidebar.

Nicht die Einstellungen.

Nicht Statusinformationen.

Alle übrigen Bereiche unterstützen das Dokument.

---

# Der Workspace besitzt Ebenen

Der Nutzer soll den Workspace in wenigen Augenblicken erfassen können.

Er gliedert sich deshalb in mehrere Ebenen.

Orientierung

↓

Dokument

↓

Werkzeuge

↓

Editor

↓

Status

Diese Reihenfolge bleibt über die gesamte Anwendung erhalten.

---

# Gemeinsame Achsen

Alle Bereiche orientieren sich an denselben vertikalen und horizontalen Linien.

Ausrichtungen besitzen eine höhere Bedeutung als dekorative Gestaltung.

Eine saubere Achse vermittelt Ruhe.

Selbst kleine Verschiebungen können die wahrgenommene Qualität deutlich reduzieren.

---

# Der Workspace wirkt wie eine Einheit

Der Workspace besteht aus mehreren Bereichen.

Diese dürfen jedoch niemals wie voneinander unabhängige Leisten wirken.

Werkzeuge,

Dokumentinformationen

und Aktionen

bilden gemeinsam einen zusammenhängenden Arbeitsbereich.

---

# Kompaktheit

Ein kompakter Workspace bedeutet nicht,

dass möglichst viele Informationen auf wenig Raum dargestellt werden.

Kompakt bedeutet,

dass Informationen ohne unnötige Unterbrechungen erreichbar sind.

Die Oberfläche spart Platz,

ohne gedrängt zu wirken.

---

# Gleichmäßiger Rhythmus

Der Workspace verwendet einen konsistenten Rhythmus.

Abstände,

Größen,

Ausrichtungen

und Gruppierungen

folgen einem gemeinsamen System.

Dadurch entsteht eine ruhige Oberfläche.

Nicht jedes Element benötigt individuelle Abstände.

---

# Blickführung

Der Workspace führt den Blick bewusst.

Der Nutzer erkennt zuerst:

wo er arbeitet.

Danach:

welches Dokument geöffnet ist.

Anschließend:

welche Werkzeuge verfügbar sind.

Erst danach werden weitere Informationen wahrgenommen.

Die Oberfläche unterstützt diese Reihenfolge.

Sie arbeitet niemals dagegen.

---

# Werkzeuggruppen

Werkzeuge werden funktional gruppiert.

Nicht alphabetisch.

Nicht technisch.

Sondern entsprechend ihrer Nutzung während des Schreibens.

Gruppen besitzen dabei eine höhere Bedeutung als einzelne Buttons.

---

# Dokumentinformationen

Dokumentinformationen gehören zum Dokument.

Nicht zur Toolbar.

Nicht zu den Aktionen.

Sie bilden einen eigenen Bereich innerhalb des Workspace.

Hierzu gehören beispielsweise:

- Titel
- Tags
- Beziehungen
- Eigenschaften

---

# Dokumentaktionen

Aktionen betreffen das gesamte Dokument.

Sie unterscheiden sich grundsätzlich von Werkzeugen.

Werkzeuge verändern Inhalte.

Dokumentaktionen verändern den Zustand des Dokuments.

Diese beiden Bereiche bleiben dauerhaft getrennt.

---

# Langfristige Stabilität

Der Workspace verändert sich mit der Weiterentwicklung von Archiv-Wiki.

Seine Grundstruktur bleibt jedoch erhalten.

Neue Funktionen werden bestehenden Bereichen zugeordnet.

Nicht jeder neue Wunsch erzeugt einen neuen Bereich.

Dadurch bleibt der Workspace langfristig verständlich.

---

# Gute Beispiele

✓ Klar erkennbare Ebenen

✓ Gemeinsame Ausrichtung

✓ Ruhige Werkzeuggruppen

✓ Editor als Mittelpunkt

✓ Konsistente Abstände

✓ Dokumentinformationen an einem festen Ort

---

# Schlechte Beispiele

✗ Mehrere konkurrierende Werkzeugleisten

✗ Dokumentinformationen zwischen Werkzeugen

✗ Unterschiedliche Ausrichtungen

✗ Viele einzelne Buttongruppen

✗ Leerräume ohne Funktion

✗ Bereiche ohne erkennbare Hierarchie

---

# Praxisbeispiel

Situation:

Der Header wirkt trotz ausreichendem Platz unruhig.

Analyse:

Nicht die Anzahl der Elemente ist das Problem.

Sondern:

- fehlende gemeinsame Achsen
- ungleichmäßige Abstände
- konkurrierende Gruppen
- fehlende visuelle Hierarchie

Lösung:

Den Workspace als Ganzes betrachten.

Nicht einzelne Buttons optimieren.

Zuerst die Struktur.

Danach die Komponenten.

UX-Prinzipien:

- Informationshierarchie
- Gestaltgesetze
- Visuelle Balance
- Content First, Chrome Second

---

# Merksätze

- Der Workspace ist der Arbeitsplatz.
- Der Editor bleibt Mittelpunkt.
- Gemeinsame Achsen erzeugen Qualität.
- Gruppen sind wichtiger als Einzelkomponenten.
- Der Workspace wirkt wie aus einem Guss.
- Gute Struktur ist wichtiger als perfekte Buttons.

---

# 12. Vertrauen und Handwerksqualität

Eine hochwertige Anwendung überzeugt nicht durch möglichst viele Funktionen.

Sie überzeugt dadurch, dass sie sich zuverlässig, durchdacht und konsistent anfühlt.

Vertrauen entsteht nicht durch Werbung.

Vertrauen entsteht durch tausende kleine, gut getroffene Entscheidungen.

Archiv-Wiki verfolgt deshalb das Ziel, sich wie ein professionelles Werkzeug anzufühlen.

Nicht wie ein kurzfristiges Softwareprojekt.

---

# Warum Vertrauen wichtig ist

Nutzer arbeiten oft viele Stunden täglich mit derselben Anwendung.

Mit der Zeit entsteht eine Beziehung zum Werkzeug.

Diese Beziehung basiert auf Vertrauen.

Der Nutzer muss sicher sein,

dass die Anwendung:

- vorhersehbar arbeitet
- zuverlässig speichert
- sich konsistent verhält
- Änderungen nachvollziehbar macht
- seine Arbeit respektiert

Eine Oberfläche vermittelt dieses Vertrauen bereits lange bevor technische Eigenschaften sichtbar werden.

---

# Handwerksqualität

Gute Software erkennt man selten an großen Funktionen.

Sie zeigt sich in kleinen Details.

Beispiele:

- saubere Ausrichtungen
- gleichmäßige Abstände
- konsistente Animationen
- verständliche Dialoge
- logische Menüstrukturen
- zuverlässige Tastatursteuerung
- ruhige Statusmeldungen

Diese Details wirken oft unscheinbar.

Gemeinsam erzeugen sie jedoch den Eindruck hoher Qualität.

---

# Vorhersehbarkeit

Der Nutzer sollte niemals überlegen müssen,

wie sich eine Funktion wahrscheinlich verhält.

Eine gute Oberfläche verhält sich jederzeit erwartbar.

Beispiele:

Ein Dialog öffnet sich immer gleich.

Buttons reagieren immer gleich.

Drag & Drop besitzt überall dieselben Regeln.

Die Anwendung wirkt dadurch stabil.

---

# Konsistenz schafft Vertrauen

Jede Inkonsistenz erzeugt Unsicherheit.

Bereits kleine Unterschiede können Fragen auslösen:

"Warum sieht dieser Dialog anders aus?"

"Warum funktioniert dieser Button anders?"

"Warum besitzt diese Ansicht andere Abstände?"

Archiv-Wiki vermeidet solche Unterschiede bewusst.

---

# Ruhe statt Effekte

Professionelle Anwendungen beeindrucken nicht durch Animationen.

Sie beeindrucken dadurch,

dass sie niemals stören.

Archiv-Wiki verzichtet bewusst auf übertriebene Effekte.

Die Aufmerksamkeit bleibt beim Inhalt.

---

# Langfristigkeit

Archiv-Wiki wird nicht für einen ersten Eindruck entwickelt.

Sondern für jahrelange tägliche Nutzung.

Deshalb besitzen langfristige Qualität,

Konsistenz

und Wartbarkeit

eine höhere Priorität

als kurzfristige Designtrends.

---

# Fehler sind Vertrauensbrüche

Nicht jeder Fehler lässt sich vermeiden.

Entscheidend ist,

wie die Anwendung damit umgeht.

Fehler sollen:

- verständlich erklärt werden
- nachvollziehbar sein
- Lösungen anbieten
- keine Daten gefährden

Eine ehrliche Fehlermeldung schafft mehr Vertrauen

als ein versteckter Fehler.

---

# Kleine Details

Kleine Details besitzen große Wirkung.

Beispiele:

- sauber ausgerichtete Icons
- konsistente Tooltips
- verständliche Tastenkürzel
- gleiche Hover-Effekte
- gleichmäßige Übergänge
- ruhige Farben
- einheitliche Abstände

Der Nutzer nimmt diese Details selten bewusst wahr.

Er nimmt jedoch die Qualität wahr,

die daraus entsteht.

---

# Bedeutung für Archiv-Wiki

Jede neue Funktion wird nicht nur auf ihren Nutzen geprüft.

Sondern auch auf ihren Einfluss

auf die wahrgenommene Qualität der Anwendung.

Eine Funktion,

die das Gesamtbild verschlechtert,

wird überarbeitet,

selbst wenn sie technisch korrekt funktioniert.

---

# Gute Beispiele

✓ Konsistente Dialoge

✓ Ruhige Animationen

✓ Verständliche Fehlermeldungen

✓ Einheitliche Komponenten

✓ Zuverlässiges Verhalten

✓ Klare Rückmeldungen

---

# Schlechte Beispiele

✗ Unterschiedliche Bedienkonzepte

✗ Unvorhersehbare Änderungen

✗ Übertriebene Animationen

✗ Inkonsistente Abstände

✗ Unterschiedliche Buttonstile

✗ Technische Fehlermeldungen ohne Erklärung

---

# Praxisbeispiel

Situation:

Ein neues Feature funktioniert technisch einwandfrei.

Analyse:

Die neue Oberfläche verwendet jedoch andere Buttons,

andere Abstände

und neue Farben.

Folge:

Die Anwendung wirkt uneinheitlich.

Der Nutzer empfindet die Oberfläche als weniger hochwertig.

Lösung:

Neue Funktionen übernehmen konsequent

das bestehende Designsystem.

UX-Prinzip:

Vertrauen entsteht durch Konsistenz.

---

# Merksätze

- Vertrauen entsteht durch Konsistenz.
- Qualität zeigt sich in Details.
- Vorhersehbarkeit schafft Sicherheit.
- Langfristigkeit ist wichtiger als Trends.
- Gute Software fällt nicht auf.
- Gute Software funktioniert einfach.

---

# 13. Ruhe als Designprinzip

Ruhe ist eines der wichtigsten Qualitätsmerkmale professioneller Desktop-Anwendungen.

Eine ruhige Benutzeroberfläche bedeutet nicht, dass sie wenige Funktionen besitzt.

Sie bedeutet, dass der Nutzer diese Funktionen nicht ständig wahrnimmt.

Archiv-Wiki verfolgt das Ziel, eine Arbeitsumgebung zu schaffen, die Konzentration unterstützt und Ablenkung vermeidet.

Die Oberfläche soll den Nutzer begleiten.

Nicht unterbrechen.

---

# Warum Ruhe wichtig ist

Der Mensch kann sich nur auf eine begrenzte Anzahl visueller Reize gleichzeitig konzentrieren.

Jede unnötige Bewegung,

jede auffällige Farbe,

jede blinkende Meldung,

jede konkurrierende Hervorhebung

beansprucht Aufmerksamkeit.

Über viele Stunden hinweg entsteht daraus Ermüdung.

Eine ruhige Oberfläche schützt die Aufmerksamkeit des Nutzers.

---

# Aufmerksamkeit ist wertvoll

Aufmerksamkeit wird bewusst eingesetzt.

Sie gehört ausschließlich den Elementen,

die im aktuellen Moment wichtig sind.

Beispiele:

- Fehler
- Warnungen
- Fokus
- aktuelle Auswahl
- laufende Aktionen

Alle übrigen Bereiche treten bewusst in den Hintergrund.

---

# Weniger Reize

Archiv-Wiki vermeidet unnötige visuelle Reize.

Dazu gehören unter anderem:

- blinkende Elemente
- starke Farbwechsel
- dekorative Animationen
- konkurrierende Akzentfarben
- ständig wechselnde Layouts

Die Oberfläche bleibt stabil.

---

# Konsistenz erzeugt Ruhe

Wiederkehrende Muster entlasten das Gehirn.

Der Nutzer erkennt Funktionen,

ohne sie erneut lernen zu müssen.

Ruhe entsteht deshalb durch:

- Wiederholung
- Vorhersehbarkeit
- Konsistenz

Nicht durch Minimalismus allein.

---

# Bewegungen

Bewegung besitzt Bedeutung.

Animationen werden ausschließlich verwendet,

wenn sie Orientierung verbessern.

Beispiele:

- Dialog öffnet sich
- Sidebar klappt ein
- Drag & Drop zeigt Zielposition

Animationen dürfen niemals Selbstzweck sein.

---

# Farben

Farben unterstützen Orientierung.

Sie erzeugen keine Unterhaltung.

Akzentfarben erscheinen nur dort,

wo Aufmerksamkeit erforderlich ist.

Je seltener eine Farbe verwendet wird,

desto stärker wirkt sie.

---

# Klang der Oberfläche

Jede Benutzeroberfläche besitzt einen eigenen "Rhythmus".

Manche Anwendungen wirken hektisch.

Andere wirken ruhig.

Archiv-Wiki bevorzugt:

- gleichmäßige Abstände
- ruhige Übergänge
- konstante Positionen
- stabile Layouts

Dadurch entsteht ein gleichmäßiger Arbeitsrhythmus.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki möchte den Nutzer nicht beeindrucken.

Es möchte ihn unterstützen.

Die Oberfläche arbeitet deshalb leise.

Sie tritt zurück,

damit der Inhalt in den Mittelpunkt rückt.

---

# Gute Beispiele

✓ ruhige Werkzeugleisten

✓ wenige Akzentfarben

✓ konstante Positionen

✓ zurückhaltende Animationen

✓ gleichmäßige Abstände

✓ stabile Layouts

---

# Schlechte Beispiele

✗ blinkende Hinweise

✗ wechselnde Farben

✗ auffällige Animationen

✗ viele konkurrierende Bereiche

✗ ständig springende Elemente

✗ permanente Benachrichtigungen

---

# Praxisbeispiel

Situation:

Nach jeder kleinen Änderung erscheint eine große grüne Erfolgsmeldung.

Analyse:

Die Funktion arbeitet korrekt.

Die Oberfläche unterbricht jedoch ständig den Arbeitsfluss.

Lösung:

Statt einer auffälligen Meldung genügt ein kleiner Speicherstatus.

Die Aufmerksamkeit bleibt beim Dokument.

UX-Prinzip:

Ruhe als Designprinzip.

---

# Merksätze

- Ruhe schützt Aufmerksamkeit.
- Bewegung besitzt Bedeutung.
- Farben werden bewusst eingesetzt.
- Konsistenz erzeugt Gelassenheit.
- Gute Software arbeitet im Hintergrund.

---

# 14. Flow statt Features

Archiv-Wiki wird nicht an der Anzahl seiner Funktionen gemessen.

Der Erfolg einer Funktion zeigt sich daran,

ob sie den Arbeitsfluss verbessert oder unterbricht.

Jede neue Funktion besitzt deshalb nur dann einen Platz in Archiv-Wiki,

wenn sie den Nutzer schneller,

ruhiger

oder sicherer arbeiten lässt.

Funktionen sind niemals Selbstzweck.

---

# Was ist Flow?

Flow beschreibt einen Zustand,

in dem der Nutzer vollständig auf seine eigentliche Aufgabe konzentriert ist.

Während dieses Zustands tritt die Benutzeroberfläche in den Hintergrund.

Der Nutzer denkt nicht mehr über die Software nach.

Er arbeitet ausschließlich mit seinem Wissen.

Archiv-Wiki möchte diesen Zustand möglichst lange erhalten.

---

# Jede Unterbrechung besitzt einen Preis

Jede Unterbrechung reißt den Nutzer aus seiner Konzentration.

Beispiele:

- unnötige Dialoge

- häufige Bestätigungen

- blinkende Hinweise

- wechselnde Layouts

- überraschende Fenster

- überladene Werkzeugleisten

Auch kleine Unterbrechungen summieren sich.

Über Stunden hinweg entsteht daraus ein erheblicher Produktivitätsverlust.

---

# Werkzeuge begleiten den Flow

Werkzeuge unterstützen den Nutzer.

Sie unterbrechen ihn nicht.

Eine Funktion ist dann gelungen,

wenn sie sich selbstverständlich anfühlt.

Der Nutzer sollte nicht überlegen müssen,

welches Werkzeug als Nächstes benötigt wird.

---

# Geschwindigkeit allein reicht nicht

Eine schnelle Oberfläche garantiert keinen guten Arbeitsfluss.

Ebenso wichtig sind:

- Vorhersehbarkeit

- Konsistenz

- klare Orientierung

- geringe kognitive Belastung

Ein ruhiger Arbeitsfluss entsteht durch das Zusammenspiel aller dieser Faktoren.

---

# Funktionen müssen ihren Platz verdienen

Jede neue Funktion beantwortet vor ihrer Umsetzung folgende Fragen:

Verbessert sie den Arbeitsfluss?

Reduziert sie wiederkehrende Arbeit?

Lässt sie sich intuitiv bedienen?

Passt sie zur bestehenden Informationsarchitektur?

Kann sie bestehende Funktionen erweitern,

anstatt neue Bereiche einzuführen?

Erst wenn diese Fragen positiv beantwortet werden,

wird eine Umsetzung empfohlen.

---

# Häufigkeit bestimmt Sichtbarkeit

Nicht jede Funktion benötigt denselben Stellenwert.

Archiv-Wiki unterscheidet deshalb zwischen:

täglichen Werkzeugen

↓

regelmäßigen Werkzeugen

↓

gelegentlichen Werkzeugen

↓

selten genutzten Werkzeugen

Je seltener eine Funktion verwendet wird,

desto weniger dauerhaft muss sie sichtbar sein.

---

# Konzentration schützen

Archiv-Wiki schützt die Konzentration des Nutzers.

Deshalb werden unnötige Unterbrechungen vermieden.

Beispiele:

✓ automatische Speicherung

✓ ruhige Statusanzeigen

✓ konsistente Werkzeugpositionen

✓ wenige Benachrichtigungen

✓ kurze Mauswege

Die Oberfläche arbeitet mit dem Nutzer.

Nicht gegen ihn.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki versteht sich als professionelles Wissenswerkzeug.

Der Nutzer verbringt oft viele Stunden täglich im Editor.

Jede Designentscheidung berücksichtigt deshalb,

ob sie langfristig zu einem angenehmeren Arbeitsfluss beiträgt.

Nicht jede beeindruckende Idee verbessert die Produktivität.

Oft besteht die bessere Lösung darin,

nichts zu verändern.

---

# Gute Beispiele

✓ automatische Speicherung im Hintergrund

✓ konsistente Tastaturkürzel

✓ ruhige Toolbar

✓ stabile Navigation

✓ direkte Bearbeitung

✓ wenige Dialoge

---

# Schlechte Beispiele

✗ jeder Funktion einen eigenen Button geben

✗ unnötige Bestätigungsdialoge

✗ ständig wechselnde Bedienkonzepte

✗ auffällige Animationen

✗ mehrere Wege zur gleichen Aufgabe

✗ häufige Unterbrechungen

---

# Praxisbeispiel

Situation:

Eine neue Exportfunktion soll ergänzt werden.

Analyse:

Der Export wird nur selten genutzt.

Ein zusätzlicher Button in der Toolbar würde den Arbeitsbereich dauerhaft vergrößern.

Lösung:

Die Funktion wird in das Dokument-Menü integriert.

Sie bleibt leicht erreichbar,

unterbricht jedoch nicht den täglichen Arbeitsfluss.

UX-Prinzip:

Flow statt Features.

---

# Merksätze

- Flow ist wichtiger als Funktionsumfang.
- Jede Unterbrechung besitzt einen Preis.
- Funktionen müssen ihren Platz verdienen.
- Die Oberfläche schützt die Konzentration.
- Gute Software verschwindet während der Arbeit.

---

# 15. Evolution statt Revolution

Archiv-Wiki entwickelt sich kontinuierlich weiter.

Verbesserungen erfolgen schrittweise.

Nicht sprunghaft.

Der Nutzer investiert Zeit,

um die Anwendung kennenzulernen.

Diese Investition wird respektiert.

Vertraute Arbeitsabläufe werden deshalb nur verändert,

wenn dadurch ein nachweisbarer Mehrwert entsteht.

Archiv-Wiki entwickelt sich gemeinsam mit seinen Nutzern.

Nicht gegen ihre Gewohnheiten.

---

# Warum Evolution wichtig ist

Mit jeder Nutzung entsteht ein mentales Modell.

Der Nutzer merkt sich:

- Positionen
- Abläufe
- Tastenkombinationen
- Mauswege
- Werkzeuggruppen

Diese Gewohnheiten ermöglichen schnelles Arbeiten.

Ein radikales Redesign zerstört dieses Wissen.

Selbst gute Ideen können dadurch kurzfristig zu einer schlechteren Benutzererfahrung führen.

---

# Vertrauen entsteht über Jahre

Professionelle Werkzeuge begleiten ihre Nutzer oft über viele Jahre.

Eine Oberfläche,

die sich ständig verändert,

vermittelt Unsicherheit.

Eine Oberfläche,

die sich behutsam weiterentwickelt,

vermittelt Vertrauen.

Archiv-Wiki bevorzugt deshalb kontinuierliche Verbesserung gegenüber radikalen Veränderungen.

---

# Änderungen benötigen einen Grund

Nicht jede Idee rechtfertigt eine Änderung.

Vor jeder größeren Anpassung wird geprüft:

- Welches Problem wird gelöst?
- Wie viele Nutzer betrifft dieses Problem?
- Gibt es eine kleinere Lösung?
- Bleibt der Arbeitsfluss erhalten?
- Bleibt das räumliche Gedächtnis erhalten?

Erst danach wird über eine Umsetzung entschieden.

---

# Bestehende Muster respektieren

Neue Funktionen orientieren sich an bestehenden Bedienkonzepten.

Neue Lösungen ergänzen vorhandene Strukturen.

Sie ersetzen diese nicht grundlos.

Dadurch bleibt die Anwendung vertraut.

---

# Kleine Verbesserungen

Viele kleine Verbesserungen besitzen häufig einen größeren Nutzen

als ein vollständiges Redesign.

Beispiele:

- bessere Ausrichtung

- konsistentere Abstände

- logischere Gruppierung

- kürzere Mauswege

- verständlichere Dialoge

Diese Veränderungen verbessern die Benutzererfahrung,

ohne den Nutzer neu lernen zu lassen.

---

# Veränderungen sichtbar machen

Wenn sich Arbeitsabläufe verändern,

werden diese nachvollziehbar kommuniziert.

Der Nutzer soll verstehen:

- was sich geändert hat
- warum sich etwas geändert hat
- welchen Vorteil die Änderung besitzt

Veränderungen sollen Orientierung schaffen.

Nicht überraschen.

---

# Design besitzt Kontinuität

Die Identität von Archiv-Wiki bleibt über Versionen hinweg erhalten.

Neue Funktionen übernehmen:

- Farben

- Typografie

- Komponenten

- Animationen

- Informationsarchitektur

Dadurch wirkt die Anwendung wie aus einem Guss,

auch wenn sie über Jahre wächst.

---

# Bedeutung für Archiv-Wiki

Archiv-Wiki ist ein langfristiges Wissenswerkzeug.

Der Nutzer soll sich auch nach Jahren sofort zurechtfinden.

Neue Versionen sollen vertraut wirken.

Nicht fremd.

Verbesserungen erfolgen deshalb evolutionär.

Nicht revolutionär.

---

# Gute Beispiele

✓ Toolbar sinnvoll gruppieren

✓ Header schrittweise verbessern

✓ Bestehende Dialoge erweitern

✓ Neue Funktionen integrieren

✓ Layout behutsam optimieren

---

# Schlechte Beispiele

✗ Komplettes Redesign ohne Notwendigkeit

✗ Werkzeuge an neue Positionen verschieben

✗ Neue Bedienkonzepte ohne Mehrwert

✗ Ständig wechselnde Navigation

✗ Mehrere UI-Stile gleichzeitig

---

# Praxisbeispiel

Situation:

Der Header wirkt überladen.

Analyse:

Alle Funktionen werden täglich genutzt.

Ein vollständiges Redesign würde bestehende Arbeitsabläufe verändern.

Lösung:

Die vorhandenen Funktionen bleiben erhalten.

Sie werden besser gruppiert,

neu ausgerichtet

und klarer strukturiert.

Der Nutzer muss nichts neu lernen,

profitiert jedoch von einer ruhigeren Oberfläche.

UX-Prinzip:

Evolution statt Revolution.

---

# Merksätze

- Gute Software entwickelt sich behutsam.
- Vertraute Arbeitsabläufe besitzen Wert.
- Veränderungen benötigen einen nachvollziehbaren Grund.
- Kleine Verbesserungen wirken langfristig stärker als große Umbrüche.
- Kontinuität schafft Vertrauen.

---

# 16. Der Archiv-Wiki-Test

Jede neue Funktion, jede Designänderung und jede Erweiterung der Benutzeroberfläche muss den Archiv-Wiki-Test bestehen.

Der Test dient nicht dazu, Innovationen zu verhindern.

Er soll sicherstellen,

dass jede Änderung die Qualität der Anwendung langfristig verbessert.

Eine Funktion ist nicht deshalb gut,

weil sie technisch möglich ist.

Sie ist gut,

wenn sie die tägliche Arbeit erleichtert.

---

# Warum dieser Test existiert

Software wächst.

Mit jeder Version entstehen neue Ideen,

neue Wünsche

und neue Möglichkeiten.

Ohne klare Bewertungskriterien entwickelt sich eine Anwendung langfristig zu einer Sammlung einzelner Funktionen.

Archiv-Wiki verfolgt einen anderen Ansatz.

Jede Änderung muss einen nachvollziehbaren Nutzen besitzen.

---

# Der Qualitätsfilter

Vor jeder größeren Änderung werden folgende Fragen beantwortet.

---

## 1. Löst die Änderung ein echtes Problem?

Welches Problem wird gelöst?

Wie häufig tritt dieses Problem auf?

Ist die Verbesserung für den Nutzer tatsächlich relevant?

Eine Änderung ohne klares Problem besitzt keine Priorität.

---

## 2. Unterstützt sie die Vision?

Passt die Änderung zur langfristigen Vision von Archiv-Wiki?

Unterstützt sie:

- Wissensmanagement

- konzentriertes Arbeiten

- langfristige Produktivität

Wenn nicht,

wird sie überarbeitet oder verworfen.

---

## 3. Verbessert sie den Arbeitsfluss?

Erleichtert die Änderung die tägliche Arbeit?

Oder erzeugt sie zusätzliche Schritte,

Dialoge

oder Entscheidungen?

Der Arbeitsfluss besitzt höchste Priorität.

---

## 4. Bleibt der Editor Mittelpunkt?

Vergrößert die Änderung die Aufmerksamkeit der Oberfläche?

Oder unterstützt sie den Inhalt?

Der Editor bleibt immer das Zentrum der Anwendung.

---

## 5. Nutzt sie bestehende Komponenten?

Kann eine vorhandene Lösung erweitert werden?

Oder entsteht eine neue Sonderlösung?

Bestehende Komponenten besitzen Vorrang.

---

## 6. Bleibt die Informationsarchitektur erhalten?

Wird eine Funktion an der richtigen Stelle eingefügt?

Oder entsteht eine Vermischung unterschiedlicher Aufgaben?

Navigation,

Dokument,

Werkzeuge

und Aktionen

bleiben getrennt.

---

## 7. Erhöht sie die kognitive Belastung?

Muss der Nutzer:

mehr suchen,

mehr lesen,

mehr entscheiden

oder mehr lernen?

Falls ja,

muss die Lösung überarbeitet werden.

---

## 8. Bleibt die Oberfläche ruhig?

Erzeugt die Änderung:

- zusätzliche Farben

- neue Rahmen

- weitere Buttons

- zusätzliche Leisten

- konkurrierende Blickfänge?

Falls ja,

muss geprüft werden,

ob die Funktion anders integriert werden kann.

---

## 9. Ist sie konsistent?

Verwendet die Änderung:

- dieselben Komponenten

- dieselben Farben

- dieselben Abstände

- dieselben Animationen

- dieselbe Typografie

Inkonsistenzen werden grundsätzlich vermieden.

---

## 10. Würde ein neuer Nutzer sie verstehen?

Ist die Änderung intuitiv?

Oder muss sie erklärt werden?

Eine gute Oberfläche erklärt sich weitgehend selbst.

---

## 11. Würde ein langjähriger Nutzer sie akzeptieren?

Bleiben bekannte Arbeitsabläufe erhalten?

Oder muss der Nutzer Gewohnheiten neu lernen?

Evolution besitzt Vorrang vor Revolution.

---

## 12. Wird Archiv-Wiki dadurch in fünf Jahren besser sein?

Nicht jede kurzfristig gute Idee besitzt langfristigen Wert.

Archiv-Wiki entwickelt sich nachhaltig.

Vor jeder Änderung wird deshalb gefragt:

"Wird diese Entscheidung auch in mehreren Jahren noch sinnvoll sein?"

---

# Entscheidung

Eine Änderung wird empfohlen,

wenn sie:

✓ ein reales Problem löst

✓ den Arbeitsfluss verbessert

✓ die Informationsarchitektur respektiert

✓ die Konsistenz erhält

✓ den Editor stärkt

✓ die kognitive Belastung reduziert

✓ langfristig sinnvoll bleibt

Kann eine dieser Fragen nicht eindeutig beantwortet werden,

soll die Änderung zunächst analysiert,

vereinfacht

oder verworfen werden.

---

# Gute Beispiele

✓ Bestehende Toolbar besser gruppieren

✓ Dialog vereinfachen

✓ Sidebar übersichtlicher strukturieren

✓ Häufige Aktionen schneller erreichbar machen

✓ Tastatursteuerung erweitern

---

# Schlechte Beispiele

✗ Neue Buttons ohne Analyse hinzufügen

✗ Funktionen doppelt anbieten

✗ Große Redesigns ohne nachvollziehbaren Nutzen

✗ Komponenten mit eigenem Stil entwickeln

✗ Aufmerksamkeit von Inhalt auf Oberfläche verlagern

---

# Praxisbeispiel

Situation:

Ein neues Feature soll dauerhaft im Workspace erscheinen.

Analyse:

Die Funktion wird nur selten verwendet.

Sie benötigt einen zusätzlichen Button.

Der Editor verliert dadurch Platz.

Bewertung:

✗ Arbeitsfluss verbessert sich nicht.

✗ Editor verliert Priorität.

✗ Kognitive Belastung steigt.

Entscheidung:

Die Funktion wird stattdessen in ein Kontextmenü integriert.

Dadurch bleibt der Workspace ruhig,

während die Funktion weiterhin leicht erreichbar ist.

---

# Merksätze

- Jede Änderung benötigt einen nachvollziehbaren Nutzen.
- Der Editor besitzt höchste Priorität.
- Qualität ist wichtiger als Quantität.
- Konsistenz schafft Vertrauen.
- Evolution schlägt Revolution.
- Gute Software verbessert sich Schritt für Schritt.
- Archiv-Wiki entwickelt sich langfristig.

# 17. Semantic Workspace

Archiv-Wiki folgt der Semantic Workspace Philosophie.

Der Workspace besteht aus zwei klar voneinander getrennten Ebenen:

## The Frame

Der Frame ist das Werkzeug.

Er verhält sich wie eine professionelle Desktop-Anwendung.

Er besitzt:

- Stabilität
- Vorhersehbarkeit
- feste Positionen
- konsistente Navigation
- klare Werkzeuggruppen

Der Frame verändert sich möglichst selten.

Er bildet den festen Arbeitsplatz des Nutzers.

---

## The Core

Der Core ist das Dokument.

Er verhält sich nicht wie Software.

Er verhält sich wie Wissen.

Titel, Tags und Metadaten gehören zum Dokument.

Nicht zur Software.

Der Core besitzt möglichst wenig sichtbares Chrome.

Dadurch entsteht der Eindruck,

dass nicht die Anwendung,

sondern das Wissen im Mittelpunkt steht.

# Toolbar-Regeln

Die Toolbar ist ein Werkzeug für den täglichen Arbeitsfluss.

Sie bleibt dauerhaft kompakt, ruhig und auf häufig genutzte Funktionen beschränkt.

## Aufnahme neuer Buttons

Ein neuer Toolbar-Button darf nur aufgenommen werden, wenn mindestens eine der folgenden Bedingungen erfüllt ist:

- wird regelmäßig im täglichen Arbeitsablauf genutzt
- spart mindestens zwei Interaktionen gegenüber dem bisherigen Weg
- unterstützt den primären Schreib- oder Organisationsfluss
- gehört logisch zu einer bestehenden Werkzeuggruppe

Erfüllt eine Funktion diese Kriterien nicht, wird geprüft, ob sie in ein bereits vorhandenes, für diesen Kontext vorgesehenes Menü oder in einen passenden Dialog gehört.

---

## Größe der Werkzeuggruppen

Werkzeuggruppen wachsen nicht unbegrenzt.

Werden neue Funktionen ergänzt, muss geprüft werden, ob:

- selten genutzte Funktionen in einem bereits vorhandenen passenden Menü oder Dialog untergebracht werden können,
- eine bestehende Funktion ersetzt werden sollte,
- oder die neue Funktion überhaupt dauerhaft sichtbar sein muss.

Die Toolbar bleibt langfristig übersichtlich und ruhig.

Qualität vor Quantität.

Content First, Chrome Second.

Die Toolbar ist kein vollständiges Abbild aller Funktionen.

Sie zeigt ausschließlich die Werkzeuge, die den täglichen Arbeitsfluss beschleunigen.

Selten genutzte Funktionen werden bewusst in Menüs oder Dialoge ausgelagert.
