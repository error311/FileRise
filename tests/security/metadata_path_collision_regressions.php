<?php
declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = $baseDir . '/tests/.tmp_metadata_path_' . bin2hex(random_bytes(4));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metaDir = $tmpBase . '/metadata/';

function metadataPathFailIf(bool $cond, string $message, array &$errors): void
{
    if ($cond) {
        $errors[] = $message;
    }
}

function metadataPathRmTree(string $dir): void
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
        metadataPathRmTree($dir . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($dir);
}

@mkdir($uploadDir . 'team/docs', 0775, true);
@mkdir($uploadDir . 'team-docs', 0775, true);
@mkdir($uploadDir . 'team docs', 0775, true);
@mkdir($usersDir, 0700, true);
@mkdir($metaDir, 0775, true);

putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
putenv('FR_TEST_USERS_DIR=' . $usersDir);
putenv('FR_TEST_META_DIR=' . $metaDir);
putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');

require_once $baseDir . '/config/config.php';

$errors = [];

try {
    $victimPath = \FileRise\Support\MetadataPath::path($metaDir, 'team/docs');
    $attackerPath = \FileRise\Support\MetadataPath::path($metaDir, 'team-docs');
    $spacePath = \FileRise\Support\MetadataPath::path($metaDir, 'team docs');
    $legacyCollisionPath = $metaDir . \FileRise\Support\MetadataPath::legacyFileName('team/docs');

    metadataPathFailIf($victimPath === $attackerPath, 'team/docs and team-docs metadata paths should differ', $errors);
    metadataPathFailIf($victimPath === $spacePath, 'team/docs and team docs metadata paths should differ', $errors);
    metadataPathFailIf($attackerPath === $spacePath, 'team-docs and team docs metadata paths should differ', $errors);
    metadataPathFailIf(
        \FileRise\Support\MetadataPath::legacyFileName('team/docs') !== \FileRise\Support\MetadataPath::legacyFileName('team-docs'),
        'legacy collision fixture should still prove the old names collided',
        $errors
    );

    file_put_contents($legacyCollisionPath, json_encode([
        'invoice.pdf' => ['uploader' => 'legacy-shared'],
    ], JSON_PRETTY_PRINT), LOCK_EX);

    $migratedVictimPath = \FileRise\Support\MetadataPath::path($metaDir, 'team/docs');
    $migratedAttackerPath = \FileRise\Support\MetadataPath::path($metaDir, 'team-docs');
    metadataPathFailIf($migratedVictimPath === $legacyCollisionPath, 'team/docs should not use the colliding legacy metadata filename', $errors);
    metadataPathFailIf($migratedAttackerPath === $legacyCollisionPath, 'team-docs should not use the colliding legacy metadata filename', $errors);
    metadataPathFailIf(!is_file($migratedVictimPath), 'team/docs legacy metadata should copy into isolated metadata file', $errors);
    metadataPathFailIf(!is_file($migratedAttackerPath), 'team-docs legacy metadata should copy into isolated metadata file', $errors);

    file_put_contents($victimPath, json_encode([
        'invoice.pdf' => ['uploader' => 'victim'],
    ], JSON_PRETTY_PRINT), LOCK_EX);
    file_put_contents($attackerPath, json_encode([
        'invoice.pdf' => ['uploader' => 'attacker'],
    ], JSON_PRETTY_PRINT), LOCK_EX);

    $victimMeta = json_decode((string)file_get_contents($victimPath), true);
    $attackerMeta = json_decode((string)file_get_contents($attackerPath), true);
    metadataPathFailIf(($victimMeta['invoice.pdf']['uploader'] ?? '') !== 'victim', 'victim folder metadata should remain isolated', $errors);
    metadataPathFailIf(($attackerMeta['invoice.pdf']['uploader'] ?? '') !== 'attacker', 'attacker folder metadata should remain isolated', $errors);

    $simpleLegacyPath = $metaDir . 'simple_metadata.json';
    file_put_contents($simpleLegacyPath, json_encode([
        'notes.txt' => ['uploader' => 'existing'],
    ], JSON_PRETTY_PRINT), LOCK_EX);
    metadataPathFailIf(
        \FileRise\Support\MetadataPath::path($metaDir, 'simple') !== $simpleLegacyPath,
        'simple legacy metadata should remain readable for compatibility',
        $errors
    );

    $prefixNeighborPath = \FileRise\Support\MetadataPath::path($metaDir, 'team/docs2');
    file_put_contents($prefixNeighborPath, json_encode([
        'neighbor.txt' => ['uploader' => 'neighbor'],
    ], JSON_PRETTY_PRINT), LOCK_EX);
    \FileRise\Support\MetadataPath::renameSubtree($metaDir, 'team/docs', 'team/archive');
    $renamedVictimPath = \FileRise\Support\MetadataPath::path($metaDir, 'team/archive');
    metadataPathFailIf(!is_file($renamedVictimPath), 'exact metadata file should rename to the new encoded folder path', $errors);
    metadataPathFailIf(!is_file($prefixNeighborPath), 'similarly prefixed encoded metadata should not be renamed', $errors);
} finally {
    metadataPathRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Metadata path collision regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "Metadata path collision regressions passed\n";
