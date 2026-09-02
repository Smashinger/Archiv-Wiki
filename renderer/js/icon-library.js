// renderer/js/icon-library.js
// Kuratierte Auswahl (keine kompletten Bibliotheken — bewusst schlank, siehe
// Absprache) aus zwei Quellen:
//   - Lucide (lucide-static, ISC-Lizenz) — generische, thematische Symbole
//   - Simple Icons (simple-icons, CC0) — echte Marken-/Distro-Logos
//   - Tux (github.com/garrett/Tux, Public Domain/CC0) — als generisches
//     "Linux"-Symbol, da es dafür kein Firmenlogo gibt (Tux ist ein
//     Maskottchen, keine Marke)
// Jeder Eintrag hat "synonyms" — das sind KEINE Übersetzungen, sondern
// zusätzliche Suchbegriffe, unter denen man das Icon ebenfalls findet (z. B.
// findet die Suche nach "linux" absichtlich auch Debian/Ubuntu/Terminal/Bash).
// Bestehende Emoji-Icons bleiben davon komplett unberührt — dieses Register
// ERGÄNZT sie nur, ersetzt nichts.

export const ICON_CATEGORIES = {
  os: 'Betriebssysteme',
  dev: 'Entwicklung',
  network: 'Netzwerk',
  hardware: 'Hardware',
  security: 'Sicherheit',
  docs: 'Dokumentation',
  projects: 'Projekte'
};

