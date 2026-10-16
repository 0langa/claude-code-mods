#!/bin/sh
# Stops personal data from reaching this public repository. See PRIVACY.md.
#
#   privacy-scan.sh staged            what is about to be committed
#   privacy-scan.sh range <rev-args>  every commit in a range (git rev-list arguments)
#   privacy-scan.sh tree              every tracked file as it is now
#
# A line that carries the word privacy-ok is skipped. Exit 1 when anything is found.
# Words only you know go in .privacy/denylist.local.txt, which git ignores.

mode="${1:-}"
[ $# -gt 0 ] && shift

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "privacy-scan: not inside a git repository" >&2; exit 2; }
cd "$root" || exit 2

work=$(mktemp -d 2>/dev/null || mktemp -d -t privacy) || exit 2
trap 'rm -rf "$work"' EXIT HUP INT TERM

denylist=.privacy/denylist.local.txt
unit=""
printed="(nothing yet)"

# A home folder with a real name in it. These two lines hold the pattern itself, so they carry the skip word.
path_rule='([A-Za-z]:[\\/]+Users[\\/]+[^\\/ <>:]+|/Users/[^/ <>:]+|/home/[^/ <>:]+)' # privacy-ok
path_allow='s#(Users[\\/]+|/home/)(you|You|user|User|username|Username|name|Name|me|example|runner|your-name|yourname|YourName|<[^>]*>|\$[A-Za-z_{]+|%[A-Za-z_]+%)##g' # privacy-ok

# Printed once per commit (or once for the whole run), before its first finding.
report() {
  if [ "$printed" != "$unit" ]; then
    printf '\nprivacy-scan: %s\n' "${unit:-found something that must not be public}" >&2
    printed="$unit"
  fi
  printf '  [%s]\n%s\n' "$1" "$2" | sed '2,$s/^/      /' >&2
  : > "$work/found"
}

# A unified diff in, "path:line: added text" out.
diff_records() {
  awk '
    /^\+\+\+ / { file = substr($0, 7); if ($0 == "+++ /dev/null") file = ""; next }
    /^@@ /     { if (match($0, /\+[0-9]+/)) line = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
    /^\+/      { if (file != "") print file ":" line ": " substr($0, 2); line++ }
  '
}

# scan_rule <id> <ERE> [sed -E program that erases text which is allowed]
scan_rule() {
  if [ -n "${3:-}" ]; then
    sed -E "$3" "$records" > "$work/clean"
  else
    cp "$records" "$work/clean"
  fi
  out=$(grep -E -e "$2" "$work/clean" | cut -c1-200)
  [ -n "$out" ] && report "$1" "$out"
}

# check <file of paths> <file of added lines>
check() {
  names="$1"
  grep -v 'privacy-ok' "$2" > "$work/lines" 2>/dev/null
  records="$work/lines"

  # Files that hold personal data by their nature.
  out=$(grep -E \
    -e '(^|/)\.(secrets|privacy|recall)(/|$)' \
    -e '(^|/)\.env(\.|$)' \
    -e '\.(sqlite3?|db|pem|key|p12|pfx|kdbx)$' \
    -e '\.local\.[^/]+$' \
    -e '(^|/)settings\.local\.json$' \
    -e '\.store\.json$' \
    -e '(^|/)[^/]*(terms|dictionary|vocabulary|glossary)[^/]*\.(json|txt|csv|ya?ml)$' \
    "$names")
  [ -n "$out" ] && report "file-name" "$(printf '%s\n' "$out" | sed 's/$/  (stays on your machine)/')"

  scan_rule private-key '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  scan_rule token '(sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]{20,}|xox[abprs]-[0-9A-Za-z-]{10,}|AKIA[0-9A-Z]{16}|hf_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,})'
  scan_rule personal-path "$path_rule" "$path_allow"
  scan_rule email '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' \
    's#[A-Za-z0-9._%+-]+@(users\.noreply\.github\.com|example\.(com|org|net)|anthropic\.com|localhost)##g'
  scan_rule youtube-id '(youtube\.com/(watch\?v=|shorts/|embed/|live/)|youtu\.be/|video_?[Ii]d[^A-Za-z0-9_-]{1,5})[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)' \
    's#AAAAAAAAAAA##g'
  scan_rule writes-a-file '\$\.fs\.write\('

  if [ -s "$work/deny" ]; then
    out=$(grep -i -F -f "$work/deny" "$records" | cut -c1-200)
    [ -n "$out" ] && report "denylist" "$out"
    out=$(grep -i -F -f "$work/deny" "$names")
    [ -n "$out" ] && report "denylist (file name)" "$out"
  fi
}

# Your own words, from a file git ignores. Comments and blank lines are skipped.
: > "$work/deny"
if [ -f "$denylist" ]; then
  grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$denylist" > "$work/deny"
fi

case "$mode" in
  staged)
    git diff --cached --name-only --diff-filter=ACMR > "$work/names"
    git diff --cached -U0 --no-color --no-ext-diff --diff-filter=ACMR --src-prefix=a/ --dst-prefix=b/ | diff_records > "$work/rec"
    check "$work/names" "$work/rec"
    ;;
  tree)
    git ls-files > "$work/names"
    git grep -n -I -e '' > "$work/rec"
    check "$work/names" "$work/rec"
    ;;
  range)
    for sha in $(git rev-list --reverse --no-merges "$@"); do
      unit="commit $(git log -1 --format='%h %s' "$sha")"
      git diff-tree -r --root --no-commit-id --name-only --diff-filter=ACMR "$sha" > "$work/names"
      git show --format= -U0 --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$sha" | diff_records > "$work/rec"
      check "$work/names" "$work/rec"
    done
    ;;
  *)
    echo "usage: privacy-scan.sh staged | tree | range <rev-list args>" >&2
    exit 2
    ;;
esac

if [ -e "$work/found" ]; then
  cat >&2 <<'EOF'

This repository is public. Remove or replace what is listed above before it goes in.
- A harmless example (a fake ID, a made-up path): put the word privacy-ok on that line.
- Something that is yours alone: keep it out, and add its words to .privacy/denylist.local.txt
  so this check also catches it next time.
- Skipping this check (git commit --no-verify) is for a finding you have read and judged fine.
EOF
  exit 1
fi
exit 0
