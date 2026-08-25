<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_portal_submission_auth_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';
$proDir = $tmpBase . '/pro/';
$submissionDir = $proDir . 'portals-submissions/';

function portalSubmissionAuthFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function portalSubmissionAuthRmTree(string $dir): void
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
        portalSubmissionAuthRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

function portalSubmissionAuthAclRecord(array $uploads): array
{
    return [
        'owners' => [],
        'read' => [],
        'write' => [],
        'share' => [],
        'read_own' => [],
        'create' => [],
        'upload' => $uploads,
        'edit' => [],
        'rename' => [],
        'copy' => [],
        'move' => [],
        'delete' => [],
        'extract' => [],
        'share_file' => [],
        'share_folder' => [],
        'inherit' => [],
        'explicit' => array_fill_keys($uploads, true),
    ];
}

foreach ([$uploadDir, $usersDir, $metaDir, $sessionDir, $proDir] as $dir) {
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
    "portal_user:unused:0\nother_owner:unused:0\n",
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
                'folder' => 'client-folder',
                'uploadOnly' => true,
                'allowDownload' => false,
                'requireForm' => true,
                'portalUser' => ['username' => 'portal_user'],
            ],
            'secret-portal' => [
                'label' => 'Secret Portal',
                'folder' => 'secret-folder',
                'uploadOnly' => true,
                'allowDownload' => false,
                'requireForm' => true,
                'portalUser' => ['username' => 'other_owner'],
            ],
        ];
    }
}
PHP,
    LOCK_EX
);
file_put_contents(
    $proDir . 'ProPortalSubmissions.php',
    <<<'PHP'
<?php
final class ProPortalSubmissions
{
    private string $baseDir;

    public function __construct(string $baseDir)
    {
        $this->baseDir = rtrim($baseDir, "/\\") . '/portals-submissions';
    }

    public function store(string $slug, array $payload): bool
    {
        $dir = $this->baseDir . '/' . preg_replace('/[^A-Za-z0-9_-]/', '_', $slug);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            return false;
        }
        return file_put_contents(
            $dir . '/submission-' . bin2hex(random_bytes(4)) . '.json',
            json_encode($payload, JSON_UNESCAPED_SLASHES),
            LOCK_EX
        ) !== false;
    }
}
PHP,
    LOCK_EX
);
file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode([
        'folders' => [
            'client-folder' => portalSubmissionAuthAclRecord(['portal_user']),
            'secret-folder' => portalSubmissionAuthAclRecord(['other_owner']),
        ],
        'groups' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Domain/ProPortalsApiService.php';

$errors = [];
$events = [];
\FileRise\Support\EventBus::register(static function (array $event) use (&$events): void {
    $events[] = $event;
});

try {
    $_SESSION['authenticated'] = true;
    $_SESSION['username'] = 'portal_user';
    $_SESSION['role'] = '0';
    $_SESSION['isAdmin'] = false;
    $_SESSION['readOnly'] = false;

    $unauthorized = \FileRise\Domain\ProPortalsApiService::submitForm(
        [
            'slug' => 'secret-portal',
            'form' => [
                'name' => 'Unauthorized record',
                'email' => 'unauthorized@example.test',
                'reference' => 'CROSS-PORTAL',
                'notes' => 'This record must not be stored.',
            ],
        ],
        'portal_user',
        ['REMOTE_ADDR' => '127.0.0.1']
    );

    portalSubmissionAuthFailIf(
        ($unauthorized['status'] ?? 0) !== 403
            || ($unauthorized['payload']['error'] ?? '') !== 'Forbidden',
        'A user without upload access to the selected portal should receive HTTP 403',
        $errors
    );
    portalSubmissionAuthFailIf(
        glob($submissionDir . 'secret-portal/*.json') !== [],
        'A refused cross-portal submission must not create a stored record',
        $errors
    );
    portalSubmissionAuthFailIf(
        $events !== [],
        'A refused cross-portal submission must not emit an automation event',
        $errors
    );

    $authorized = \FileRise\Domain\ProPortalsApiService::submitForm(
        [
            'slug' => 'client-portal',
            'form' => [
                'name' => 'Authorized client',
                'email' => 'client@example.test',
                'reference' => 'CLIENT-PORTAL',
                'notes' => 'Expected submission.',
            ],
        ],
        'portal_user',
        ['REMOTE_ADDR' => '127.0.0.1']
    );

    $authorizedFiles = glob($submissionDir . 'client-portal/*.json') ?: [];
    portalSubmissionAuthFailIf(
        ($authorized['status'] ?? 0) !== 200 || empty($authorized['payload']['success']),
        'An ACL-authorized portal user should retain form submission access',
        $errors
    );
    portalSubmissionAuthFailIf(
        count($authorizedFiles) !== 1,
        'An authorized portal submission should create exactly one stored record',
        $errors
    );
    portalSubmissionAuthFailIf(
        count($events) !== 1
            || ($events[0]['event'] ?? '') !== 'portal.form.submit'
            || ($events[0]['payload']['slug'] ?? '') !== 'client-portal',
        'An authorized portal submission should emit its existing automation event',
        $errors
    );
} finally {
    portalSubmissionAuthRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Portal submission authorization regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Portal submission authorization regressions passed\n";
