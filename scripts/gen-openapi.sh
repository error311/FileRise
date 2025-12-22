#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

php -r 'require "'"$ROOT"'/vendor/autoload.php"; $openapi = OpenApi\Generator::scan(["'"$ROOT"'/src/openapi","'"$ROOT"'/public/api"], ["analyser" => new OpenApi\Analysers\TokenAnalyser()]); if ($openapi) { $openapi->saveAs("'"$ROOT"'/openapi.json.dist", "json"); }'
