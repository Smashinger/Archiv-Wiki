#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="de.smashii.archivwiki.webclip"
EXTENSION_ID="dengpgfllpkndkgkbikigaejieogndbp"
FIREFOX_EXTENSION_ID="webclip@archiv-wiki.smashii.de"
BRAVE_FLATPAK_ID="com.brave.Browser"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RESOURCE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
HOST_PATH="$SCRIPT_DIR/archiv-wiki-native-host"
NATIVE_HOST_JS="$SCRIPT_DIR/native-host.js"
WEBCLIP_TRANSPORT_JS="$RESOURCE_ROOT/main/webclip-transport.js"
MANIFEST_NAME="$HOST_NAME.json"
MODE="development"
APPIMAGE_PATH=""
QUIET=0

if [[ "${1:-}" == "--appimage" ]]; then
  if [[ "$#" -ne 2 ]]; then
    echo "Fehler: --appimage erwartet genau einen absoluten AppImage-Pfad." >&2
    exit 1
  fi
  MODE="appimage"
  APPIMAGE_PATH="$2"
  QUIET=1
elif [[ "$#" -ne 0 ]]; then
  echo "Fehler: Unbekannte Argumente." >&2
  exit 1
fi

if [[ "$MODE" == "appimage" && ! -f "$WEBCLIP_TRANSPORT_JS" ]]; then
  # Im Paket bleibt webclip-transport.js logisch Bestandteil von app.asar,
  # liegt durch asarUnpack aber zusätzlich als echte Runtime-Datei daneben.
  WEBCLIP_TRANSPORT_JS="$RESOURCE_ROOT/../app.asar.unpacked/main/webclip-transport.js"
fi

atomic_write_file() {
  local target="$1"
  local mode="$2"
  local target_dir target_name temporary
  target_dir="$(dirname -- "$target")"
  target_name="$(basename -- "$target")"
  mkdir -p -- "$target_dir"
  temporary="$(mktemp -- "$target_dir/.${target_name}.tmp.XXXXXX")"

  if ! cat > "$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi

  if [[ -f "$target" ]] && cmp -s -- "$temporary" "$target"; then
    rm -f -- "$temporary"
    if [[ "$(stat -c '%a' -- "$target")" != "$mode" ]]; then
      chmod "$mode" -- "$target"
    fi
    return 0
  fi

  if ! chmod "$mode" -- "$temporary"; then
    rm -f -- "$temporary"
    return 1
  fi
  if ! mv -f -- "$temporary" "$target"; then
    rm -f -- "$temporary"
    return 1
  fi
}

install_runtime_file() {
  local source="$1"
  local target="$2"
  local mode="$3"
  if [[ ! -f "$source" ]]; then
    echo "Fehler: Native-Host-Ressource fehlt: $source" >&2
    return 1
  fi
  atomic_write_file "$target" "$mode" < "$source"
}

