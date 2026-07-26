<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_folder_rename_acl_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function folderRenameAclFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function folderRenameAclRmTree(string $dir): void
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
        folderRenameAclRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

function folderRenameAclRecord(string $owner): array
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
        'inherit' => [],
        'explicit' => [$owner => true],
    ];
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

$acl = [
    'folders' => [
        'root' => folderRenameAclRecord('admin'),
        'attacker_space' => folderRenameAclRecord('attacker'),
        'attacker_space/loot' => folderRenameAclRecord('attacker'),
        'attacker_other' => folderRenameAclRecord('attacker'),
        'victim_space' => folderRenameAclRecord('victim'),
        'shared' => folderRenameAclRecord('victim'),
        'shared/attacker_child' => folderRenameAclRecord('attacker'),
        'claimed_destination' => folderRenameAclRecord('attacker'),
    ],
    'groups' => [],
];
$owners = [
    'attacker_space' => 'attacker',
    'attacker_space/loot' => 'attacker',
    'attacker_other' => 'attacker',
    'victim_space' => 'victim',
    'shared' => 'victim',
    'shared/attacker_child' => 'attacker',
    'claimed_destination' => 'victim',
];

file_put_contents(
    $metaDir . 'folder_acl.json',
    json_encode($acl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);
file_put_contents(
    $metaDir . 'folder_owners.json',
    json_encode($owners, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
    LOCK_EX
);

require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/FolderController.php';

$errors = [];
$controller = new ReflectionClass(\FileRise\Http\Controllers\FolderController::class);
$destinationError = $controller->getMethod('renameDestinationError');
$attackerPerms = [];
$adminPerms = ['admin' => true];

try {
    folderRenameAclFailIf(
        $destinationError->invoke(
            null,
            'shared/attacker_child',
            'shared/renamed_child',
            'attacker',
            $attackerPerms
        ) !== null,
        'Same-parent rename should preserve existing source-owner behavior',
        $errors
    );

    folderRenameAclFailIf(
        $destinationError->invoke(
            null,
            'attacker_space/loot',
            'attacker_other/loot',
            'attacker',
            $attackerPerms
        ) !== null,
        'Cross-parent move between folders owned by the same user should remain allowed',
        $errors
    );

    $victimError = $destinationError->invoke(
        null,
        'attacker_space/loot',
        'victim_space/loot',
        'attacker',
        $attackerPerms
    );
    folderRenameAclFailIf(
        $victimError !== 'Forbidden: move rights required on destination',
        'Cross-owner destination without move rights should be rejected',
        $errors
    );

    $rootError = $destinationError->invoke(
        null,
        'attacker_space/loot',
        'escaped_root',
        'attacker',
        $attackerPerms
    );
    folderRenameAclFailIf(
        $rootError !== 'Forbidden: move rights required on destination',
        'Non-admin cross-parent move to root should be rejected',
        $errors
    );

    $ownerMismatchError = $destinationError->invoke(
        null,
        'attacker_space/loot',
        'claimed_destination/loot',
        'attacker',
        $attackerPerms
    );
    folderRenameAclFailIf(
        $ownerMismatchError !== 'Source and destination must have the same owner',
        'Destination ACL rights must not bypass the cross-owner boundary',
        $errors
    );

    \FileRise\Domain\FolderModel::saveFolderOwners([]);
    folderRenameAclFailIf(
        $destinationError->invoke(
            null,
            'attacker_space/loot',
            'attacker_other/loot',
            'attacker',
            $attackerPerms
        ) !== null,
        'Authorized moves should remain compatible when the legacy owner map is empty',
        $errors
    );

    folderRenameAclFailIf(
        $destinationError->invoke(
            null,
            'attacker_space/loot',
            'victim_space/loot',
            'admin',
            $adminPerms
        ) !== null,
        'Administrator cross-parent moves should remain allowed',
        $errors
    );
    folderRenameAclFailIf(
        $destinationError->invoke(
            null,
            'attacker_space/loot',
            'admin_root_move',
            'admin',
            $adminPerms
        ) !== null,
        'Administrator moves to root should remain allowed',
        $errors
    );
} finally {
    folderRenameAclRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Folder rename destination ACL regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Folder rename destination ACL regressions passed\n";
