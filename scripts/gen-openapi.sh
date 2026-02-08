#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export FR_ROOT="$ROOT"

php <<'PHP'
<?php

$root = getenv('FR_ROOT') ?: '';
if ($root === '') {
    fwrite(STDERR, "FR_ROOT is not set.\n");
    exit(1);
}

require $root . '/vendor/autoload.php';

$openapi = OpenApi\Generator::scan(
    [$root . '/src/FileRise/OpenApi', $root . '/public/api'],
    ['analyser' => new OpenApi\Analysers\TokenAnalyser()]
);

if ($openapi) {
    $openapi->saveAs($root . '/openapi.json.dist', 'json');
}
PHP
