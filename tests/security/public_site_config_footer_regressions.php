<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_public_footer_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function publicFooterFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function publicFooterRmTree(string $dir): void
{
    if (!file_exists($dir) && !is_link($dir)) {
        return;
    }
    if (is_link($dir) || is_file($dir)) {
        @unlink($dir);
        return;
    }
    $items = scandir($dir);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        publicFooterRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir, 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
$_SERVER['HTTP_HOST'] = 'localhost';

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/AdminModel.php';

$errors = [];

try {
    $public = \FileRise\Domain\AdminModel::buildPublicSubset([
        'branding' => [
            'footerHtml' => implode('', [
                '<a href="javascript:alert(1)" onclick="alert(2)" target="_blank">Unsafe link</a>',
                '<img src=x onerror="alert(3)">',
                '<script>alert(4)</script>',
                '<svg onload="alert(5)">SVG text</svg>',
                '<strong data-x="1">Safe text</strong>',
                '<a href="https://example.com" target="_blank">Safe link</a>',
            ]),
        ],
    ]);

    $footer = (string)($public['branding']['footerHtml'] ?? '');

    publicFooterFailIf($footer === '', 'footerHtml should preserve safe text/links', $errors);
    foreach (['javascript:', 'onclick', 'onerror', '<img', '<script', '<svg', 'data-x'] as $blocked) {
        publicFooterFailIf(
            stripos($footer, $blocked) !== false,
            'footerHtml should remove blocked content: ' . $blocked,
            $errors
        );
    }

    publicFooterFailIf(stripos($footer, '<strong>Safe text</strong>') === false, 'footerHtml should preserve strong text', $errors);
    publicFooterFailIf(stripos($footer, 'href="https://example.com"') === false, 'footerHtml should preserve safe https links', $errors);
    publicFooterFailIf(stripos($footer, 'rel="noopener noreferrer"') === false, 'footerHtml should add rel to blank links', $errors);
} finally {
    publicFooterRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Public site config footer regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Public site config footer regressions passed\n";