write_chromium_manifest() {
  local target="$1"
  local executable_path="$2"
  atomic_write_file "$target/$MANIFEST_NAME" 644 <<JSON
{
  "name": "$HOST_NAME",
  "description": "Lokale Übergabe von Webseiten an den Archiv-Wiki Eingang",
  "path": "$executable_path",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON
  if [[ "$QUIET" -eq 0 ]]; then
    echo "Native Host registriert: $target/$MANIFEST_NAME"
  fi
}

write_firefox_manifest() {
  local target="$1"
  local executable_path="$2"
  atomic_write_file "$target/$MANIFEST_NAME" 644 <<JSON
{
  "name": "$HOST_NAME",
  "description": "Lokale Übergabe von Webseiten an den Archiv-Wiki Eingang",
  "path": "$executable_path",
  "type": "stdio",
  "allowed_extensions": [
    "$FIREFOX_EXTENSION_ID"
  ]
}
JSON
  if [[ "$QUIET" -eq 0 ]]; then
    echo "Firefox Native Host registriert: $target/$MANIFEST_NAME"
  fi
}

# Normal installiertes Firefox liest benutzerspezifische Native-Messaging-Hosts
# aus ~/.mozilla/native-messaging-hosts. Firefox-Flatpak bleibt bewusst unberührt.
FIREFOX_NATIVE_DIR="$HOME/.mozilla/native-messaging-hosts"

# Normale Chromium-Installationen auf dem Host.
TARGETS=(
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/.config/vivaldi/NativeMessagingHosts"
)

brave_flatpak_is_installed() {
  command -v flatpak >/dev/null 2>&1 \
    && flatpak info "$BRAVE_FLATPAK_ID" >/dev/null 2>&1
}

install_brave_flatpak_native_host() {
  local host_command brave_flatpak_root brave_native_dir brave_wrapper_dir brave_wrapper
  printf -v host_command '%q ' "$@"

  brave_flatpak_root="$HOME/.var/app/$BRAVE_FLATPAK_ID"
  brave_native_dir="$brave_flatpak_root/config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  brave_wrapper_dir="$brave_flatpak_root/data/archiv-wiki"
  brave_wrapper="$brave_wrapper_dir/archiv-wiki-native-host-flatpak"

  atomic_write_file "$brave_wrapper" 755 <<EOF_WRAPPER
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/flatpak-spawn --host ${host_command}"\$@"
EOF_WRAPPER

  # Sicherheitsfund WC-SP-002/M15: dieser Wrapper allein installiert oder
  # aktiviert nichts, das Brave tatsächlich ausführen kann. `flatpak-spawn
  # --host` scheitert ohne die Brave-seitige Berechtigung für
  # org.freedesktop.Flatpak — genau diese persistente, app-weite
  # Sandbox-Erweiterung wird hier bewusst NICHT mehr automatisch gesetzt.
  # Sie entsteht ausschließlich nach ausdrücklicher Nutzerzustimmung über
  # Einstellungen → Web Clipper → Brave (main/webclip-distribution.js).
  if [[ "$QUIET" -eq 0 ]]; then
    echo "Brave Flatpak erkannt: $BRAVE_FLATPAK_ID"
    echo "Native-Messaging-Registrierung vorbereitet (noch ohne Host-Berechtigung)."
  fi

  write_chromium_manifest "$brave_native_dir" "$brave_wrapper"
  if [[ "$QUIET" -eq 0 ]]; then
    echo "Brave Flatpak: Für Native Messaging in Archiv-Wiki unter Einstellungen → Web Clipper → Brave zustimmen, danach Brave vollständig neu starten."
  fi
}

if [[ "$MODE" == "appimage" ]]; then
  if [[ "$APPIMAGE_PATH" != /* ]]; then
    echo "Fehler: Der AppImage-Pfad muss absolut sein." >&2
    exit 1
  fi
  if [[ ! -f "$APPIMAGE_PATH" || ! -x "$APPIMAGE_PATH" ]]; then
    echo "Fehler: Das AppImage wurde nicht gefunden oder ist nicht ausführbar: $APPIMAGE_PATH" >&2
    exit 1
  fi

  DATA_HOME="${XDG_DATA_HOME:-}"
  if [[ -z "$DATA_HOME" || "$DATA_HOME" != /* ]]; then
    DATA_HOME="$HOME/.local/share"
  fi
  INSTALL_ROOT="$DATA_HOME/archiv-wiki/native-host"
  STABLE_HOST_DIR="$INSTALL_ROOT/extension/native-host"
  STABLE_MAIN_DIR="$INSTALL_ROOT/main"
  STABLE_HOST_PATH="$STABLE_HOST_DIR/archiv-wiki-native-host"
  STABLE_NATIVE_HOST_JS="$STABLE_HOST_DIR/native-host.js"
  STABLE_TRANSPORT_JS="$STABLE_MAIN_DIR/webclip-transport.js"

  install_runtime_file "$NATIVE_HOST_JS" "$STABLE_NATIVE_HOST_JS" 644
  install_runtime_file "$WEBCLIP_TRANSPORT_JS" "$STABLE_TRANSPORT_JS" 644

  printf -v APPIMAGE_SHELL_PATH '%q' "$APPIMAGE_PATH"
  atomic_write_file "$STABLE_HOST_PATH" 755 <<EOF_WRAPPER
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="\$(cd -- "\$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
exec env ELECTRON_RUN_AS_NODE=1 $APPIMAGE_SHELL_PATH "\$SCRIPT_DIR/native-host.js" "\$@"
EOF_WRAPPER

  write_firefox_manifest "$FIREFOX_NATIVE_DIR" "$STABLE_HOST_PATH"
  for target in "${TARGETS[@]}"; do
    write_chromium_manifest "$target" "$STABLE_HOST_PATH"
  done
  if brave_flatpak_is_installed; then
    # Der Sandbox-Wrapper startet denselben stabilen AppImage-Host wie normale
    # Browser. Dadurch bleibt der Endnutzerweg unabhängig von Node.js und dem
    # Entwicklungsquellstand.
    install_brave_flatpak_native_host "$STABLE_HOST_PATH"
  fi
  exit 0
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Fehler: Node.js wurde nicht gefunden. Bitte zuerst 'npm install' bzw. die Archiv-Wiki-Abhängigkeiten einrichten." >&2
  exit 1
fi

chmod +x "$HOST_PATH" "$NATIVE_HOST_JS"

installed=0
write_firefox_manifest "$FIREFOX_NATIVE_DIR" "$HOST_PATH"

for target in "${TARGETS[@]}"; do
  browser_root="$(dirname "$target")"
  if [[ ! -d "$browser_root" ]]; then
    continue
  fi
  write_chromium_manifest "$target" "$HOST_PATH"
  installed=1
done

# Brave als Flatpak läuft in einer Sandbox. Der Browser kann den Host-Prozess
# deshalb nicht direkt starten. Der gemeinsame Wrapper verwendet flatpak-spawn,
# um ausschließlich den vorhandenen Archiv-Wiki-Native-Host auf dem Hostsystem
# zu starten.
if brave_flatpak_is_installed; then
  install_brave_flatpak_native_host "$NODE_BIN" "$NATIVE_HOST_JS"
  installed=1
fi

if [[ "$installed" -eq 0 ]]; then
  # Chromium ist der neutrale Fallback für Test-/Entwicklungsumgebungen.
  target="$HOME/.config/chromium/NativeMessagingHosts"
  write_chromium_manifest "$target" "$HOST_PATH"
fi
