#!/usr/bin/env sh
# Installs the motionvideo CLI for testers:
#   curl -fsSL https://raw.githubusercontent.com/samyakkkk/motionvideo-cli/main/install.sh | sh
# Keep the package in ~/.motionvideo and link it onto PATH, without sudo. Run again to update.
set -eu

URL="${MOTIONVIDEO_CLI_URL:-https://github.com/samyakkkk/motionvideo-cli/releases/download/staging/motionvideo.tgz}"
PREFIX="${MOTIONVIDEO_HOME:-$HOME/.motionvideo}"
BIN="$PREFIX/bin"

fail() { printf 'motionvideo install: %s\n' "$1" >&2; exit 1; }

case "$PREFIX" in /*) ;; *) fail "MOTIONVIDEO_HOME must be an absolute path." ;; esac
command -v curl >/dev/null 2>&1 || fail "curl is required. Install it, then run this again."
command -v node >/dev/null 2>&1 || fail "Node.js 22.18 or newer is needed. Install it from https://nodejs.org (or: brew install node), then run this again."
command -v npm >/dev/null 2>&1 || fail "npm is missing. It comes with Node.js from https://nodejs.org."
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' \
  || fail "Node.js 22.18 or newer is needed; this is $(node -v). Update it from https://nodejs.org, then run this again."

existing="$(command -v motionvideo || true)"
if [ -n "$existing" ] && [ "$existing" != "$BIN/motionvideo" ]; then
  if [ ! -L "$existing" ] || [ "$(readlink "$existing")" != "$BIN/motionvideo" ]; then
    fail "Another motionvideo installation is already on PATH at $existing. Remove it before installing this build."
  fi
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'Downloading the motionvideo CLI...\n'
curl -fsSL --connect-timeout 15 --max-time 120 --retry 2 "$URL" -o "$tmp/motionvideo.tgz" || fail "Could not download $URL"
curl -fsSL --connect-timeout 15 --max-time 120 --retry 2 "${URL}.sha256" -o "$tmp/motionvideo.tgz.sha256" || fail "Could not download the release checksum."
node - "$tmp/motionvideo.tgz" "$tmp/motionvideo.tgz.sha256" <<'NODE' || fail "Release checksum did not match. Run the installer again."
const fs = require('node:fs');
const crypto = require('node:crypto');
const expected = fs.readFileSync(process.argv[3], 'utf8').trim().split(/\s+/)[0];
const actual = crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex');
if (!/^[a-f0-9]{64}$/i.test(expected) || actual !== expected.toLowerCase()) process.exit(1);
NODE
npm install --global --prefix "$PREFIX" "$tmp/motionvideo.tgz" --omit=dev --ignore-scripts --silent --no-fund --no-audit >/dev/null
[ -x "$BIN/motionvideo" ] || fail "The install finished but $BIN/motionvideo is missing."

# A child process cannot change the calling terminal's PATH. Prefer an existing
# writable PATH directory so the command works in that terminal immediately.
# Parse without word splitting/globbing: PATH entries may contain spaces.
link_bin=""
remaining="${PATH:-}"
while :; do
  directory="${remaining%%:*}"
  case "$directory" in
    /*)
      if [ "$directory" = "$BIN" ]; then
        link_bin="$BIN"
        break
      fi
      if [ -d "$directory" ] && [ -w "$directory" ]; then
        destination="$directory/motionvideo"
        # Never replace another installation or follow a directory symlink.
        if [ ! -e "$destination" ] && [ ! -L "$destination" ]; then
          if ln -s "$BIN/motionvideo" "$destination" 2>/dev/null; then
            link_bin="$directory"
            break
          fi
        elif [ -L "$destination" ] && [ "$(readlink "$destination")" = "$BIN/motionvideo" ]; then
          link_bin="$directory"
          break
        fi
      fi
      ;;
  esac
  case "$remaining" in *:*) remaining="${remaining#*:}" ;; *) break ;; esac
done

append_path() {
  rc="$1"
  mkdir -p "$(dirname "$rc")"
  if ! grep -qsFx "$line" "$rc"; then
    printf '\n# motionvideo CLI\n%s\n' "$line" >> "$rc" \
      || fail "Could not configure $rc. The CLI is available at $BIN/motionvideo."
  fi
}

ready=true
if [ -z "$link_bin" ]; then
  # No writable directory on PATH. Configure the user's shell automatically;
  # the new terminal picks this up without a manual export/source command.
  link_bin="$HOME/.local/bin"
  mkdir -p "$link_bin"
  destination="$link_bin/motionvideo"
  if [ "$link_bin" = "$BIN" ]; then
    :
  elif [ -L "$destination" ] && [ "$(readlink "$destination")" = "$BIN/motionvideo" ]; then
    :
  else
    if [ -e "$destination" ] || [ -L "$destination" ]; then
      fail "Could not link $destination; an existing installation was left untouched."
    fi
    ln -s "$BIN/motionvideo" "$destination" \
      || fail "Could not link $destination; an existing installation was left untouched."
  fi
  escaped_bin="$(printf '%s' "$link_bin" | sed 's/[\\"$`]/\\&/g')"
  line="export PATH=\"$escaped_bin:\$PATH\""
  user_shell="${SHELL:-sh}"
  case "${user_shell##*/}" in
    zsh) append_path "${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      append_path "$HOME/.bashrc"
      # Bash reads only the first existing login file in this order.
      if [ -f "$HOME/.bash_profile" ]; then append_path "$HOME/.bash_profile"
      elif [ -f "$HOME/.bash_login" ]; then append_path "$HOME/.bash_login"
      else append_path "$HOME/.profile"; fi
      ;;
    fish)
      line="fish_add_path --prepend \"$escaped_bin\""
      append_path "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/motionvideo.fish"
      ;;
    *) append_path "$HOME/.profile" ;;
  esac
  ready=false
fi

version="$(node -p 'require(process.argv[1]).version' "$PREFIX/lib/node_modules/motionvideo/package.json" 2>/dev/null || true)"
printf '\nInstalled motionvideo %s in %s\n' "$version" "$BIN"
if [ "$ready" = true ]; then
  printf 'Next: motionvideo search "charts"\n'
else
  printf 'PATH configured automatically. Open a new terminal, then: motionvideo search "charts"\n'
fi
