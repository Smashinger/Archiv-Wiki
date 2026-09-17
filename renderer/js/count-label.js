// renderer/js/count-label.js
// Einheitliche Mengenangaben ("1 Notiz", "3 Notizen", "0 Einträge").
//
// Früher hing jede Stelle eine Endung an den Wortstamm
// (`Eintrag${n === 1 ? '' : 'e'}`). Das kann keine Plurale mit Umlaut oder
// Stammänderung bilden und erzeugte im Papierkorb "0 Eintrage". Singular und
// Plural werden deshalb immer vollständig ausgeschrieben übergeben.

/**
 * Wählt Singular (genau 1) oder Plural (alles andere, auch 0).
 * @param {number} count
 * @param {string} singular z. B. "Eintrag"
 * @param {string} plural   z. B. "Einträge"
 * @returns {string} nur das Wort, ohne Zahl
 */
export function pluralWord(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

/**
 * Zahl plus passendes Wort, z. B. countLabel(0, 'Eintrag', 'Einträge') → "0 Einträge".
 */
export function countLabel(count, singular, plural) {
  return `${count} ${pluralWord(count, singular, plural)}`;
}
