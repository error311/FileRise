<?php
// public/index.php

require_once __DIR__ . '/../config/config.php';

function sanitize_color_hex($value): string
{
    $value = trim((string)$value);
    if ($value === '') return '';
    return preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value, $m)
        ? '#' . $m[1]
        : '';
}

function sanitize_icon_url($value): string
{
    $value = trim((string)$value);
    if ($value === '') return '';
    if ($value[0] !== '/' && !preg_match('~^[a-z][a-z0-9+.\-]*:~i', $value)) {
        $value = '/' . ltrim($value, '/');
    }
    if ($value[0] === '/') {
        if (strpos($value, '://') !== false) return '';
        return preg_replace('~[\r\n]+~', '', $value);
    }
    $scheme = strtolower(parse_url($value, PHP_URL_SCHEME) ?: '');
    if ($scheme === 'http' || $scheme === 'https') {
        return preg_replace('~[\r\n]+~', '', $value);
    }
    return '';
}

function with_base_if_relative(string $href): string
{
    if ($href !== '' && $href[0] === '/') {
        return fr_with_base_path($href);
    }
    return $href;
}

function replace_meta_tag(string $html, string $name, string $content): string
{
    $escaped = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');
    $pattern = '~<meta\\s+name=["\']' . preg_quote($name, '~') . '["\'][^>]*>~i';
    $replacement = '<meta name="' . $name . '" content="' . $escaped . '">';
    $count = 0;
    $out = preg_replace($pattern, $replacement, $html, 1, $count);
    if ($count === 0) {
        $out = str_replace('</head>', "  {$replacement}\n</head>", $out);
    }
    return $out;
}

function replace_link_href(string $html, string $rel, string $href, string $type = '', bool $all = false): string
{
    $escaped = htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
    $relPat = preg_quote($rel, '~');
    $typePat = $type !== ''
        ? '[^>]*\\stype=["\']' . preg_quote($type, '~') . '["\']'
        : '[^>]*';
    $pattern = '~(<link\\s+' . $typePat . '[^>]*\\srel=["\']' . $relPat . '["\'][^>]*href=["\'])([^"\']*)(["\'][^>]*>)~i';
    $limit = $all ? -1 : 1;
    $count = 0;
    $out = preg_replace($pattern, '$1' . $escaped . '$3', $html, $limit, $count);
    if ($count === 0) {
        $attrs = 'rel="' . $rel . '"';
        if ($type !== '') $attrs .= ' type="' . htmlspecialchars($type, ENT_QUOTES, 'UTF-8') . '"';
        $tag = '<link ' . $attrs . ' href="' . $escaped . '">';
        $out = str_replace('</head>', "  {$tag}\n</head>", $out);
    }
    return $out;
}

function insert_mask_icon(string $html, string $href, string $color = ''): string
{
    if (stripos($html, 'rel="mask-icon"') !== false || stripos($html, "rel='mask-icon'") !== false) {
        return $html;
    }
    $attrs = 'rel="mask-icon" href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '"';
    if ($color !== '') {
        $attrs .= ' color="' . htmlspecialchars($color, ENT_QUOTES, 'UTF-8') . '"';
    }
    $tag = '<link ' . $attrs . '>';
    return str_replace('</head>', "  {$tag}\n</head>", $html);
}

$siteCfgPath = rtrim(USERS_DIR, '/\\') . DIRECTORY_SEPARATOR . 'siteConfig.json';
$cfg = [];
if (is_file($siteCfgPath)) {
    $raw = @file_get_contents($siteCfgPath);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $cfg = $decoded;
    }
}

$branding = (isset($cfg['branding']) && is_array($cfg['branding'])) ? $cfg['branding'] : [];
$title = trim((string)($cfg['header_title'] ?? 'FileRise'));
$title = $title !== '' ? $title : 'FileRise';
$metaDescription = trim((string)($branding['metaDescription'] ?? ''));

$themeColorLight = sanitize_color_hex($branding['themeColorLight'] ?? '');
$faviconSvg = with_base_if_relative(sanitize_icon_url($branding['faviconSvg'] ?? ''));
$faviconPng = with_base_if_relative(sanitize_icon_url($branding['faviconPng'] ?? ''));
$faviconIco = with_base_if_relative(sanitize_icon_url($branding['faviconIco'] ?? ''));
$appleTouch = with_base_if_relative(sanitize_icon_url($branding['appleTouchIcon'] ?? ''));
$maskIcon = with_base_if_relative(sanitize_icon_url($branding['maskIcon'] ?? ''));
$maskColor = sanitize_color_hex($branding['maskIconColor'] ?? '');

$html = @file_get_contents(__DIR__ . '/index.html');
if (!is_string($html) || $html === '') {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Missing index.html';
    exit;
}

// Title
$escapedTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
$html = preg_replace('~<title>.*?</title>~i', '<title>' . $escapedTitle . '</title>', $html, 1);

// Meta description
if ($metaDescription !== '') {
    $html = replace_meta_tag($html, 'description', $metaDescription);
}

// Theme color (light) + favicons (only when configured)
if ($themeColorLight !== '') {
    $html = replace_meta_tag($html, 'theme-color', $themeColorLight);
}

if ($faviconSvg !== '') {
    $html = replace_link_href($html, 'icon', $faviconSvg, 'image/svg+xml', false);
}
if ($faviconPng !== '') {
    $html = replace_link_href($html, 'icon', $faviconPng, 'image/png', true);
}
if ($faviconIco !== '') {
    $html = replace_link_href($html, 'shortcut icon', $faviconIco, '', false);
}
if ($appleTouch !== '') {
    $html = replace_link_href($html, 'apple-touch-icon', $appleTouch, '', false);
}
if ($maskIcon !== '') {
    $html = insert_mask_icon($html, $maskIcon, $maskColor);
}

header('Content-Type: text/html; charset=utf-8');
echo $html;
