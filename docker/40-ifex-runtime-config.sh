#!/bin/sh
set -eu

config_path=/usr/share/nginx/html/runtime-config.js

read_integer() {
  variable_name=$1
  default_value=$2
  minimum_value=$3
  maximum_value=$4
  raw_value=$(printenv "$variable_name" 2>/dev/null || true)
  if [ -z "$raw_value" ]; then
    printf '%s' "$default_value"
    return
  fi
  case "$raw_value" in
    *[!0-9]*)
      echo "[IFEX security config] $variable_name is invalid; using $default_value." >&2
      printf '%s' "$default_value"
      return
      ;;
  esac
  if [ "$raw_value" -lt "$minimum_value" ] || [ "$raw_value" -gt "$maximum_value" ]; then
    echo "[IFEX security config] $variable_name is outside $minimum_value-$maximum_value; using $default_value." >&2
    printf '%s' "$default_value"
    return
  fi
  printf '%s' "$raw_value"
}

read_boolean() {
  variable_name=$1
  default_value=$2
  raw_value=$(printenv "$variable_name" 2>/dev/null || true)
  case "$raw_value" in
    '') printf '%s' "$default_value" ;;
    true|false) printf '%s' "$raw_value" ;;
    *)
      echo "[IFEX security config] $variable_name must be true or false; using $default_value." >&2
      printf '%s' "$default_value"
      ;;
  esac
}

strict_file_types=$(read_boolean IFEX_STRICT_FILE_TYPES true)
max_file_mib=$(read_integer IFEX_MAX_FILE_MIB 25 1 512)
max_active_files=$(read_integer IFEX_MAX_ACTIVE_FILES 4 1 50)
max_active_mib=$(read_integer IFEX_MAX_ACTIVE_MIB 64 1 2048)
max_image_megapixels=$(read_integer IFEX_MAX_IMAGE_MEGAPIXELS 40 1 200)
max_preview_dimension=$(read_integer IFEX_MAX_PREVIEW_DIMENSION 2048 256 8192)
statistics_sample_dimension=$(read_integer IFEX_STATISTICS_SAMPLE_DIMENSION 400 64 1024)
max_embedded_thumbnail_dimension=$(read_integer IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION 1024 128 4096)
max_pixel_dimension=$(read_integer IFEX_MAX_PIXEL_DIMENSION 2048 256 4096)
max_search_copy_dimension=$(read_integer IFEX_MAX_SEARCH_COPY_DIMENSION 1600 256 4096)
search_copy_jpeg_quality_percent=$(read_integer IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT 90 50 100)
parse_concurrency=$(read_integer IFEX_PARSE_CONCURRENCY 1 1 4)
parse_timeout_ms=$(read_integer IFEX_PARSE_TIMEOUT_MS 15000 1000 120000)
pixel_timeout_ms=$(read_integer IFEX_PIXEL_TIMEOUT_MS 20000 1000 120000)
max_metadata_tags=$(read_integer IFEX_MAX_METADATA_TAGS 2000 100 10000)
max_metadata_value_chars=$(read_integer IFEX_MAX_METADATA_VALUE_CHARS 16384 256 1048576)
max_metadata_total_chars=$(read_integer IFEX_MAX_METADATA_TOTAL_CHARS 1048576 65536 16777216)
allow_unsafe_preview=$(read_boolean IFEX_ALLOW_UNSAFE_PREVIEW false)

umask 022
tmp_path="${config_path}.tmp"
{
  echo 'globalThis.__IFEX_CONFIG__ = Object.freeze({'
  echo "  IFEX_STRICT_FILE_TYPES: '$strict_file_types',"
  echo "  IFEX_MAX_FILE_MIB: '$max_file_mib',"
  echo "  IFEX_MAX_ACTIVE_FILES: '$max_active_files',"
  echo "  IFEX_MAX_ACTIVE_MIB: '$max_active_mib',"
  echo "  IFEX_MAX_IMAGE_MEGAPIXELS: '$max_image_megapixels',"
  echo "  IFEX_MAX_PREVIEW_DIMENSION: '$max_preview_dimension',"
  echo "  IFEX_STATISTICS_SAMPLE_DIMENSION: '$statistics_sample_dimension',"
  echo "  IFEX_MAX_EMBEDDED_THUMBNAIL_DIMENSION: '$max_embedded_thumbnail_dimension',"
  echo "  IFEX_MAX_PIXEL_DIMENSION: '$max_pixel_dimension',"
  echo "  IFEX_MAX_SEARCH_COPY_DIMENSION: '$max_search_copy_dimension',"
  echo "  IFEX_SEARCH_COPY_JPEG_QUALITY_PERCENT: '$search_copy_jpeg_quality_percent',"
  echo "  IFEX_PARSE_CONCURRENCY: '$parse_concurrency',"
  echo "  IFEX_PARSE_TIMEOUT_MS: '$parse_timeout_ms',"
  echo "  IFEX_PIXEL_TIMEOUT_MS: '$pixel_timeout_ms',"
  echo "  IFEX_MAX_METADATA_TAGS: '$max_metadata_tags',"
  echo "  IFEX_MAX_METADATA_VALUE_CHARS: '$max_metadata_value_chars',"
  echo "  IFEX_MAX_METADATA_TOTAL_CHARS: '$max_metadata_total_chars',"
  echo "  IFEX_ALLOW_UNSAFE_PREVIEW: '$allow_unsafe_preview'"
  echo '});'
} > "$tmp_path"
mv "$tmp_path" "$config_path"
