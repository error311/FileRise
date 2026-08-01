<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_upload_path_auth_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function uploadPathAuthFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function uploadPathAuthRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_link($path) || is_file($path)) {
        @unlink($path);
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        uploadPathAuthRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

function uploadPathAuthAclRecord(string $owner, array $explicit, array $inherit = []): array
{
    return [
        'owners' => [$owner],
        'read' => [],
        'write' => [],
        'share' => [],
        'read_own' => [],
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
        'inherit' => $inherit,
        'explicit' => $explicit,
    ];
}

@mkdir($uploadDir . 'mine/%3C', 0775, true);
@mkdir($uploadDir . 'mine/allowed', 0775, true);
@mkdir($uploadDir . 'mine/denied', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);
@mkdir($sessionDir, 0700, true);
session_save_path($sessionDir);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

$acl = [
    'folders' => [
        'root' => uploadPathAuthAclRecord('admin', ['admin' => true]),
        'mine' => uploadPathAuthAclRecord('low', ['low' => true], ['low' => true]),
        'mine/denied' => uploadPathAuthAclRecord('admin', ['low' => true, 'admin' => true]),
    ],
    'groups' => [],
];
file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

$rootSentinel = 'ROOT-SENTINEL';
$allowedSentinel = 'ALLOWED';
$deniedSentinel = 'DENIED-SENTINEL';
file_put_contents($uploadDir . 'secret.txt', $rootSentinel, LOCK_EX);
file_put_contents($uploadDir . 'mine/allowed/existing.txt', $allowedSentinel, LOCK_EX);
file_put_contents($uploadDir . 'mine/denied/secret.txt', $deniedSentinel, LOCK_EX);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/UploadModel.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/UploadController.php';

$_SERVER['REQUEST_METHOD'] = 'POST';
$_SESSION['username'] = 'low';
$_SESSION['authenticated'] = true;
$_SESSION['isAdmin'] = false;

$errors = [];

try {
    $model = new ReflectionClass(\FileRise\Domain\UploadModel::class);
    $sanitizeFolder = $model->getMethod('sanitizeFolder');
    $parseRelativePath = $model->getMethod('parseRelativePath');

    uploadPathAuthFailIf(
        $sanitizeFolder->invoke(null, 'mine/%253C') !== 'mine/%253C',
        'Folder sanitization must preserve a literal double-encoded segment.',
        $errors
    );
    uploadPathAuthFailIf(
        $sanitizeFolder->invoke(null, 'mine/pwn%252e') !== 'mine/pwn%252e',
        'Folder sanitization must preserve a literal double-encoded trailing-dot segment.',
        $errors
    );
    uploadPathAuthFailIf(
        $sanitizeFolder->invoke(null, 'mine/%3C') !== 'mine/%3C',
        'Folder sanitization must preserve a literal percent-escape-shaped segment.',
        $errors
    );
    uploadPathAuthFailIf(
        $sanitizeFolder->invoke(null, 'mine/<') !== null,
        'An invalid folder must fail closed instead of becoming storage root.',
        $errors
    );
    uploadPathAuthFailIf(
        $sanitizeFolder->invoke(null, 'root') !== '',
        'The explicit root folder must retain its internal empty-string representation.',
        $errors
    );

    [$percentDir, $percentFile] = $parseRelativePath->invoke(null, 'literal%3C/file.txt');
    uploadPathAuthFailIf(
        $percentDir !== 'literal%3C' || $percentFile !== 'file.txt',
        'Relative paths must preserve literal percent characters.',
        $errors
    );

    $controller = new ReflectionClass(\FileRise\Http\Controllers\UploadController::class);
    $normalizeRequestedFolder = $controller->getMethod('normalizeRequestedFolder');
    uploadPathAuthFailIf(
        $normalizeRequestedFolder->invoke(null, 'mine/%253C') !== 'mine/%253C',
        'The controller must authorize the same canonical folder passed to the model.',
        $errors
    );
    uploadPathAuthFailIf(
        $normalizeRequestedFolder->invoke(null, 'mine/<') !== null,
        'The controller must reject an invalid folder before authorization.',
        $errors
    );

    $allowed = \FileRise\Domain\UploadModel::checkExisting(
        'mine',
        [['path' => 'allowed/existing.txt', 'size' => strlen($allowedSentinel)]]
    );
    uploadPathAuthFailIf(
        count($allowed['existing'] ?? []) !== 1
            || ($allowed['existing'][0]['sameSize'] ?? null) !== true,
        'An inherited, authorized descendant must retain ordinary existence checks.',
        $errors
    );

    $denied = \FileRise\Domain\UploadModel::checkExisting(
        'mine',
        [['path' => 'denied/secret.txt', 'size' => strlen($deniedSentinel)]]
    );
    uploadPathAuthFailIf(
        ($denied['code'] ?? null) !== 403 || isset($denied['existing']),
        'An explicitly denied relative destination must not disclose file existence or size.',
        $errors
    );

    $encoded = \FileRise\Domain\UploadModel::checkExisting(
        'mine/%253C',
        [['path' => 'secret.txt', 'size' => strlen($rootSentinel)]]
    );
    uploadPathAuthFailIf(
        ($encoded['existing'] ?? null) !== [],
        'A literal encoded folder must not fall back to storage root.',
        $errors
    );

    $encodedTrailingDot = \FileRise\Domain\UploadModel::checkExisting(
        'mine/pwn%252e',
        [['path' => 'secret.txt', 'size' => strlen($rootSentinel)]]
    );
    uploadPathAuthFailIf(
        ($encodedTrailingDot['existing'] ?? null) !== [],
        'A double-encoded trailing-dot folder must remain literal and not fall back to storage root.',
        $errors
    );

    $invalid = \FileRise\Domain\UploadModel::checkExisting(
        'mine/<',
        [['path' => 'secret.txt', 'size' => strlen($rootSentinel)]]
    );
    uploadPathAuthFailIf(
        ($invalid['code'] ?? null) !== 400 || isset($invalid['existing']),
        'An invalid folder must return an error without consulting storage root.',
        $errors
    );

    $deniedUpload = \FileRise\Domain\UploadModel::handleUpload(
        [
            'folder' => 'mine',
            'relativePath' => 'denied/new-tree/file.txt',
        ],
        [
            'file' => [
                'name' => 'file.txt',
                'tmp_name' => $tmpBase . '/not-an-http-upload.tmp',
                'error' => UPLOAD_ERR_OK,
            ],
        ]
    );
    uploadPathAuthFailIf(
        ($deniedUpload['code'] ?? null) !== 403,
        'Upload authorization must be evaluated on the effective relative destination.',
        $errors
    );
    uploadPathAuthFailIf(
        is_dir($uploadDir . 'mine/denied/new-tree'),
        'A denied relative destination must be rejected before creating directories.',
        $errors
    );

    $spoofedSharedUpload = \FileRise\Domain\UploadModel::handleUpload(
        [
            'folder' => 'mine',
            'relativePath' => 'denied/spoofed/file.txt',
            'source' => 'shared',
        ],
        [
            'file' => [
                'name' => 'file.txt',
                'tmp_name' => $tmpBase . '/not-an-http-upload.tmp',
                'error' => UPLOAD_ERR_OK,
            ],
        ]
    );
    uploadPathAuthFailIf(
        ($spoofedSharedUpload['code'] ?? null) !== 403,
        'A client-provided shared source label must not bypass effective-destination authorization.',
        $errors
    );
    uploadPathAuthFailIf(
        is_dir($uploadDir . 'mine/denied/spoofed'),
        'A spoofed public-upload label must be rejected before creating directories.',
        $errors
    );

    uploadPathAuthFailIf(
        (string)file_get_contents($uploadDir . 'secret.txt') !== $rootSentinel
            || (string)file_get_contents($uploadDir . 'mine/denied/secret.txt') !== $deniedSentinel,
        'Rejected requests must not modify root or denied-folder files.',
        $errors
    );
} finally {
    uploadPathAuthRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Upload path authorization regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Upload path authorization regressions passed\n";
