// renderer/js/release-notes.js
// Lokale Release Notes der ausgelieferten Archiv-Wiki-Versionen.
// Wortlaut, Reihenfolge und Inhalt entsprechen exakt den für dieselbe Version
// auf GitHub veröffentlichten Release Notes. Die Update-Einstellungen zeigen
// ausschließlich den Datensatz, dessen Version der installierten App entspricht.

export const RELEASE_NOTES_BY_VERSION = Object.freeze({
  '2.3.1': Object.freeze({
    intro: 'Dieses Update behebt mehrere Fehler im Editor, verbessert die Datensicherheit beim Speichern und bringt spürbare Komfortverbesserungen für die tägliche Notizverwaltung.',
    sections: Object.freeze([
      Object.freeze({
        title: '🐛 BEHOBEN',
        items: Object.freeze([
          'Kein Eingabeverlust im Editor: Schnelles Tippen direkt nach dem Anlegen einer Notiz („+ Notiz“) oder beim Ändern des Titels verliert keine Zeichen mehr.',
          'Faltbereiche mit Checklisten: Beim Abhaken von Aufgaben in Faltbereichen bleibt deren Auf- oder Zuklapp-Zustand in der Vorschau erhalten.',
          'Cursor-Position bei neuen Notizen: Der Schreibcursor startet beim Erstellen einer Notiz direkt unter der Titelzeile im Textbereich.',
          'Darstellung im geteilten Modus: Im Split-Modus verdeckt die Lesezeitanzeige nicht mehr die Vorschau-Überschrift.',
          'Wikilinks in Codeblöcken: Codeblöcke wandeln enthaltene Klammern nicht mehr fälschlicherweise in Links um.',
          'Fenster schließen: Ungespeicherte Änderungen werden beim Schließen des Fensters zuverlässig erkannt und abgefragt.',
          'Einstellungen bei kleinen Bildschirmen: Alle Einstellungsbereiche lassen sich auch bei verkleinertem Fenster vollständig erreichen und bedienen.'
        ])
      }),
      Object.freeze({
        title: '📝 SONSTIGES',
        items: Object.freeze([
          'Klarere Meldungen & Zähler: Korrekte Mengenangaben im Papierkorb („0 Einträge“) sowie zeitlich begrenzte Rückgängig-Hinweise nach Löschaktionen.',
          'Verbesserte Hilfetexte & Dialoge: Klarere Beschriftungen im leeren Dashboard und Schutz vor versehentlich leeren Eingaben bei neuen Kategorien.'
        ])
      }),
      Object.freeze({
        title: '✅ GEMACHT',
        items: Object.freeze([
          'Werkzeugleiste für schmale Fenster: Auf kleineren Bildschirmen werden überzählige Schaltflächen übersichtlich in einem „Weitere …“-Menü gebündelt, statt abgeschnitten zu werden.',
          'Warnung vor doppelten Titeln: Der Editor warnt davor, wenn in derselben Kategorie bereits eine Notiz mit demselben Namen existiert.',
          'Bessere Tastaturbedienung: Klarere Fokus-Hervorhebungen und flüssigere Navigation mit der Tastatur.',
          'Moderneres Standard-Design: Neu erstellte Wikis starten direkt im modernen Design 2.',
          'Höhere Datensicherheit: Verbesserte Schutzmechanismen beim Speichern von Notizen.'
        ])
      })
    ])
  }),
  '2.3.0': Object.freeze({
    intro: 'Dieses Update erweitert die Editor-Werkzeugleiste um neue Formatierungs- und Bildfunktionen, verbessert den Einrichtungsassistenten und bringt automatische Browsererkennung sowie Unterstützung für System-Chromium in den Web Clipper.',
    sections: Object.freeze([
      Object.freeze({
        title: '✨ NEU',
        items: Object.freeze([
          'Erweiterte Editor-Werkzeugleiste: Neue Schaltflächen für Inline-Code, Horizontale Linie, Mathe-Blöcke, Suchen & Ersetzen, Formatierung entfernen sowie das direkte Einfügen von Bildern.',
          'Bilder einfügen & Zwischenablage: Bilder können jetzt per Schaltfläche aus dem Dateimanager gewählt oder direkt per Strg+V aus der Zwischenablage in Notizen eingefügt werden.',
          'Tabellen per Raster einfügen: Neues interaktives Raster zum schnellen Auswählen von Spalten und Zeilen beim Erstellen neuer Tabellen.',
          'Web Clipper für System-Chromium: Neben Firefox und Brave (Flatpak) lässt sich der Web Clipper nun auch für normal installiertes System-Chromium mit einem Klick in den Einstellungen vorbereiten.',
          'Dynamische Browsererkennung: Die Web-Clipper-Einstellungen erkennen installierte Browser auf dem System automatisch und bieten nur passende Aktionen an.',
          'Mehrfachauswahl im Papierkorb: Gelöschte Notizen können im Papierkorb gesammelt markiert und in einem Schritt gemeinsam wiederhergestellt oder endgültig gelöscht werden.'
        ])
      }),
      Object.freeze({
        title: '✅ GEMACHT',
        items: Object.freeze([
          'Einrichtungsassistent überarbeitet: Klar strukturierter Ablauf in drei übersichtlichen Schritten mit deutlicher Warnung bei nicht-leeren Zielordnern.',
          'Zuverlässigerer Passwortschutz & ehrlicherer Verbindungsstatus: Verbesserte Absicherung des optionalen App-Passworts und genaue Anzeige, ob die WebDAV-Verbindung tatsächlich erfolgreich geprüft wurde.',
          'Klickbarer Titel für zuletzt bearbeitete Notizen: Der Titel der zuletzt geöffneten Notiz auf dem Dashboard lässt sich direkt anklicken, um sofort zur Notiz zu springen.',
          'Klarere Symbole in der Werkzeugleiste: Einheitliche, scharfe Vektorsymbole für Links, Tabellen, Callouts und Icons in Classic und Design 2.',
          'Schlankeres Anwendungspaket: Überflüssige Grafikdateien wurden aus dem ausgelieferten AppImage entfernt.'
        ])
      }),
      Object.freeze({
        title: '🐛 BEHOBEN',
        items: Object.freeze([
          'Konfigurationspfade für Chromium korrigiert: Der Web Clipper steuert die Erweiterungs- und Native-Messaging-Pfade unter Linux nun auch bei angepassten Benutzerumgebungen zuverlässig im selben Ordner an.',
          'Absicherung gegen inkonsistente Sync-Daten: Fehlerhafte oder unvollständige Eingaben im Einrichtungsassistenten hinterlassen keine beschädigten Konfigurationsdateien mehr.'
        ])
      }),
      Object.freeze({
        title: '📝 SONSTIGES',
        items: Object.freeze([
          'Gezielte Führung in den Web-Clipper-Einstellungen: Nicht unterstützte Browser erhalten keine irreführenden Aktionen; Firefox verlinkt direkt auf die offizielle Mozilla-Add-on-Seite.'
        ])
      })
    ])
  }),
  '2.2.0': Object.freeze({
    intro: 'Dieses Update führt das neue Design2, eine integrierte Titelleiste, Mehrfachauswahl für Notizen, den Eingangsbereich sowie erweiterte Werkzeuge zur Wissenspflege ein.',
    sections: Object.freeze([
      Object.freeze({
        title: '✨ NEU',
        items: Object.freeze([
          'Neues Design2: In den Einstellungen kann ab sofort auf das neue, moderne Design2-Erscheinungsbild umgestellt werden.',
          'Integrierte Titelleiste: Eine moderne, nahtlos in das Anwendungsdesign integrierte Leiste für Fenstersteuerung und Anwendungsmenü.',
          'Mehrfachauswahl für Notizen: Mehrere Notizen gleichzeitig auswählen und in einem Schritt verschieben, archivieren oder löschen – inklusive Rückgängig-Funktion.',
          'Tag-Übersicht & Filterung: Alle vergebenen Schlagworte auf einen Blick einsehen, Häufigkeiten prüfen und Notizen direkt nach Tags filtern.',
          'Eingangsbereich: Web-Clips, Texte, Dateien und Bilder zentral sammeln und bequem zu fertigen Notizen weiterverarbeiten.'
        ])
      }),
      Object.freeze({
        title: '✅ GEMACHT',
        items: Object.freeze([
          'Erweiterte Oberflächenelemente: Neue Live-Zähler für Eingang und Archiv, eine integrierte Statusleiste sowie überarbeitete Dialoge und Einstellungen.',
          'Wissenspflege: Automatische Werkzeuge zum Finden defekter Links, unbezeichneter Schlagworte und leerer Notizen.',
          'Höhere Datensicherheit: Verbesserte Schutzsicherungen vor Massenoperationen und robusteres Speichern von Notizdateien.'
        ])
      }),
      Object.freeze({
        title: '📝 SONSTIGES',
        items: Object.freeze([
          'Optimierte Navigation und visuelle Feinabstimmungen in allen Hauptansichten.'
        ])
      })
    ])
  }),
  '2.1.1': Object.freeze({
    intro: 'Dieses Update verbessert vor allem die Zuverlässigkeit, Datensicherheit und den Web Clipper.',
    sections: Object.freeze([
      Object.freeze({
        title: '🐛 BEHOBEN',
        items: Object.freeze([
          'Notizen werden beim Wechseln, Umbenennen und Verschieben zuverlässiger gespeichert.',
          'Änderungen an Notizdateien außerhalb von Archiv-Wiki werden besser erkannt und vor unbeabsichtigtem Überschreiben geschützt.',
          'Projektwechsel und Projekteinstellungen reagieren zuverlässiger auf fehlerhafte oder unvollständige Konfigurationen.',
          'Verschiedene kleinere Darstellungs- und Bedienungsfehler wurden behoben.',
          'Der Web Clipper verarbeitet Bildauswahlen und sehr große Webseiten zuverlässiger und verhindert fehlerhafte oder unbeabsichtigte Übernahmen.'
        ])
      }),
      Object.freeze({
        title: '✅ GEMACHT',
        items: Object.freeze([
          'Backup und Wiederherstellung wurden robuster und zuverlässiger gemacht.',
          'Synchronisation und WebDAV-Verbindungen wurden zusätzlich abgesichert.',
          'Vorschau und HTML-Export behandeln eingebettete Inhalte sicherer.',
          'Der Web Clipper für Brave fragt benötigte zusätzliche Berechtigungen jetzt ausdrücklich ab und bietet eine Möglichkeit, sie wieder zu entziehen.',
          'Die ausgelieferte Brave-Erweiterung wird vor der Verwendung kryptografisch auf Integrität und richtige Zuordnung geprüft.',
          'Die Datenübergabe zwischen Web Clipper und Archiv-Wiki wurde weiter abgesichert.'
        ])
      }),
      Object.freeze({
        title: '📝 SONSTIGES',
        items: Object.freeze([
          Object.freeze({ text: 'Der Web Clipper wurde auf Version ', strong: '0.2.1', suffix: ' aktualisiert.' })
        ])
      })
    ])
  })
});

export function getReleaseNotesForVersion(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  return RELEASE_NOTES_BY_VERSION[normalized] || null;
}
