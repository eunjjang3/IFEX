#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)
container_name="ifex-container-test-$$"
image_tag="ifex:container-test-$$"
response_dir=$(mktemp -d)

cleanup() {
  status=$?
  trap - EXIT INT TERM

  if [ "$status" -ne 0 ] && docker container inspect "$container_name" >/dev/null 2>&1; then
    docker logs "$container_name" >&2 || true
  fi
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    docker rm --force "$container_name" >/dev/null
  fi
  if docker image inspect "$image_tag" >/dev/null 2>&1; then
    docker image rm "$image_tag" >/dev/null
  fi
  rm -rf "$response_dir"
  exit "$status"
}
trap cleanup EXIT INT TERM

docker build --tag "$image_tag" "$repository_dir"
docker run --detach \
  --name "$container_name" \
  --publish 127.0.0.1::80 \
  --env IFEX_MAX_FILE_MIB=31 \
  --env IFEX_STATISTICS_SAMPLE_DIMENSION=512 \
  --env IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT=85 \
  "$image_tag" >/dev/null

host_ip=$(docker container inspect --format '{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostIp}}' "$container_name")
host_port=$(docker container inspect --format '{{(index (index .NetworkSettings.Ports "80/tcp") 0).HostPort}}' "$container_name")

if [ "$host_ip" != "127.0.0.1" ]; then
  echo "Container port must bind only to 127.0.0.1; got $host_ip." >&2
  exit 1
fi
case "$host_port" in
  ''|*[!0-9]*)
    echo "Docker returned an invalid host port." >&2
    exit 1
    ;;
esac

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$host_port/health" > "$response_dir/health.txt"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Container health endpoint did not become ready." >&2
    exit 1
  fi
  sleep 1
done

curl --fail --silent --show-error \
  --dump-header "$response_dir/index.headers" \
  --output "$response_dir/index.html" \
  "http://127.0.0.1:$host_port/"
curl --fail --silent --show-error \
  --dump-header "$response_dir/runtime.headers" \
  --output "$response_dir/runtime-config.js" \
  "http://127.0.0.1:$host_port/runtime-config.js"

grep -F "IFEX_MAX_FILE_MIB: '31'" "$response_dir/runtime-config.js" >/dev/null
grep -F "IFEX_STATISTICS_SAMPLE_DIMENSION: '512'" "$response_dir/runtime-config.js" >/dev/null
grep -F "IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT: '85'" "$response_dir/runtime-config.js" >/dev/null
grep -i '^Cache-Control: no-store' "$response_dir/runtime.headers" >/dev/null
grep -i '^Content-Security-Policy:' "$response_dir/index.headers" >/dev/null
grep -i '^X-Frame-Options: DENY' "$response_dir/index.headers" >/dev/null
grep -i '^X-Content-Type-Options: nosniff' "$response_dir/index.headers" >/dev/null
grep -i '^Referrer-Policy: strict-origin-when-cross-origin' "$response_dir/index.headers" >/dev/null
grep -i '^Permissions-Policy:' "$response_dir/index.headers" >/dev/null

if grep -E 'fonts\.(googleapis|gstatic)\.com' "$response_dir/index.html" "$response_dir/index.headers"; then
  echo "Container output unexpectedly references an external font provider." >&2
  exit 1
fi

printf 'Container verified on %s:%s (loopback only).\n' "$host_ip" "$host_port"
