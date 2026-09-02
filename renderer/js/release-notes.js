// renderer/js/release-notes.js
// Lokale Release Notes der ausgelieferten Archiv-Wiki-Versionen.
// Wortlaut, Reihenfolge und Inhalt entsprechen exakt den für dieselbe Version
// auf GitHub veröffentlichten Release Notes. Die Update-Einstellungen zeigen
// ausschließlich den Datensatz, dessen Version der installierten App entspricht.

export const RELEASE_NOTES_BY_VERSION = Object.freeze({
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
