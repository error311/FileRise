<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_portal_read_own_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$proDir = $tmpBase . '/pro/';
$portalFolder = 'clientportal';

function portalReadOwnFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function portalReadOwnRmTree(string $dir): void
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
        portalReadOwnRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

function portalReadOwnAclRecord(): array
{
    return [
        'owners' => [],
        'read' => ['full_reader'],
        'write' => [],
        'share' => [],
        'read_own' => ['portal_user'],
        'create' => [],
        'upload' => [],
        'edit' => [],
        'rename' => [],
        'copy' => [],
        'move' => [],
        'delete' => [],
        'extract' => [],
        'share_file' => [],
        'share_folder' => [],
        'inherit' => [],
        'explicit' => [
            'portal_user' => true,
            'full_reader' => true,
        ],
    ];
}

foreach ([$uploadDir . $portalFolder, $usersDir, $metaDir, $sessionDir, $proDir] as $dir) {
    @mkdir($dir, 0775, true);
}
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('FR_PRO_BUNDLE_DIR=' . $proDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

file_put_contents(
    $usersDir . 'users.txt',
    "portal_user:unused:0\nfull_reader:unused:0\nother_user:unused:0\n",
    LOCK_EX
);
file_put_contents($proDir . 'bootstrap_pro.php', "<?php\ndefine('FR_PRO_ACTIVE', true);\n", LOCK_EX);
file_put_contents(
    $proDir . 'ProPortals.php',
    <<<'PHP'
<?php
final class ProPortals
{
    public function __construct(string $baseDir)
    {
    }

    public function listPortals(): array
    {
        return [
            'client-portal' => [
                'label' => 'Client Portal',
                'folder' => 'clientportal',
                'uploadOnly' => false,
                'allowDownload' => true,
                'allowSubfolders' => false,
                'portalUser' => ['username' => 'portal_user'],
            ],
        ];
    }
}
PHP,
    LOCK_EX
);
file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode([
        'folders' => [
            $portalFolder => portalReadOwnAclRecord(),
        ],
        'groups' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

$ownFile = 'portal-user-private.txt';
$otherFile = 'other-user-private.txt';
file_put_contents($uploadDir . $portalFolder . '/' . $ownFile, 'owned', LOCK_EX);
file_put_contents($uploadDir . $portalFolder . '/' . $otherFile, 'other', LOCK_EX);
file_put_contents(
    $metaDir . $portalFolder . '_metadata.json',
    json_encode([
        $ownFile => ['uploader' => 'portal_user'],
        $otherFile => ['uploader' => 'other_user'],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/ProPortalsApiService.php';

$errors = [];

try {
    $_SESSION['authenticated'] = true;
    $_SESSION['username'] = 'portal_user';
    $_SESSION['role'] = '0';
    $_SESSION['isAdmin'] = false;
    $_SESSION['readOnly'] = false;

    $ownOnly = \FileRise\Domain\ProPortalsApiService::listEntries([
        'slug' => 'client-portal',
        'page' => 1,
        'perPage' => 1,
        'all' => 1,
    ]);
    $ownPayload = $ownOnly['payload'] ?? [];
    $ownEntries = $ownPayload['entries'] ?? [];
    $ownNames = array_column(is_array($ownEntries) ? $ownEntries : [], 'name');

    portalReadOwnFailIf(
        ($ownOnly['status'] ?? 0) !== 200 || empty($ownPayload['success']),
        'A read-own portal user should retain listing access',
        $errors
    );
    portalReadOwnFailIf(
        $ownNames !== [$ownFile],
        'A read-own portal listing should contain only files uploaded by the requesting user',
        $errors
    );
    portalReadOwnFailIf(
        ($ownPayload['totalEntries'] ?? null) !== 1
            || ($ownPayload['totalFiles'] ?? null) !== 1
            || ($ownPayload['totalFolders'] ?? null) !== 0
            || ($ownPayload['totalPages'] ?? null) !== 1,
        'Read-own counts and pagination should be computed after ownership filtering',
        $errors
    );
    portalReadOwnFailIf(
        ($ownPayload['files'] ?? null) !== [$ownFile],
        'The optional all-files list should contain only files owned by the requesting user',
        $errors
    );

    $_SESSION['username'] = 'full_reader';
    $fullRead = \FileRise\Domain\ProPortalsApiService::listEntries([
        'slug' => 'client-portal',
        'page' => 1,
        'perPage' => 50,
        'all' => 1,
    ]);
    $fullPayload = $fullRead['payload'] ?? [];
    $fullNames = array_column(
        is_array($fullPayload['entries'] ?? null) ? $fullPayload['entries'] : [],
        'name'
    );
    sort($fullNames);
    $expectedFullNames = [$otherFile, $ownFile];
    sort($expectedFullNames);

    portalReadOwnFailIf(
        ($fullRead['status'] ?? 0) !== 200
            || $fullNames !== $expectedFullNames
            || ($fullPayload['totalFiles'] ?? null) !== 2,
        'A full-read portal user should retain the complete listing',
        $errors
    );
} finally {
    portalReadOwnRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Portal read-own listing regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Portal read-own listing regressions passed\n";
