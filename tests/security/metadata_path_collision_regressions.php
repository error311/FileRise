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

    // Literal boundaries: protect the root, prefix neighbours, and encoded namespace.
    foreach (['r', 'team', 'folder', '[ab]'] as $folder) {
        $fixtureRoot = $tmpBase . '/boundary-' . rawurlencode($folder) . '/';
        mkdir($fixtureRoot);
        $owned = [
            \FileRise\Support\MetadataPath::legacyFileName($folder),
            \FileRise\Support\MetadataPath::encodedFileName($folder . '/child'),
            \FileRise\Support\MetadataPath::encodedFileName($folder . '/child/grandchild'),
        ];
        $protected = [
            'root_metadata.json',
            $folder . 's_metadata.json',
            $folder . '-ambiguous_metadata.json',
            \FileRise\Support\MetadataPath::encodedFileName('unrelated/item'),
            \FileRise\Support\MetadataPath::encodedFileName($folder . '-sibling'),
            'a_metadata.json',
            'b_metadata.json',
        ];
        foreach (array_merge($owned, $protected) as $name) {
            file_put_contents($fixtureRoot . $name, json_encode(['fixture' => $name]));
        }
        $before = [];
        foreach ($protected as $name) {
            $before[$name] = file_get_contents($fixtureRoot . $name);
        }
        \FileRise\Support\MetadataPath::renameSubtree($fixtureRoot, $folder, 'renamed');
        foreach ($protected as $name) {
            metadataPathFailIf(
                !is_file($fixtureRoot . $name) || file_get_contents($fixtureRoot . $name) !== $before[$name],
                "Rename must preserve unrelated metadata: $folder / $name",
                $errors
            );
        }
        foreach (['renamed', 'renamed/child', 'renamed/child/grandchild'] as $renamed) {
            metadataPathFailIf(
                !is_file(\FileRise\Support\MetadataPath::path($fixtureRoot, $renamed)),
                "Rename must retain exact subtree metadata: $renamed",
                $errors
            );
        }
        \FileRise\Support\MetadataPath::deleteSubtree($fixtureRoot, 'renamed');
        foreach ($owned as $name) {
            file_put_contents($fixtureRoot . $name, '{}');
        }
        \FileRise\Support\MetadataPath::deleteSubtree($fixtureRoot, $folder);
        foreach ($owned as $name) {
            metadataPathFailIf(is_file($fixtureRoot . $name), "Delete must remove owned metadata: $name", $errors);
        }
        foreach ($protected as $name) {
            metadataPathFailIf(
                !is_file($fixtureRoot . $name) || file_get_contents($fixtureRoot . $name) !== $before[$name],
                "Delete must preserve unrelated metadata: $folder / $name",
                $errors
            );
        }
        \FileRise\Support\MetadataPath::deleteSubtree($fixtureRoot, 'root');
        \FileRise\Support\MetadataPath::renameSubtree($fixtureRoot, 'root', 'other');
        metadataPathFailIf(!is_file($fixtureRoot . 'root_metadata.json'), 'Root operations must remain no-ops', $errors);
    }

    // Modern-only trees must not trigger a storage scan.
    $scanCalled = false;
    \FileRise\Support\MetadataPath::prepareSubtreeRename(
        $metaDir,
        'modern',
        static function () use (&$scanCalled): array {
            $scanCalled = true;
            return [];
        }
    );
    metadataPathFailIf($scanCalled, 'Modern rename must avoid legacy descendant traversal', $errors);

    // Normal model operations must preserve old, never-visited descendant metadata.
    // Real folder paths disambiguate the legacy name; the legacy file itself stays intact.
    mkdir($uploadDir . 'legacy/child/grandchild', 0775, true);
    mkdir($uploadDir . 'legacy-child', 0775, true);
    $legacyPayload = json_encode(['note.txt' => ['uploader' => 'alice', 'tags' => ['keep']]]);
    $grandchildPayload = json_encode(['deep.txt' => ['uploader' => 'bob']]);
    file_put_contents($uploadDir . 'legacy/child/note.txt', 'unchanged content');
    file_put_contents($metaDir . 'legacy_metadata.json', $legacyPayload);
    file_put_contents($metaDir . 'legacy-child_metadata.json', $legacyPayload);
    file_put_contents($metaDir . 'legacy-child-grandchild_metadata.json', $grandchildPayload);
    $siblingPath = \FileRise\Support\MetadataPath::path($metaDir, 'legacy-child');
    $siblingPayload = file_get_contents($siblingPath);
    $result = \FileRise\Domain\FolderModel::renameFolder('legacy', 'new name');
    metadataPathFailIf(empty($result['success']), 'Normal folder rename should succeed with legacy metadata', $errors);
    foreach (['new name' => $legacyPayload, 'new name/child' => $legacyPayload, 'new name/child/grandchild' => $grandchildPayload] as $folder => $payload) {
        $path = \FileRise\Support\MetadataPath::path($metaDir, $folder);
        metadataPathFailIf(
            !is_file($path) || json_decode((string)file_get_contents($path), true) !== json_decode($payload, true),
            "Legacy metadata must follow the actual folder: $folder",
            $errors
        );
    }
    metadataPathFailIf(file_get_contents($siblingPath) !== $siblingPayload, 'Dashed sibling must retain its metadata', $errors);
    metadataPathFailIf(file_get_contents($metaDir . 'legacy-child_metadata.json') !== $legacyPayload, 'Ambiguous legacy source must be retained', $errors);
    metadataPathFailIf(file_get_contents($uploadDir . 'new name/child/note.txt') !== 'unchanged content', 'Renamed content must remain intact', $errors);
    $result = \FileRise\Domain\FolderModel::renameFolder('new name', 'plain');
    metadataPathFailIf(empty($result['success']), 'Encoded-to-simple rename should succeed', $errors);
    metadataPathFailIf(
        json_decode((string)file_get_contents(\FileRise\Support\MetadataPath::path($metaDir, 'plain')), true) !== json_decode($legacyPayload, true),
        'Readers must find metadata after encoded-to-simple rename',
        $errors
    );

    // Root-like folder names must never import the root's ownership records.
    $rootPath = $metaDir . 'root_metadata.json';
    $rootPayload = json_encode(['sample.txt' => ['uploader' => 'root-owner', 'tags' => ['root']]]);
    file_put_contents($rootPath, $rootPayload);
    file_put_contents($uploadDir . 'sample.txt', 'unchanged root content');
    $caseInsensitiveMetadata = is_file($metaDir . 'ROOT_metadata.json');
    foreach (['', '/', 'root'] as $rootAlias) {
        metadataPathFailIf(\FileRise\Support\MetadataPath::path($metaDir, $rootAlias) !== $rootPath, 'Existing root paths must remain stable', $errors);
    }
    $variantPaths = [];
    foreach (['ROOT', 'Root', 'rOOT'] as $index => $variant) {
        // On case-insensitive storage this legacy name aliases root_metadata.json.
        file_put_contents($metaDir . $variant . '_metadata.json', $rootPayload);
        $variantPath = \FileRise\Support\MetadataPath::path($metaDir, $variant);
        $variantPaths[] = strtolower($variantPath);
        metadataPathFailIf(strcasecmp($variantPath, $rootPath) === 0, 'Variant must not alias root metadata', $errors);
        metadataPathFailIf(is_file($variantPath), 'Ambiguous root-like legacy metadata must not be imported', $errors);

        $beforeName = 'variant-test-' . $index;
        $afterName = 'variant-done-' . $index;
        mkdir($uploadDir . $beforeName . '/child', 0775, true);
        file_put_contents($uploadDir . $beforeName . '/sample.txt', 'unchanged variant content');
        file_put_contents(\FileRise\Support\MetadataPath::path($metaDir, $beforeName), $legacyPayload);
        file_put_contents(\FileRise\Support\MetadataPath::path($metaDir, $beforeName . '/child'), $grandchildPayload);
        $result = \FileRise\Domain\FolderModel::renameFolder($beforeName, $variant);
        metadataPathFailIf(empty($result['success']), 'Ordinary rename to a root-like folder must succeed', $errors);
        metadataPathFailIf(!is_file($variantPath) || file_get_contents($variantPath) !== $legacyPayload, 'Existing uploader and tags must follow renamed folder', $errors);
        metadataPathFailIf(file_get_contents($rootPath) !== $rootPayload, 'Rename must preserve root attribution', $errors);
        $download = \FileRise\Domain\FileModel::getDownloadInfo($variant, 'sample.txt');
        metadataPathFailIf(isset($download['error']) || file_get_contents($download['filePath']) !== 'unchanged variant content', 'Variant download must resolve its own file', $errors);
        $download = \FileRise\Domain\FileModel::getDownloadInfo('root', 'sample.txt');
        metadataPathFailIf(isset($download['error']) || file_get_contents($download['filePath']) !== 'unchanged root content', 'Root download must retain its existing file', $errors);
        $result = \FileRise\Domain\FolderModel::renameFolder($variant, $afterName);
        metadataPathFailIf(empty($result['success']), 'Rename away from a root-like folder must succeed', $errors);
        metadataPathFailIf(file_get_contents(\FileRise\Support\MetadataPath::path($metaDir, $afterName)) !== $legacyPayload, 'Round-trip must retain folder metadata', $errors);
        metadataPathFailIf(file_get_contents(\FileRise\Support\MetadataPath::path($metaDir, $afterName . '/child')) !== $grandchildPayload, 'Round-trip must retain child metadata', $errors);
        metadataPathFailIf(file_get_contents($uploadDir . $afterName . '/sample.txt') !== 'unchanged variant content', 'Round-trip must preserve uploaded bytes', $errors);

        file_put_contents($variantPath, $legacyPayload);
        $childPath = \FileRise\Support\MetadataPath::path($metaDir, $variant . '/child');
        file_put_contents($childPath, $grandchildPayload);
        \FileRise\Support\MetadataPath::deleteSubtree($metaDir, $variant);
        metadataPathFailIf(is_file($variantPath) || is_file($childPath), 'Variant cleanup must remove its own metadata', $errors);
        metadataPathFailIf(file_get_contents($rootPath) !== $rootPayload, 'Variant writes and cleanup must preserve root metadata', $errors);
        metadataPathFailIf(is_file(\FileRise\Support\MetadataPath::path($metaDir, $variant)), 'Later reads must not reimport ambiguous legacy records', $errors);
    }
    metadataPathFailIf(count(array_unique($variantPaths)) !== count($variantPaths), 'Variant metadata names must differ even without filesystem case sensitivity', $errors);

    mkdir($uploadDir . 'r');
    file_put_contents($metaDir . 'root_metadata.json', $legacyPayload);
    $result = \FileRise\Domain\FolderModel::deleteFolder('r');
    metadataPathFailIf(empty($result['success']), 'Normal empty-folder deletion should succeed', $errors);
    metadataPathFailIf(file_get_contents($metaDir . 'root_metadata.json') !== $legacyPayload, 'Normal deletion must preserve root metadata', $errors);
} finally {
    metadataPathRmTree($tmpBase);
}

if ($errors) {
    fwrite(STDERR, "Metadata path collision regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo 'Metadata path collision regressions passed (',
    $caseInsensitiveMetadata ? 'case-insensitive' : 'case-sensitive', " metadata filesystem)\n";