export const ICON_LIBRARY = [
  // --- Betriebssysteme ---
  { id: 'os/tux', label: 'Linux (Tux)', category: 'os', synonyms: ['linux', 'pinguin', 'penguin', 'tux'], brand: true },
  { id: 'os/debian', label: 'Debian', category: 'os', synonyms: ['linux', 'distro'], brand: true },
  { id: 'os/ubuntu', label: 'Ubuntu', category: 'os', synonyms: ['linux', 'distro'], brand: true },
  { id: 'os/fedora', label: 'Fedora', category: 'os', synonyms: ['linux', 'distro', 'redhat'], brand: true },
  { id: 'os/archlinux', label: 'Arch Linux', category: 'os', synonyms: ['linux', 'distro', 'arch'], brand: true },
  { id: 'os/opensuse', label: 'openSUSE', category: 'os', synonyms: ['linux', 'distro', 'suse'], brand: true },
  { id: 'os/apple', label: 'macOS', category: 'os', synonyms: ['apple', 'mac', 'osx'], brand: true },
  { id: 'os/android', label: 'Android', category: 'os', synonyms: ['handy', 'smartphone', 'mobil'], brand: true },

  // --- Entwicklung ---
  { id: 'dev/terminal', label: 'Terminal', category: 'dev', synonyms: ['linux', 'konsole', 'shell', 'cli', 'kommandozeile'], brand: false },
  { id: 'dev/terminal-square', label: 'Konsole', category: 'dev', synonyms: ['linux', 'terminal', 'shell', 'cli'], brand: false },
  { id: 'dev/gnubash', label: 'Bash', category: 'dev', synonyms: ['linux', 'shell', 'terminal', 'skript'], brand: true },
  { id: 'dev/git', label: 'Git', category: 'dev', synonyms: ['versionierung', 'code'], brand: true },
  { id: 'dev/git-branch', label: 'Git-Branch', category: 'dev', synonyms: ['git', 'zweig'], brand: false },
  { id: 'dev/git-commit', label: 'Git-Commit', category: 'dev', synonyms: ['git'], brand: false },
  { id: 'dev/git-merge', label: 'Git-Merge', category: 'dev', synonyms: ['git', 'zusammenführen'], brand: false },
  { id: 'dev/git-pull-request', label: 'Pull-Request', category: 'dev', synonyms: ['git', 'github'], brand: false },
  { id: 'dev/github', label: 'GitHub', category: 'dev', synonyms: ['git', 'repository', 'code'], brand: true },
  { id: 'dev/docker', label: 'Docker', category: 'dev', synonyms: ['container', 'virtualisierung'], brand: true },
  { id: 'dev/kubernetes', label: 'Kubernetes', category: 'dev', synonyms: ['container', 'k8s'], brand: true },
  { id: 'dev/nodedotjs', label: 'Node.js', category: 'dev', synonyms: ['javascript', 'npm'], brand: true },
  { id: 'dev/python', label: 'Python', category: 'dev', synonyms: ['programmiersprache', 'skript'], brand: true },
  { id: 'dev/rust', label: 'Rust', category: 'dev', synonyms: ['programmiersprache'], brand: true },
  { id: 'dev/mysql', label: 'MySQL', category: 'dev', synonyms: ['datenbank', 'sql'], brand: true },
  { id: 'dev/postgresql', label: 'PostgreSQL', category: 'dev', synonyms: ['datenbank', 'sql'], brand: true },
  { id: 'dev/nginx', label: 'Nginx', category: 'dev', synonyms: ['server', 'webserver'], brand: true },
  { id: 'dev/code', label: 'Code', category: 'dev', synonyms: ['programmieren', 'quellcode'], brand: false },
  { id: 'dev/brackets', label: 'Code-Klammern', category: 'dev', synonyms: ['code', 'programmieren'], brand: false },
  { id: 'dev/function-square', label: 'Funktion', category: 'dev', synonyms: ['code', 'programmieren'], brand: false },
  { id: 'dev/database', label: 'Datenbank', category: 'dev', synonyms: ['sql', 'db'], brand: false },
  { id: 'dev/server', label: 'Server', category: 'dev', synonyms: ['hosting'], brand: false },
  { id: 'dev/bug', label: 'Fehler/Debugging', category: 'dev', synonyms: ['debug', 'fehler', 'bug'], brand: false },

  // --- Netzwerk ---
  { id: 'network/globe', label: 'Internet', category: 'network', synonyms: ['weltkugel', 'web', 'www'], brand: false },
  { id: 'network/wifi', label: 'WLAN', category: 'network', synonyms: ['wifi', 'wireless', 'funk'], brand: false },
  { id: 'network/router', label: 'Router', category: 'network', synonyms: ['netzwerk', 'lan'], brand: false },
  { id: 'network/network', label: 'Netzwerk', category: 'network', synonyms: ['lan', 'verbindung'], brand: false },
  { id: 'network/cloud', label: 'Cloud', category: 'network', synonyms: ['speicher', 'online'], brand: false },
  { id: 'network/shield', label: 'Firewall/VPN', category: 'network', synonyms: ['sicherheit', 'schutz', 'vpn'], brand: false },
  { id: 'network/signal', label: 'Signal', category: 'network', synonyms: ['empfang', 'funk'], brand: false },
  { id: 'network/radio', label: 'Funk', category: 'network', synonyms: ['signal', 'wireless'], brand: false },
  { id: 'network/satellite', label: 'Satellit', category: 'network', synonyms: ['verbindung'], brand: false },
  { id: 'network/plug', label: 'Verbindung', category: 'network', synonyms: ['kabel', 'stecker'], brand: false },

  // --- Hardware ---
  { id: 'hardware/cpu', label: 'CPU', category: 'hardware', synonyms: ['prozessor'], brand: false },
  { id: 'hardware/hard-drive', label: 'Festplatte', category: 'hardware', synonyms: ['ssd', 'hdd', 'speicher'], brand: false },
  { id: 'hardware/monitor', label: 'Monitor', category: 'hardware', synonyms: ['bildschirm', 'display'], brand: false },
  { id: 'hardware/laptop', label: 'Notebook', category: 'hardware', synonyms: ['laptop', 'rechner'], brand: false },
  { id: 'hardware/battery', label: 'Akku', category: 'hardware', synonyms: ['battery', 'strom'], brand: false },
  { id: 'hardware/usb', label: 'USB', category: 'hardware', synonyms: ['anschluss', 'stick'], brand: false },
  { id: 'hardware/keyboard', label: 'Tastatur', category: 'hardware', synonyms: ['keyboard'], brand: false },
  { id: 'hardware/mouse', label: 'Maus', category: 'hardware', synonyms: ['mouse'], brand: false },
  { id: 'hardware/printer', label: 'Drucker', category: 'hardware', synonyms: ['printer'], brand: false },
  { id: 'hardware/camera', label: 'Kamera', category: 'hardware', synonyms: ['webcam', 'foto'], brand: false },
  { id: 'hardware/speaker', label: 'Lautsprecher', category: 'hardware', synonyms: ['audio', 'sound'], brand: false },
  { id: 'hardware/headphones', label: 'Kopfhörer', category: 'hardware', synonyms: ['audio', 'sound'], brand: false },
  { id: 'hardware/raspberrypi', label: 'Raspberry Pi', category: 'hardware', synonyms: ['pi', 'einplatinencomputer', 'linux'], brand: true },

  // --- Sicherheit ---
  { id: 'security/lock', label: 'Schloss', category: 'security', synonyms: ['sicherheit', 'gesperrt'], brand: false },
  { id: 'security/key', label: 'Schlüssel', category: 'security', synonyms: ['passwort', 'zugang'], brand: false },
  { id: 'security/fingerprint', label: 'Fingerabdruck', category: 'security', synonyms: ['biometrie', 'authentifizierung'], brand: false },
  { id: 'security/scan', label: 'Scan', category: 'security', synonyms: ['prüfen', 'überprüfung'], brand: false },
  { id: 'security/eye', label: 'Sichtbar', category: 'security', synonyms: ['anzeigen', 'passwort'], brand: false },
  { id: 'security/eye-off', label: 'Verborgen', category: 'security', synonyms: ['verstecken', 'passwort'], brand: false },
  { id: 'security/user-check', label: 'Verifiziert', category: 'security', synonyms: ['authentifizierung', 'nutzer'], brand: false },
  { id: 'security/alert-triangle', label: 'Warnung', category: 'security', synonyms: ['achtung', 'warnhinweis'], brand: false },
  { id: 'security/bell', label: 'Benachrichtigung', category: 'security', synonyms: ['erinnerung', 'alarm'], brand: false },

  // --- Dokumentation ---
  { id: 'docs/book', label: 'Buch', category: 'docs', synonyms: ['wiki', 'lesen'], brand: false },
  { id: 'docs/book-open', label: 'Aufgeschlagenes Buch', category: 'docs', synonyms: ['wiki', 'lesen'], brand: false },
  { id: 'docs/notebook', label: 'Notizbuch', category: 'docs', synonyms: ['notiz', 'notizen'], brand: false },
  { id: 'docs/file-text', label: 'Textdokument', category: 'docs', synonyms: ['dokument', 'markdown'], brand: false },
  { id: 'docs/file', label: 'Datei', category: 'docs', synonyms: ['dokument'], brand: false },
  { id: 'docs/files', label: 'Dateien', category: 'docs', synonyms: ['dokumente'], brand: false },
  { id: 'docs/folder', label: 'Ordner', category: 'docs', synonyms: ['kategorie', 'verzeichnis'], brand: false },
  { id: 'docs/clipboard', label: 'Notizzettel', category: 'docs', synonyms: ['notiz'], brand: false },
  { id: 'docs/clipboard-list', label: 'Checkliste-Dokument', category: 'docs', synonyms: ['aufgaben', 'liste'], brand: false },
  { id: 'docs/bookmark', label: 'Lesezeichen', category: 'docs', synonyms: ['favorit', 'markieren'], brand: false },
  { id: 'docs/tag', label: 'Schlagwort', category: 'docs', synonyms: ['tag', 'label'], brand: false },
  { id: 'docs/tags', label: 'Schlagwörter', category: 'docs', synonyms: ['tags', 'labels'], brand: false },

  // --- Projekte ---
  { id: 'projects/wrench', label: 'Werkzeug', category: 'projects', synonyms: ['tools', 'reparatur'], brand: false },
  { id: 'projects/settings', label: 'Zahnrad', category: 'projects', synonyms: ['einstellungen', 'settings'], brand: false },
  { id: 'projects/check-square', label: 'Checkliste', category: 'projects', synonyms: ['aufgabe', 'erledigt'], brand: false },
  { id: 'projects/list-checks', label: 'Aufgabenliste', category: 'projects', synonyms: ['checkliste', 'todo'], brand: false },
  { id: 'projects/calendar', label: 'Kalender', category: 'projects', synonyms: ['termin', 'datum'], brand: false },
  { id: 'projects/clock', label: 'Zeit', category: 'projects', synonyms: ['uhr', 'zeitpunkt'], brand: false },
  { id: 'projects/target', label: 'Ziel', category: 'projects', synonyms: ['fokus'], brand: false },
  { id: 'projects/lightbulb', label: 'Idee', category: 'projects', synonyms: ['glühbirne', 'einfall'], brand: false },
  { id: 'projects/layout-dashboard', label: 'Übersicht', category: 'projects', synonyms: ['dashboard'], brand: false },
  { id: 'projects/package', label: 'Paket', category: 'projects', synonyms: ['modul', 'box'], brand: false },
  { id: 'projects/box', label: 'Box', category: 'projects', synonyms: ['paket'], brand: false },
  { id: 'projects/archive', label: 'Archiv', category: 'projects', synonyms: ['ablage'], brand: false },
  { id: 'projects/flag', label: 'Markierung', category: 'projects', synonyms: ['flagge', 'wichtig'], brand: false },
  { id: 'projects/star', label: 'Stern', category: 'projects', synonyms: ['favorit', 'wichtig'], brand: false },
  { id: 'projects/trophy', label: 'Erfolg', category: 'projects', synonyms: ['pokal', 'ziel erreicht'], brand: false },
  { id: 'projects/rocket', label: 'Start', category: 'projects', synonyms: ['rakete', 'projekt starten'], brand: false },
  { id: 'projects/zap', label: 'Blitz', category: 'projects', synonyms: ['schnell', 'energie'], brand: false },
  { id: 'projects/sparkles', label: 'Neu', category: 'projects', synonyms: ['funken', 'highlight'], brand: false },
  { id: 'projects/users', label: 'Team', category: 'projects', synonyms: ['gruppe', 'personen'], brand: false },
  { id: 'projects/user', label: 'Person', category: 'projects', synonyms: ['nutzer', 'kontakt'], brand: false },
  { id: 'projects/hexagon', label: 'Sechseck', category: 'projects', synonyms: ['modul', 'baustein'], brand: false },
  { id: 'projects/layers', label: 'Ebenen', category: 'projects', synonyms: ['stapel', 'struktur'], brand: false }
];

const ICON_LIBRARY_IDS = new Set(ICON_LIBRARY.map(icon => icon.id));

// Frontmatter kann auch aus Importen oder synchronisierten Dateien stammen.
// Deshalb wird eine Icon-ID erst dann zu einem HTML-Attributwert, wenn sie
// exakt in der kuratierten Bibliothek enthalten ist.
export function resolveIconLibraryPath(iconId) {
  return ICON_LIBRARY_IDS.has(iconId)
    ? `assets/icon-library/${iconId}.svg`
    : null;
}

// Sucht per Name, Kategorie-Name und Synonymen — case-insensitive.
export function searchIconLibrary(query) {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_LIBRARY;
  return ICON_LIBRARY.filter(icon =>
    icon.label.toLowerCase().includes(q) ||
    ICON_CATEGORIES[icon.category].toLowerCase().includes(q) ||
    icon.synonyms.some(s => s.toLowerCase().includes(q))
  );
}
