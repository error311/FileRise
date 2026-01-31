<?php
// src/models/FileModel.php

require_once PROJECT_ROOT . '/config/config.php';
require_once __DIR__ . '/../../src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/FolderCrypto.php';
require_once PROJECT_ROOT . '/src/lib/CryptoAtRest.php';
require_once PROJECT_ROOT . '/src/lib/StorageRegistry.php';
require_once PROJECT_ROOT . '/src/lib/SourceContext.php';

class FileModel
{
    private const EMPTY_DOCX_BASE64 = 'UEsDBBQAAAAIAFu7KlycQJLKFQEAAK0CAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbKVSu07DMBTd8xWW1ypxYEAIJenAY4QO5QMs+6ax8Eu+bmn/nusWioTaCsRonaeP3c23zrINJDTB9/yqaTkDr4I2ftXz1+VTfcsZZum1tMFDz3eAfD5U3XIXARmJPfZ8yjneCYFqAiexCRE8IWNITmY6ppWIUr3JFYjrtr0RKvgMPte5ePChYqx7gFGubWaPW0IOXRJY5Oz+wC1xPZcxWqNkJlxsvP4RVH+GNKTcc3AyEWdE4OJcSAHPZ3xLX2iiZDSwhUz5WToiiveQtNBBrR2Jm8tOJ9qGcTQKjvriFlNQgEjbO9scESeNn12uQtxFChFp2gR/r/I1XFHXVCJCygbwt6Hk/u/rQ3kTDfpEfCf2n22oPgBQSwMEFAAAAAgAW7sqXAI9xbHqAAAAWAIAAAsAAABfcmVscy8ucmVsc62SwU7DMAxA7/2KyPc13ZAQQk13QZN2Q2h8gJW4bUSbRI4H298TIUAMMdiBYxz7+dlyuz7Mk3omzj4GA8u6AUXBRufDYOBxt1ncgMqCweEUAxk4UoZ1V7UPNKGUmjz6lFWBhGxgFEm3Wmc70oy5jolC+ekjzyjlyYNOaJ9wIL1qmmvNXxnQVUqdYNXWGeCtW4LaHRNdgo997y3dRbufKcgPXb5lFDLyQGLgJbLT7j1cFyzos0Kry4XOz6tnEnQoqG1kWiQu1Sy+rPfTqejcl3B+y/jD6eo/l0QHoeDI/W6FKX1ItfrkHrrqFVBLAwQUAAAACABbuypc+Q9JDpMAAAC8AAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sNY1NDoIwEIX3nKKZvRRdGEP42XkCPUBtRyChM02nitzeQsLuve8l32v6n5/VF6NMTC2cywoUkmU30dDC83E/3UBJMuTMzIQtrCjQd0Wz1I7txyMllQ0k9dLCmFKotRY7ojdSckDK25ujNynXOOiFowuRLYrkAz/rS1VdtTcTQVcola0vdusW9xL0TvWBt3TcdsUfUEsDBBQAAAAIAFu7KlzV6iDXeQAAAI4AAAAcAAAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc02MQQ7CIBAA730F2bsFPRhjSnvrA4w+YENXaISFsMTo7+XocTKZmZZPiupNVfbMFo6jAUXs8razt/C4r4cLKGnIG8bMZOFLAss8TDeK2HojYS+i+oTFQmitXLUWFyihjLkQd/PMNWHrWL0u6F7oSZ+MOev6/wA9Dz9QSwMEFAAAAAgAW7sqXGdYvJNaAQAA5AIAABEAAABkb2NQcm9wcy9jb3JlLnhtbJ2Sy07DMBBF9/2KyPvESSsQipJUAtQVlRAUgdgZe9qaxg/ZLmn+HudJqnaF5IVn7vWZ8djZ8iTK4AeM5UrmKIliFICkinG5y9HbZhXeocA6IhkplYQc1WDRsphlVKdUGXg2SoNxHGzgQdKmVOdo75xOMbZ0D4LYyDukF7fKCOJ8aHZYE3ogO8DzOL7FAhxhxBHcAEM9ElGPZHRE6qMpWwCjGEoQIJ3FSZTgP68DI+zVA60ycQruag1XrYM4uk+Wj8aqqqJq0Vp9/wn+WD+9tlcNuWxGRQEVsyDIGE0ddyUUGR63fd4ev76Buk4Zgl6jBohTpljxEl64hdYzJBuPH/0B6koZZj1gGvUEBpYarp1/0q7CNNETSmLd2j/zlgO7ryfFLrWO2k6v6wNY4OeRdtMblPfFw+NmhYp5PL8J48SvTRyn7fpsmjg7f8YUfal/QweA/5b44l8Ws19QSwMEFAAAAAgAW7sqXBHFSDCuAAAAGwEAABAAAABkb2NQcm9wcy9hcHAueG1snc8xC8IwEAXgvb8iZK+pDiKStgjSWaS6h+SqgfYScqfYf29EUGfHuwcf7+n2MY3iDol8wFouF5UUgDY4j5danvqu3EhBbNCZMSDUcgaSbVPoQwoREnsgkQWkWl6Z41YpsleYDC1yjDkZQpoM5zNdVBgGb2Ef7G0CZLWqqrWCBwM6cGX8gPItbu/8L+qCffWjcz/H7DWFEHoX4+it4byz6fwIR0+g1e+30Oq7qimeUEsBAhQDFAAAAAgAW7sqXJxAksoVAQAArQIAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACABbuypcAj3FseoAAABYAgAACwAAAAAAAAAAAAAAgAFGAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACABbuypc+Q9JDpMAAAC8AAAAEQAAAAAAAAAAAAAAgAFZAgAAd29yZC9kb2N1bWVudC54bWxQSwECFAMUAAAACABbuypc1eog13kAAACOAAAAHAAAAAAAAAAAAAAAgAEbAwAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1BLAQIUAxQAAAAIAFu7KlxnWLyTWgEAAOQCAAARAAAAAAAAAAAAAACAAc4DAABkb2NQcm9wcy9jb3JlLnhtbFBLAQIUAxQAAAAIAFu7KlwRxUgwrgAAABsBAAAQAAAAAAAAAAAAAACAAVcFAABkb2NQcm9wcy9hcHAueG1sUEsFBgAAAAAGAAYAgAEAADMGAAAAAA==';
    private const EMPTY_XLSX_BASE64 = 'UEsDBBQAAAAIAIW8KlxsKH4wJgEAADADAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK1SS08CMRC+8yuaXsm24MEYswsHH0flgD+gtrNsQ1/pFIR/7+ziIzGgGD1Nmu/ZTuv5zju2hYw2hoZPxYQzCDoaG1YNf1reV1ecYVHBKBcDNHwPyOezUb3cJ0BG4oAN70pJ11Ki7sArFDFBIKSN2atCx7ySSem1WoG8mEwupY6hQChV6T34bMRYfQut2rjC7naEHLpkcMjZzYHbxzVcpeSsVoVwuQ3mS1D1FiJIOXCwswnHRODyVEgPns74lD7SE2VrgC1ULg/KE1HunHyJef0c41p873Oka2xbq8FEvfEkEZgyKIMdQPFODFN4ZcP4rAoDH+Uwpv/c5cP/hyokX+SYkLab4fcd3nfXq6tERpCLBTw3lNz/fG/ov4UBcyS+lsN/n41eAVBLAwQUAAAACACFvCpc8ZgF1O0AAABWAgAACwAAAF9yZWxzLy5yZWxzrZLNTsMwDIDvfYrI9zXdkBBCTXeZkHZDaDyASdwftY2jxED39kRIIIYY7MAxjv35s+V6u8yTeqGYBvYG1mUFirxlN/jOwOPhbnUDKgl6hxN7MnCkBNumqB9oQsk1qR9CUhnik4FeJNxqnWxPM6aSA/n803KcUfIzdjqgHbEjvamqax2/MqAplDrBqr0zEPduDepwDHQJntt2sLRj+zyTlx+6fMvIZIwdiYFl0q8cxyfmscxQ0Gd1NpfrnJ9WzyToUFBbjrQKMVdHGfJyP40c2/scTu8Zfzhd/eeKaBHyjtzvVhjCh1StT66hKd4AUEsDBBQAAAAIAIW8KlwLJiPEwgAAACkBAAAPAAAAeGwvd29ya2Jvb2sueG1sjU9BbsIwELznFdbewUkPVRUl4YIqcYY+wMQbYhHvRrsG2t/XAeXOaWc0mtmZZvcbJ3NH0cDUQrUtwSD17ANdWvg5fW++wGhy5N3EhC38ocKuK5oHy/XMfDXZT9rCmNJcW6v9iNHplmekrAws0aVM5WJ1FnReR8QUJ/tRlp82ukDwSqjlnQwehtDjnvtbREqvEMHJpdxexzArdIUxzfOJLnAlhlzM7Y8LrvKi5R58HgxG6pCBHHwF9um2q72x68qu+AdQSwMEFAAAAAgAhbwqXGADgv+4AAAALgEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc43PzQrCMAwH8PueouTusnkQkXW7iLCrzAcoXfaBW1ua+rG3t3gQBx48hSTkF/5F9ZwncSfPozUS8jQDQUbbdjS9hEtz2uxBcFCmVZM1JGEhhqpMijNNKsQbHkbHIiKGJQwhuAMi64Fmxal1ZOKms35WIba+R6f0VfWE2yzbof82oEyEWLGibiX4us1BNIujf3jbdaOmo9W3mUz48QUf1l95IAoRVb6nIOEzYnyXPI0qYAyJq5Rl8gJQSwMEFAAAAAgAhbwqXIPNSUGIAAAAogAAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWw9zEsOwjAMBNB9ThF5T11YIISSdoM4ARzAakxb0ThVHPG5PVEXLGdG81z/iYt9cdY5iYd904JlGVKYZfRwv113J7BaSAItSdjDlxX6zrh3yk+dmIutgKiHqZT1jKjDxJG0SStLXR4pRyo15hF1zUxhO8UFD217xEizQGesdVt9oUJYcfzrnfkBUEsDBBQAAAAIAIW8KlxnWLyTWgEAAOQCAAARAAAAZG9jUHJvcHMvY29yZS54bWydkstOwzAQRff9isj7xEkrEIqSVALUFZUQFIHYGXvamsYP2S5p/h7nSap2heSFZ+71mfHY2fIkyuAHjOVK5iiJYhSApIpxucvR22YV3qHAOiIZKZWEHNVg0bKYZVSnVBl4NkqDcRxs4EHSplTnaO+cTjG2dA+C2Mg7pBe3ygjifGh2WBN6IDvA8zi+xQIcYcQR3ABDPRJRj2R0ROqjKVsAoxhKECCdxUmU4D+vAyPs1QOtMnEK7moNV62DOLpPlo/GqqqiatFaff8J/lg/vbZXDblsRkUBFbMgyBhNHXclFBket33eHr++gbpOGYJeowaIU6ZY8RJeuIXWMyQbjx/9AepKGWY9YBr1BAaWGq6df9KuwjTRE0pi3do/85YDu68nxS61jtpOr+sDWODnkXbTG5T3xcPjZoWKeTy/CePEr00cp+36bJo4O3/GFH2pf0MHgP+W+OJfFrNfUEsDBBQAAAAIAIW8KlwRxUgwrgAAABsBAAAQAAAAZG9jUHJvcHMvYXBwLnhtbJ3PMQvCMBAF4L2/ImSvqQ4ikrYI0lmkuofkqoH2EnKn2H9vRFBnx7sHH+/p9jGN4g6JfMBaLheVFIA2OI+XWp76rtxIQWzQmTEg1HIGkm1T6EMKERJ7IJEFpFpemeNWKbJXmAwtcow5GUKaDOczXVQYBm9hH+xtAmS1qqq1ggcDOnBl/IDyLW7v/C/qgn31o3M/x+w1hRB6F+PoreG8s+n8CEdPoNXvt9Dqu6opnlBLAQIUAxQAAAAIAIW8KlxsKH4wJgEAADADAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAhbwqXPGYBdTtAAAAVgIAAAsAAAAAAAAAAAAAAIABVwEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAhbwqXAsmI8TCAAAAKQEAAA8AAAAAAAAAAAAAAIABbQIAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIAIW8KlxgA4L/uAAAAC4BAAAaAAAAAAAAAAAAAACAAVwDAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1BLAQIUAxQAAAAIAIW8KlyDzUlBiAAAAKIAAAAYAAAAAAAAAAAAAACAAUwEAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwECFAMUAAAACACFvCpcZ1i8k1oBAADkAgAAEQAAAAAAAAAAAAAAgAEKBQAAZG9jUHJvcHMvY29yZS54bWxQSwECFAMUAAAACACFvCpcEcVIMK4AAAAbAQAAEAAAAAAAAAAAAAAAgAGTBgAAZG9jUHJvcHMvYXBwLnhtbFBLBQYAAAAABwAHAMIBAABvBwAAAAA=';

    private static function storage(): StorageAdapterInterface
    {
        return StorageRegistry::getAdapter();
    }

    private static function uploadRoot(): string
    {
        if (class_exists('SourceContext')) {
            return SourceContext::uploadRoot();
        }
        return rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function metaRoot(): string
    {
        if (class_exists('SourceContext')) {
            SourceContext::ensureMetaDir();
            return SourceContext::metaRoot();
        }
        return rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function metaRootForId(string $sourceId): string
    {
        if (class_exists('SourceContext')) {
            $root = SourceContext::metaRootForId($sourceId);
            if (!is_dir($root)) {
                @mkdir($root, 0775, true);
            }
            return $root;
        }
        $root = rtrim((string)META_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!is_dir($root)) {
            @mkdir($root, 0775, true);
        }
        return $root;
    }

    private static function getMetadataFilePathForRoot(string $metaRoot, string $folder): string
    {
        $metaRoot = rtrim($metaRoot, "/\\") . DIRECTORY_SEPARATOR;
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            return $metaRoot . "root_metadata.json";
        }
        return $metaRoot . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
    }

    private static function trashRoot(): string
    {
        if (class_exists('SourceContext')) {
            return SourceContext::trashRoot();
        }
        return rtrim((string)TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
    }

    private static function shouldUseRemoteMarker(StorageAdapterInterface $storage): bool
    {
        if ($storage->isLocal()) {
            return false;
        }
        if (class_exists('SourceContext')) {
            $src = SourceContext::getActiveSource();
            $type = strtolower((string)($src['type'] ?? ''));
            return $type === 's3';
        }
        return true;
    }

    private static function remoteDirMarker(): string
    {
        return defined('FR_REMOTE_DIR_MARKER') ? (string)FR_REMOTE_DIR_MARKER : '.filerise_keep';
    }

    private static function ensureRemoteFolderMarker(StorageAdapterInterface $storage, string $dir): void
    {
        if (!self::shouldUseRemoteMarker($storage)) {
            return;
        }
        $markerName = self::remoteDirMarker();
        if ($markerName === '') {
            return;
        }
        $dir = rtrim($dir, "/\\");
        if ($dir === '' || $dir === '.') {
            return;
        }
        $markerPath = $dir . DIRECTORY_SEPARATOR . $markerName;
        try {
            if ($storage->stat($markerPath) !== null) {
                return;
            }
            $storage->mkdir($dir, 0775, true);
            $storage->write($markerPath, '');
        } catch (\Throwable $e) {
            // Best-effort only; remote backends may not support markers.
        }
    }

    /**
     * Resolve a logical folder key (e.g. "root", "invoices/2025") to a
     * real path under UPLOAD_DIR, enforce REGEX_FOLDER_NAME, and ensure
     * optional creation.
     *
     * @param string $folder
     * @param bool   $create
     * @return array [string|null $realPath, string|null $error]
     */
    private static function resolveFolderPath(string $folder, bool $create = true): array
    {
        $folder = trim($folder) ?: 'root';

        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return [null, "Invalid folder name."];
        }

        $storage = self::storage();
        $activeSourceId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';
        if (!$storage->isLocal()) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                    return ['success' => false, 'error' => 'Encrypted folders are not supported for remote storage.', 'code' => 400];
                }
            } catch (\Throwable $e) { /* ignore */ }
        }
        $isLocal = $storage->isLocal();

        $root = self::uploadRoot();
        $base = $isLocal ? realpath($root) : rtrim($root, '/\\');
        if ($base === false || $base === '') {
            return [null, "Server misconfiguration."];
        }

        if (!$isLocal && strpos($folder, '..') !== false) {
            return [null, "Invalid folder name."];
        }

        $dir = (strtolower($folder) === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");

        if ($create) {
            $st = $storage->stat($dir);
            if ($st === null || $st['type'] !== 'dir') {
                if (!$storage->mkdir($dir, 0775, true)) {
                    return [null, "Cannot create destination folder"];
                }
            }
        }

        if ($isLocal) {
            $real = realpath($dir);
            if ($real === false || strpos($real, $base) !== 0) {
                return [null, "Invalid folder path."];
            }
            return [$real, null];
        }

        return [$dir, null];
    }

    private static function resolveFolderPathForAdapter(
        StorageAdapterInterface $storage,
        string $root,
        string $folder,
        bool $create = true
    ): array {
        $folder = trim($folder) ?: 'root';

        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return [null, "Invalid folder name."];
        }

        $isLocal = $storage->isLocal();
        $base = $isLocal ? realpath($root) : rtrim($root, '/\\');
        if ($base === false || $base === '') {
            return [null, "Server misconfiguration."];
        }

        if (!$isLocal && strpos($folder, '..') !== false) {
            return [null, "Invalid folder name."];
        }

        $dir = (strtolower($folder) === 'root')
            ? $base
            : $base . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");

        if ($create) {
            $st = $storage->stat($dir);
            if ($st === null || $st['type'] !== 'dir') {
                if (!$storage->mkdir($dir, 0775, true)) {
                    return [null, "Cannot create destination folder"];
                }
            }
        }

        if ($isLocal) {
            $real = realpath($dir);
            if ($real === false || strpos($real, $base) !== 0) {
                return [null, "Invalid folder path."];
            }
            return [$real, null];
        }

        return [$dir, null];
    }

    /**
     * Copies files from a source folder to a destination folder, updating metadata if available.
     *
     * @param string $sourceFolder The source folder (e.g. "root" or a subfolder)
     * @param string $destinationFolder The destination folder.
     * @param array  $files Array of file names to copy.
     * @return array Result with either "success" or "error" key.
     */
    public static function copyFiles($sourceFolder, $destinationFolder, $files)
    {
        $errors = [];
        $storage = self::storage();
        $isLocal = $storage->isLocal();

        list($sourceDir, $err) = self::resolveFolderPath($sourceFolder, false);
        if ($err) return ["error" => $err];
        list($destDir, $err)   = self::resolveFolderPath($destinationFolder, true);
        if ($err) return ["error" => $err];

        $sourceDir .= DIRECTORY_SEPARATOR;
        $destDir   .= DIRECTORY_SEPARATOR;

        $destEncrypted = false;
        try {
            $destEncrypted = FolderCrypto::isEncryptedOrAncestor((string)$destinationFolder);
        } catch (\Throwable $e) {
            $destEncrypted = false;
        }
        $srcEncrypted = false;
        try {
            $srcEncrypted = FolderCrypto::isEncryptedOrAncestor((string)$sourceFolder);
        } catch (\Throwable $e) {
            $srcEncrypted = false;
        }
        if (!$isLocal && ($srcEncrypted || $destEncrypted)) {
            return ["error" => "Encrypted folders are not supported for remote storage."];
        }

        // Metadata paths
        $srcMetaFile  = self::getMetadataFilePath($sourceFolder);
        $destMetaFile = self::getMetadataFilePath($destinationFolder);

        $srcMetadata  = file_exists($srcMetaFile)  ? (json_decode(file_get_contents($srcMetaFile), true)  ?: []) : [];
        $destMetadata = file_exists($destMetaFile) ? (json_decode(file_get_contents($destMetaFile), true) ?: []) : [];

        $safeFileNamePattern = REGEX_FILE_NAME;
        $actor = $_SESSION['username'] ?? 'Unknown';
        $now   = date(DATE_TIME_FORMAT);

        foreach ($files as $fileName) {
            $originalName = basename(trim($fileName));
            $basename     = $originalName;

            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }

            $srcPath  = $sourceDir . $originalName;
            $destPath = $destDir . $basename;

            clearstatcache();
            if ($storage->stat($srcPath) === null) {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }

            // Avoid overwrite: pick unique name
            if ($storage->stat($destPath) !== null) {
                $basename = self::getUniqueFileName($destDir, $basename);
                $destPath = $destDir . $basename;
            }

            if ($isLocal) {
                try {
                    $srcIsEncryptedFile = CryptoAtRest::isEncryptedFile($srcPath);
                    if ($srcIsEncryptedFile && !$destEncrypted) {
                        CryptoAtRest::decryptFileToPath($srcPath, $destPath);
                    } else {
                        if (!$storage->copy($srcPath, $destPath)) {
                            $errors[] = "Failed to copy $basename.";
                            continue;
                        }
                        if (!$srcIsEncryptedFile && $destEncrypted) {
                            CryptoAtRest::encryptFileInPlace($destPath);
                        }
                    }
                } catch (\Throwable $e) {
                    $storage->delete($destPath);
                    $errors[] = "Failed to copy {$basename}: " . $e->getMessage();
                    continue;
                }
            } else {
                if (!$storage->copy($srcPath, $destPath)) {
                    $errors[] = "Failed to copy $basename.";
                    continue;
                }
            }

            // Carry over non-ownership fields (e.g., tags), but stamp new ownership/timestamps
            $tags = [];
            if (isset($srcMetadata[$originalName]['tags']) && is_array($srcMetadata[$originalName]['tags'])) {
                $tags = $srcMetadata[$originalName]['tags'];
            }

            $destMetadata[$basename] = [
                'uploaded' => $now,
                'modified' => $now,
                'uploader' => $actor,
                'tags'     => $tags
            ];
        }

        if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update destination metadata.";
        }

        return empty($errors)
            ? ["success" => "Files copied successfully"]
            : ["error" => implode("; ", $errors)];
    }

    /**
     * Generates the metadata file path for a given folder.
     *
     * @param string $folder
     * @return string
     */
    private static function getMetadataFilePath($folder)
    {
        return self::getMetadataFilePathForRoot(self::metaRoot(), (string)$folder);
    }

    /**
     * Generates a unique file name if a file with the same name exists in the destination directory.
     *
     * @param string $destDir
     * @param string $fileName
     * @return string
     */
    private static function getUniqueFileName($destDir, $fileName)
    {
        return self::getUniqueFileNameForAdapter(self::storage(), $destDir, $fileName);
    }

    private static function getUniqueFileNameForAdapter(StorageAdapterInterface $storage, string $destDir, string $fileName): string
    {
        $fullPath = $destDir . $fileName;
        clearstatcache(true, $fullPath);
        if ($storage->stat($fullPath) === null) {
            return $fileName;
        }
        $basename = pathinfo($fileName, PATHINFO_FILENAME);
        $extension = pathinfo($fileName, PATHINFO_EXTENSION);
        $counter = 1;
        do {
            $newName = $basename . " (" . $counter . ")" . ($extension ? "." . $extension : "");
            $newFullPath = $destDir . $newName;
            clearstatcache(true, $newFullPath);
            $counter++;
        } while ($storage->stat($destDir . $newName) !== null);
        return $newName;
    }

    private static function adapterErrorDetail(StorageAdapterInterface $storage): string
    {
        if (method_exists($storage, 'getLastError')) {
            $detail = trim((string)$storage->getLastError());
            if ($detail !== '') {
                $detail = preg_replace('/(\\w+:\\/\\/)([^\\s@]+@)/i', '$1', $detail) ?? $detail;
                if (strlen($detail) > 240) {
                    $detail = substr($detail, 0, 240) . '...';
                }
                return $detail;
            }
        }
        return '';
    }

    private static function ensureSeekableStream($stream, ?int $length = null): array
    {
        if (!is_resource($stream)) {
            return [$stream, $length];
        }

        $meta = @stream_get_meta_data($stream);
        $seekable = is_array($meta) && !empty($meta['seekable']);
        if ($seekable) {
            @rewind($stream);
            return [$stream, $length];
        }

        $tmp = @tmpfile();
        if ($tmp === false) {
            return [$stream, $length];
        }

        $bytes = @stream_copy_to_stream($stream, $tmp);
        if ($bytes === false) {
            @fclose($tmp);
            return [$stream, $length];
        }

        @fclose($stream);
        @rewind($tmp);
        if ($length === null) {
            $length = (int)$bytes;
        }

        return [$tmp, $length];
    }

    private static function tempTransferDir(): string
    {
        $base = rtrim((string)META_DIR, '/\\');
        if ($base === '') {
            return sys_get_temp_dir();
        }
        $dir = $base . DIRECTORY_SEPARATOR . 'transfer_tmp';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return is_dir($dir) ? $dir : sys_get_temp_dir();
    }

    private static function bufferSourceToTempStream(StorageAdapterInterface $srcStorage, string $srcPath): array
    {
        $tmpPath = @tempnam(self::tempTransferDir(), 'frxfer_');
        if ($tmpPath === false || $tmpPath === '') {
            return [false, null, ''];
        }

        $tmp = @fopen($tmpPath, 'w+b');
        if ($tmp === false) {
            @unlink($tmpPath);
            return [false, null, ''];
        }

        $bytes = 0;
        $stream = $srcStorage->openReadStream($srcPath);
        if (is_resource($stream)) {
            $copied = @stream_copy_to_stream($stream, $tmp);
            @fclose($stream);
            if ($copied === false) {
                @fclose($tmp);
                @unlink($tmpPath);
                return [false, null, ''];
            }
            $bytes = (int)$copied;
        } elseif (is_object($stream) && method_exists($stream, 'read')) {
            while (true) {
                $chunk = $stream->read(8192);
                if ($chunk === false || $chunk === '') break;
                $written = @fwrite($tmp, $chunk);
                if ($written === false) {
                    if (method_exists($stream, 'close')) {
                        $stream->close();
                    }
                    @fclose($tmp);
                    @unlink($tmpPath);
                    return [false, null, ''];
                }
                $bytes += $written;
            }
            if (method_exists($stream, 'close')) {
                $stream->close();
            }
        } else {
            @fclose($tmp);
            @unlink($tmpPath);
            return [false, null, ''];
        }

        @rewind($tmp);
        return [$tmp, $bytes > 0 ? $bytes : null, $tmpPath];
    }

    public static function copyFilesAcrossSources(string $sourceId, string $destinationId, string $sourceFolder, string $destinationFolder, array $files): array
    {
        $errors = [];
        $srcStorage = StorageRegistry::getAdapter($sourceId);
        $dstStorage = StorageRegistry::getAdapter($destinationId);

        $srcRoot = class_exists('SourceContext') ? SourceContext::uploadRootForId($sourceId) : rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $dstRoot = class_exists('SourceContext') ? SourceContext::uploadRootForId($destinationId) : rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;

        [$sourceDir, $err] = self::resolveFolderPathForAdapter($srcStorage, $srcRoot, $sourceFolder, false);
        if ($err) return ["error" => $err];
        [$destDir, $err] = self::resolveFolderPathForAdapter($dstStorage, $dstRoot, $destinationFolder, true);
        if ($err) return ["error" => $err];

        $sourceDir .= DIRECTORY_SEPARATOR;
        $destDir   .= DIRECTORY_SEPARATOR;

        $srcMetaRoot  = self::metaRootForId($sourceId);
        $destMetaRoot = self::metaRootForId($destinationId);

        $srcMetaFile  = self::getMetadataFilePathForRoot($srcMetaRoot, $sourceFolder);
        $destMetaFile = self::getMetadataFilePathForRoot($destMetaRoot, $destinationFolder);

        $srcMetadata  = is_file($srcMetaFile) ? (json_decode((string)file_get_contents($srcMetaFile), true) ?: []) : [];
        $destMetadata = is_file($destMetaFile) ? (json_decode((string)file_get_contents($destMetaFile), true) ?: []) : [];

        $safeFileNamePattern = REGEX_FILE_NAME;
        $actor = $_SESSION['username'] ?? 'Unknown';
        $now   = date(DATE_TIME_FORMAT);

        foreach ($files as $fileName) {
            $originalName = basename(trim((string)$fileName));
            $basename = $originalName;

            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }

            $srcPath  = $sourceDir . $originalName;
            $destPath = $destDir . $basename;

            clearstatcache();
            $stat = $srcStorage->stat($srcPath);
            if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }

            if ($dstStorage->stat($destPath) !== null) {
                $basename = self::getUniqueFileNameForAdapter($dstStorage, $destDir, $basename);
                $destPath = $destDir . $basename;
            }

            $stream = $srcStorage->openReadStream($srcPath);
            $written = false;
            $length = isset($stat['size']) ? (int)$stat['size'] : null;
            $mime = isset($stat['mime']) ? (string)$stat['mime'] : null;

            if ($stream && is_resource($stream)) {
                [$stream, $length] = self::ensureSeekableStream($stream, $length);
                $written = $dstStorage->writeStream($destPath, $stream, $length, $mime);
                if (is_resource($stream)) {
                    @fclose($stream);
                }
            } else {
                $data = $srcStorage->read($srcPath);
                if ($data !== false) {
                    $written = $dstStorage->write($destPath, $data, LOCK_EX);
                }
            }

            if (!$written) {
                $detail = self::adapterErrorDetail($dstStorage);
                if ($detail !== '' && stripos($detail, 'rewind') !== false) {
                    $retryStream = $srcStorage->openReadStream($srcPath);
                    if (is_resource($retryStream)) {
                        [$retryStream, $length] = self::ensureSeekableStream($retryStream, $length);
                        $written = $dstStorage->writeStream($destPath, $retryStream, $length, $mime);
                        if (is_resource($retryStream)) {
                            @fclose($retryStream);
                        }
                    }

                    if (!$written) {
                        $maxInlineBytes = 32 * 1024 * 1024;
                        if ($length !== null && $length <= $maxInlineBytes) {
                            $data = $srcStorage->read($srcPath);
                            if ($data !== false) {
                                $written = $dstStorage->write($destPath, $data, LOCK_EX);
                            }
                        }
                    }

                    if (!$written) {
                        $maxBufferBytes = 128 * 1024 * 1024;
                        if ($length !== null && $length <= $maxBufferBytes) {
                            [$tmp, $bufLen, $tmpPath] = self::bufferSourceToTempStream($srcStorage, $srcPath);
                            if ($tmp) {
                                $written = $dstStorage->writeStream($destPath, $tmp, $bufLen, $mime);
                                if (is_resource($tmp)) {
                                    @fclose($tmp);
                                }
                                if ($tmpPath !== '') {
                                    @unlink($tmpPath);
                                }
                            }
                        }
                    }
                }
            }

            if (!$written) {
                $detail = self::adapterErrorDetail($dstStorage);
                $errors[] = $detail !== ''
                    ? "Failed to copy $basename: $detail"
                    : "Failed to copy $basename.";
                $dstStorage->delete($destPath);
                continue;
            }

            $tags = [];
            if (isset($srcMetadata[$originalName]['tags']) && is_array($srcMetadata[$originalName]['tags'])) {
                $tags = $srcMetadata[$originalName]['tags'];
            }

            $destMetadata[$basename] = [
                'uploaded' => $now,
                'modified' => $now,
                'uploader' => $actor,
                'tags'     => $tags
            ];
        }

        if (@file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update destination metadata.";
        }

        return empty($errors)
            ? ["success" => "Files copied successfully"]
            : ["error" => implode("; ", $errors)];
    }

    public static function moveFilesAcrossSources(string $sourceId, string $destinationId, string $sourceFolder, string $destinationFolder, array $files): array
    {
        $errors = [];
        $srcStorage = StorageRegistry::getAdapter($sourceId);
        $dstStorage = StorageRegistry::getAdapter($destinationId);

        $srcRoot = class_exists('SourceContext') ? SourceContext::uploadRootForId($sourceId) : rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        $dstRoot = class_exists('SourceContext') ? SourceContext::uploadRootForId($destinationId) : rtrim((string)UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;

        [$sourceDir, $err] = self::resolveFolderPathForAdapter($srcStorage, $srcRoot, $sourceFolder, false);
        if ($err) return ["error" => $err];
        [$destDir, $err] = self::resolveFolderPathForAdapter($dstStorage, $dstRoot, $destinationFolder, true);
        if ($err) return ["error" => $err];

        $sourceDir .= DIRECTORY_SEPARATOR;
        $destDir   .= DIRECTORY_SEPARATOR;

        $srcMetaRoot  = self::metaRootForId($sourceId);
        $destMetaRoot = self::metaRootForId($destinationId);

        $srcMetaFile  = self::getMetadataFilePathForRoot($srcMetaRoot, $sourceFolder);
        $destMetaFile = self::getMetadataFilePathForRoot($destMetaRoot, $destinationFolder);

        $srcMetadata  = is_file($srcMetaFile) ? (json_decode((string)file_get_contents($srcMetaFile), true) ?: []) : [];
        $destMetadata = is_file($destMetaFile) ? (json_decode((string)file_get_contents($destMetaFile), true) ?: []) : [];

        $movedFiles = [];
        $safeFileNamePattern = REGEX_FILE_NAME;

        foreach ($files as $fileName) {
            $originalName = basename(trim((string)$fileName));
            $basename = $originalName;

            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has invalid characters.";
                continue;
            }

            $srcPath = $sourceDir . $originalName;
            $destPath = $destDir . $basename;

            clearstatcache();
            $stat = $srcStorage->stat($srcPath);
            if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }

            if ($dstStorage->stat($destPath) !== null) {
                $basename = self::getUniqueFileNameForAdapter($dstStorage, $destDir, $basename);
                $destPath = $destDir . $basename;
            }

            $stream = $srcStorage->openReadStream($srcPath);
            $written = false;
            $length = isset($stat['size']) ? (int)$stat['size'] : null;
            $mime = isset($stat['mime']) ? (string)$stat['mime'] : null;

            if ($stream && is_resource($stream)) {
                [$stream, $length] = self::ensureSeekableStream($stream, $length);
                $written = $dstStorage->writeStream($destPath, $stream, $length, $mime);
                if (is_resource($stream)) {
                    @fclose($stream);
                }
            } else {
                $data = $srcStorage->read($srcPath);
                if ($data !== false) {
                    $written = $dstStorage->write($destPath, $data, LOCK_EX);
                }
            }

            if (!$written) {
                $detail = self::adapterErrorDetail($dstStorage);
                if ($detail !== '' && stripos($detail, 'rewind') !== false) {
                    $retryStream = $srcStorage->openReadStream($srcPath);
                    if (is_resource($retryStream)) {
                        [$retryStream, $length] = self::ensureSeekableStream($retryStream, $length);
                        $written = $dstStorage->writeStream($destPath, $retryStream, $length, $mime);
                        if (is_resource($retryStream)) {
                            @fclose($retryStream);
                        }
                    }

                    if (!$written) {
                        $maxInlineBytes = 32 * 1024 * 1024;
                        if ($length !== null && $length <= $maxInlineBytes) {
                            $data = $srcStorage->read($srcPath);
                            if ($data !== false) {
                                $written = $dstStorage->write($destPath, $data, LOCK_EX);
                            }
                        }
                    }

                    if (!$written) {
                        $maxBufferBytes = 128 * 1024 * 1024;
                        if ($length !== null && $length <= $maxBufferBytes) {
                            [$tmp, $bufLen, $tmpPath] = self::bufferSourceToTempStream($srcStorage, $srcPath);
                            if ($tmp) {
                                $written = $dstStorage->writeStream($destPath, $tmp, $bufLen, $mime);
                                if (is_resource($tmp)) {
                                    @fclose($tmp);
                                }
                                if ($tmpPath !== '') {
                                    @unlink($tmpPath);
                                }
                            }
                        }
                    }
                }
            }

            if (!$written) {
                $detail = self::adapterErrorDetail($dstStorage);
                $errors[] = $detail !== ''
                    ? "Failed to move $basename: $detail"
                    : "Failed to move $basename.";
                $dstStorage->delete($destPath);
                continue;
            }

            if (!$srcStorage->delete($srcPath)) {
                $errors[] = "Failed to remove source file {$basename}.";
            }

            $movedFiles[] = $originalName;
            if (isset($srcMetadata[$originalName])) {
                $destMetadata[$basename] = $srcMetadata[$originalName];
                unset($srcMetadata[$originalName]);
            }
        }

        if (@file_put_contents($srcMetaFile, json_encode($srcMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update source metadata.";
        }
        if (@file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update destination metadata.";
        }

        if (empty($errors)) {
            return ["success" => "Files moved successfully"];
        }

        return ["error" => implode("; ", $errors)];
    }

    /**
     * Deletes (i.e. moves to Trash) the specified files from a given folder
     * and updates metadata accordingly.
     *
     * @param string $folder The folder (or "root") from which files are deleted.
     * @param array $files The array of file names to delete.
     * @return array An associative array with a "success" or "error" message.
     */
    public static function deleteFiles($folder, $files)
    {
        $errors = [];
        $storage = self::storage();
        $isLocal = $storage->isLocal();
        $skipTrash = false;
        if (!$isLocal && class_exists('SourceContext')) {
            $src = SourceContext::getActiveSource();
            if (is_array($src)) {
                $type = strtolower((string)($src['type'] ?? ''));
                if ($type === 'gdrive') {
                    $skipTrash = true;
                }
            }
        }

        list($uploadDir, $err) = self::resolveFolderPath($folder, false);
        if ($err) return ["error" => $err];
        $uploadDir .= DIRECTORY_SEPARATOR;

        // Setup the Trash folder and metadata.
        $trashDir = '';
        $trashMetadataFile = '';
        $trashData = [];
        if (!$skipTrash) {
            $trashDir = rtrim(self::trashRoot(), '/\\') . DIRECTORY_SEPARATOR;
            if ($storage->stat($trashDir) === null) {
                $storage->mkdir($trashDir, 0755, true);
            }
            $trashMetadataFile = $trashDir . "trash.json";
            $trashJson = $storage->read($trashMetadataFile);
            if ($trashJson !== false) {
                $trashData = json_decode($trashJson, true);
            }
            if (!is_array($trashData)) {
                $trashData = [];
            }
        }

        // Load folder metadata if available.
        $metadataFile = self::getMetadataFilePath($folder);
        $folderMetadata = file_exists($metadataFile)
            ? json_decode(file_get_contents($metadataFile), true)
            : [];
        if (!is_array($folderMetadata)) {
            $folderMetadata = [];
        }

        $movedToTrash = [];
        $deletedPermanent = [];
        $safeFileNamePattern = REGEX_FILE_NAME;

        foreach ($files as $fileName) {
            $basename = basename(trim($fileName));

            // Validate the file name.
            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }

            $filePath = $uploadDir . $basename;

            if ($skipTrash) {
                if (!$storage->delete($filePath)) {
                    if (!$isLocal && $storage->stat($filePath) === null) {
                        $deletedPermanent[] = $basename;
                        continue;
                    }
                    $errors[] = "Failed to delete $basename.";
                    continue;
                }
                $deletedPermanent[] = $basename;
                continue;
            }

            // Local: check existence; Remote: avoid per-file stat unless needed.
            if ($isLocal) {
                if ($storage->stat($filePath) === null) {
                    $deletedPermanent[] = $basename;
                    continue;
                }
            }

            // Unique trash name (timestamp + random)
            $trashFileName = $basename . '_' . time() . '_' . bin2hex(random_bytes(4));
            $trashTarget = $trashDir . $trashFileName;
            $moved = $storage->move($filePath, $trashTarget);
            if (!$moved) {
                // Fallback for backends that don't support MOVE across collections.
                $copied = $storage->copy($filePath, $trashTarget);
                if ($copied) {
                    if ($storage->delete($filePath)) {
                        $moved = true;
                    } else {
                        // Best-effort cleanup to avoid leaving a duplicate in trash.
                        $storage->delete($trashTarget);
                    }
                }
            }
            if ($moved) {
                $movedToTrash[] = $basename;
                // Record trash metadata for possible restoration.
                $trashData[] = [
                    'type'           => 'file',
                    'originalFolder' => $uploadDir,
                    'originalName'   => $basename,
                    'trashName'      => $trashFileName,
                    'trashedAt'      => time(),
                    'uploaded'       => $folderMetadata[$basename]['uploaded'] ?? "Unknown",
                    'uploader'       => $folderMetadata[$basename]['uploader'] ?? "Unknown",
                    'deletedBy'      => $_SESSION['username'] ?? "Unknown"
                ];
            } else {
                if (!$isLocal && $storage->delete($filePath)) {
                    $deletedPermanent[] = $basename;
                } else {
                    if (!$isLocal && $storage->stat($filePath) === null) {
                        $deletedPermanent[] = $basename;
                        continue;
                    }
                    $errors[] = "Failed to move $basename to Trash.";
                }
                continue;
            }
        }

        // Save updated trash metadata.
        if (!$skipTrash) {
            $storage->write($trashMetadataFile, json_encode($trashData, JSON_PRETTY_PRINT), LOCK_EX);
        }

        // Remove deleted file entries from folder metadata.
        if (file_exists($metadataFile)) {
            $metadata = json_decode(file_get_contents($metadataFile), true);
            if (is_array($metadata)) {
                $removedFiles = array_merge($movedToTrash, $deletedPermanent);
                foreach ($removedFiles as $delFile) {
                    if (isset($metadata[$delFile])) {
                        unset($metadata[$delFile]);
                    }
                }
                file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT), LOCK_EX);
            }
        }

        if (!$isLocal && strtolower((string)$folder) !== 'root') {
            if (!empty($movedToTrash) || !empty($deletedPermanent)) {
                self::ensureRemoteFolderMarker($storage, rtrim($uploadDir, '/\\'));
            }
        }

        if (empty($errors)) {
            $parts = [];
            if (!empty($movedToTrash)) {
                $parts[] = "Files moved to Trash: " . implode(", ", $movedToTrash);
            }
            if (!empty($deletedPermanent)) {
                $parts[] = "Deleted permanently: " . implode(", ", $deletedPermanent);
            }
            return ["success" => trim(implode(" ", $parts))];
        } else {
            $suffixParts = [];
            if (!empty($movedToTrash)) {
                $suffixParts[] = "Files moved to Trash: " . implode(", ", $movedToTrash);
            }
            if (!empty($deletedPermanent)) {
                $suffixParts[] = "Deleted permanently: " . implode(", ", $deletedPermanent);
            }
            $suffix = $suffixParts ? " " . implode(" ", $suffixParts) : "";
            return ["error" => implode("; ", $errors) . "." . $suffix];
        }
    }

    /**
     * Moves files from a source folder to a destination folder and updates metadata.
     *
     * @param string $sourceFolder The source folder (e.g., "root" or a subfolder).
     * @param string $destinationFolder The destination folder.
     * @param array  $files An array of file names to move.
     * @return array An associative array with either a "success" key or an "error" key.
     */
    public static function moveFiles($sourceFolder, $destinationFolder, $files)
    {
        $errors = [];
        $storage = self::storage();
        $isLocal = $storage->isLocal();

        list($sourceDir, $err) = self::resolveFolderPath($sourceFolder, false);
        if ($err) return ["error" => $err];
        list($destDir, $err)   = self::resolveFolderPath($destinationFolder, true);
        if ($err) return ["error" => $err];

        $sourceDir .= DIRECTORY_SEPARATOR;
        $destDir   .= DIRECTORY_SEPARATOR;

        // Get metadata file paths.
        $srcMetaFile  = self::getMetadataFilePath($sourceFolder);
        $destMetaFile = self::getMetadataFilePath($destinationFolder);

        $srcMetadata  = file_exists($srcMetaFile)  ? json_decode(file_get_contents($srcMetaFile), true)  : [];
        $destMetadata = file_exists($destMetaFile) ? json_decode(file_get_contents($destMetaFile), true) : [];
        if (!is_array($srcMetadata)) {
            $srcMetadata = [];
        }
        if (!is_array($destMetadata)) {
            $destMetadata = [];
        }

        $destEncrypted = false;
        try {
            $destEncrypted = FolderCrypto::isEncryptedOrAncestor((string)$destinationFolder);
        } catch (\Throwable $e) {
            $destEncrypted = false;
        }
        $srcEncrypted = false;
        try {
            $srcEncrypted = FolderCrypto::isEncryptedOrAncestor((string)$sourceFolder);
        } catch (\Throwable $e) {
            $srcEncrypted = false;
        }
        if (!$isLocal && ($srcEncrypted || $destEncrypted)) {
            return ["error" => "Encrypted folders are not supported for remote storage."];
        }

        $movedFiles = [];
        $safeFileNamePattern = REGEX_FILE_NAME;

        foreach ($files as $fileName) {
            // Save the original file name for metadata lookup.
            $originalName = basename(trim($fileName));
            $basename = $originalName;

            // Validate the file name.
            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has invalid characters.";
                continue;
            }

            $srcPath = $sourceDir . $originalName;
            $destPath = $destDir . $basename;

            clearstatcache();
            if ($storage->stat($srcPath) === null) {
                $errors[] = "$originalName does not exist in source.";
                continue;
            }

            // If a file with the same name exists in destination, generate a unique name.
            if ($storage->stat($destPath) !== null) {
                $uniqueName = self::getUniqueFileName($destDir, $basename);
                $basename = $uniqueName;
                $destPath = $destDir . $uniqueName;
            }

            if ($isLocal) {
                $srcIsEncryptedFile = false;
                try {
                    $srcIsEncryptedFile = CryptoAtRest::isEncryptedFile($srcPath);
                } catch (\Throwable $e) {
                    $srcIsEncryptedFile = false;
                }

                try {
                    if ($srcIsEncryptedFile && !$destEncrypted) {
                        // decrypt while moving, then remove the encrypted source
                        CryptoAtRest::decryptFileToPath($srcPath, $destPath);
                        $storage->delete($srcPath);
                    } else {
                        if (!$storage->move($srcPath, $destPath)) {
                            $errors[] = "Failed to move $basename.";
                            continue;
                        }
                        if (!$srcIsEncryptedFile && $destEncrypted) {
                            try {
                                CryptoAtRest::encryptFileInPlace($destPath);
                            } catch (\Throwable $e) {
                                // best-effort rollback
                                $storage->move($destPath, $srcPath);
                                throw $e;
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    $storage->delete($destPath);
                    $errors[] = "Failed to move {$basename}: " . $e->getMessage();
                    continue;
                }
            } else {
                if (!$storage->move($srcPath, $destPath)) {
                    $errors[] = "Failed to move $basename.";
                    continue;
                }
            }

            $movedFiles[] = $originalName;
            // Update destination metadata: if metadata for the original file exists in source, move it under the new name.
            if (isset($srcMetadata[$originalName])) {
                $destMetadata[$basename] = $srcMetadata[$originalName];
                unset($srcMetadata[$originalName]);
            }
        }

        // Write back updated metadata.
        if (file_put_contents($srcMetaFile, json_encode($srcMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update source metadata.";
        }
        if (file_put_contents($destMetaFile, json_encode($destMetadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            $errors[] = "Failed to update destination metadata.";
        }

        if (!$isLocal && !empty($movedFiles) && strtolower((string)$sourceFolder) !== 'root') {
            self::ensureRemoteFolderMarker($storage, rtrim($sourceDir, '/\\'));
        }

        if (empty($errors)) {
            return ["success" => "Files moved successfully"];
        } else {
            return ["error" => implode("; ", $errors)];
        }
    }

    /**
     * Renames a file within a given folder and updates folder metadata.
     *
     * @param string $folder The folder where the file is located (or "root" for the base directory).
     * @param string $oldName The current name of the file.
     * @param string $newName The new name for the file.
     * @return array An associative array with either "success" (and newName) or "error" message.
     */
    public static function renameFile($folder, $oldName, $newName)
    {
        $storage = self::storage();
        list($directory, $err) = self::resolveFolderPath($folder, false);
        if ($err) return ["error" => $err];
        $directory .= DIRECTORY_SEPARATOR;

        // Sanitize file names.
        $oldName = basename(trim($oldName));
        $newName = basename(trim($newName));

        // Validate file names using REGEX_FILE_NAME.
        if (!preg_match(REGEX_FILE_NAME, $oldName) || !preg_match(REGEX_FILE_NAME, $newName)) {
            return ["error" => "Invalid file name."];
        }

        $oldPath = $directory . $oldName;
        $newPath = $directory . $newName;

        // Helper: Generate a unique file name if the new name already exists.
        if ($storage->stat($newPath) !== null) {
            $newName = self::getUniqueFileName($directory, $newName);
            $newPath = $directory . $newName;
        }

        // Check that the old file exists.
        if ($storage->stat($oldPath) === null) {
            return ["error" => "File does not exist"];
        }

        // Perform the rename.
        if ($storage->move($oldPath, $newPath)) {
            // Update the metadata file.
            $metadataKey = ($folder === 'root') ? "root" : $folder;
            $metadataFile = self::metaRoot() . str_replace(['/', '\\', ' '], '-', trim($metadataKey)) . '_metadata.json';

            if (file_exists($metadataFile)) {
                $metadata = json_decode(file_get_contents($metadataFile), true);
                if (isset($metadata[$oldName])) {
                    $metadata[$newName] = $metadata[$oldName];
                    unset($metadata[$oldName]);
                    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT), LOCK_EX);
                }
            }
            return ["success" => "File renamed successfully", "newName" => $newName];
        } else {
            return ["error" => "Error renaming file"];
        }
    }

    /*
     * Save a file’s contents *and* record its metadata, including who uploaded it.
     *
     * @param string                $folder    Folder key (e.g. "root" or "invoices/2025")
     * @param string                $fileName  Basename of the file
     * @param resource|string       $content   File contents (stream or string)
     * @param string|null           $uploader  Username of uploader (if null, falls back to session)
     * @return array                          ["success"=>"…"] or ["error"=>"…"]
     */
    public static function saveFile(string $folder, string $fileName, $content, ?string $uploader = null): array
    {
        $folder   = trim($folder) ?: 'root';
        $fileName = basename(trim($fileName));

        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name"];
        }
        if (!preg_match(REGEX_FILE_NAME, $fileName)) {
            return ["error" => "Invalid file name"];
        }

        $storage = self::storage();
        $isLocal = $storage->isLocal();
        $root = self::uploadRoot();
        $baseDirReal = $isLocal ? realpath($root) : rtrim($root, '/\\');
        if ($baseDirReal === false || $baseDirReal === '') {
            return ["error" => "Server misconfiguration"];
        }

        $root = self::uploadRoot();

        if (!$isLocal) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                    return ["error" => "Encrypted folders are not supported for remote storage."];
                }
            } catch (\Throwable $e) { /* ignore */ }
        }

        $targetDir = (strtolower($folder) === 'root')
            ? rtrim($root, '/\\') . DIRECTORY_SEPARATOR
            : rtrim($root, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ") . DIRECTORY_SEPARATOR;

        // Ensure directory exists *before* realpath + containment check
        $dirStat = $storage->stat($targetDir);
        if ($dirStat === null || $dirStat['type'] !== 'dir') {
            if (!$storage->mkdir($targetDir, 0775, true)) {
                return ["error" => "Failed to create destination folder"];
            }
        }

        if ($isLocal) {
            $targetDirReal = realpath($targetDir);
            if ($targetDirReal === false || strpos($targetDirReal, $baseDirReal) !== 0) {
                return ["error" => "Invalid folder path"];
            }
            $filePath = $targetDirReal . DIRECTORY_SEPARATOR . $fileName;
        } else {
            $filePath = rtrim($targetDir, '/\\') . DIRECTORY_SEPARATOR . $fileName;
        }

        if (is_resource($content)) {
            if ($isLocal) {
                $out = fopen($filePath, 'wb');
                if ($out === false) return ["error" => "Unable to open file for writing"];
                stream_copy_to_stream($content, $out);
                fclose($out);
            } else {
                if (!$storage->writeStream($filePath, $content, null, null)) {
                    return ["error" => "Error saving file"];
                }
            }
        } else {
            if (!$storage->write($filePath, (string)$content, LOCK_EX)) {
                return ["error" => "Error saving file"];
            }
        }

        // Encrypt at rest if folder is marked encrypted (local storage only)
        if ($isLocal) {
            try {
                if (FolderCrypto::isEncryptedOrAncestor($folder)) {
                    CryptoAtRest::encryptFileInPlace($filePath);
                }
            } catch (\Throwable $e) {
                $storage->delete($filePath);
                return ["error" => "Error encrypting file at rest: " . $e->getMessage()];
            }
        }

        // Metadata
        $metadataKey      = strtolower($folder) === "root" ? "root" : $folder;
        $metadataFileName = str_replace(['/', '\\', ' '], '-', trim($metadataKey)) . '_metadata.json';
        $metadataFilePath = self::metaRoot() . $metadataFileName;

        $metadata = file_exists($metadataFilePath) ? (json_decode(file_get_contents($metadataFilePath), true) ?: []) : [];

        $currentTime = date(DATE_TIME_FORMAT);
        $uploader = $uploader ?? ($_SESSION['username'] ?? "Unknown");

        if (isset($metadata[$fileName])) {
            $metadata[$fileName]['modified'] = $currentTime;
            $metadata[$fileName]['uploader'] = $uploader;
        } else {
            $metadata[$fileName] = [
                "uploaded" => $currentTime,
                "modified" => $currentTime,
                "uploader" => $uploader
            ];
        }

        if (file_put_contents($metadataFilePath, json_encode($metadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Failed to update metadata"];
        }

        return ["success" => "File saved successfully"];
    }

    /**
     * Validates and retrieves information needed to download a file.
     *
     * @param string $folder The folder from which to download (e.g., "root" or a subfolder).
     * @param string $file The file name.
     * @return array An associative array with "error" key on failure,
     *               or "filePath" and "mimeType" keys on success.
     */
    public static function getDownloadInfo($folder, $file)
    {
        $storage = self::storage();
        $isLocal = $storage->isLocal();
        $root = self::uploadRoot();

        // Validate file name using REGEX_FILE_NAME.
        $file = basename(trim($file));
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            return ["error" => "Invalid file name."];
        }

        if (!$isLocal) {
            // Remote adapter path resolution (no realpath).
            if (strtolower($folder) !== 'root' && trim($folder) !== '') {
                if (strpos($folder, '..') !== false) {
                    return ["error" => "Invalid folder name."];
                }
                $parts = explode('/', trim((string)$folder, "/\\ "));
                foreach ($parts as $part) {
                    if ($part === '' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                        return ["error" => "Invalid folder name."];
                    }
                }
                $directory = rtrim($root, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");
            } else {
                $directory = rtrim($root, '/\\');
            }

            $filePath = $directory . DIRECTORY_SEPARATOR . $file;
            $stat = $storage->stat($filePath);
            if ($stat === null || ($stat['type'] ?? '') !== 'file') {
                $probe = $storage->openReadStream($filePath, 1, 0);
                if ($probe === false) {
                    return ["error" => "File not found."];
                }
                if (is_resource($probe)) {
                    @fclose($probe);
                } elseif (is_object($probe) && method_exists($probe, 'close')) {
                    $probe->close();
                }
                $stat = [
                    'type' => 'file',
                    'size' => 0,
                ];
            }

            $downloadName = $file;
            $downloadExt = $stat['downloadExt'] ?? '';
            if (is_string($downloadExt)) {
                $downloadExt = ltrim($downloadExt, '.');
                if ($downloadExt !== '') {
                    $suffix = '.' . strtolower($downloadExt);
                    if (!str_ends_with(strtolower($downloadName), $suffix)) {
                        $downloadName .= '.' . $downloadExt;
                    }
                }
            }

            $mimeType = $stat['downloadMime'] ?? $stat['mime'] ?? 'application/octet-stream';
            if (!$mimeType || !is_string($mimeType)) {
                $mimeType = 'application/octet-stream';
            }

            $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
            if ($ext === 'svg') {
                $mimeType = 'image/svg+xml';
            }

            return [
                "filePath" => $filePath,
                "mimeType" => $mimeType,
                "downloadName" => $downloadName
            ];
        }

        // Determine the real upload directory.
        $uploadDirReal = realpath($root);
        if ($uploadDirReal === false) {
            return ["error" => "Server misconfiguration."];
        }

        // Determine directory based on folder.
        if (strtolower($folder) === 'root' || trim($folder) === '') {
            $directory = $uploadDirReal;
        } else {
            // Prevent path traversal.
            if (strpos($folder, '..') !== false) {
                return ["error" => "Invalid folder name."];
            }
            $directoryPath = rtrim($root, '/\\') . DIRECTORY_SEPARATOR . trim($folder, "/\\ ");
            $directory = realpath($directoryPath);
            if ($directory === false || strpos($directory, $uploadDirReal) !== 0) {
                return ["error" => "Invalid folder path."];
            }
        }

        // Build the file path.
        $filePath     = $directory . DIRECTORY_SEPARATOR . $file;
        $realFilePath = realpath($filePath);

        // Ensure the file exists and is within the allowed directory.
        if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
            return ["error" => "Access forbidden."];
        }
        if (!file_exists($realFilePath)) {
            return ["error" => "File not found."];
        }

        // Get the MIME type with safe fallback.
        $mimeType = function_exists('mime_content_type') ? mime_content_type($realFilePath) : null;
        if (!$mimeType || !is_string($mimeType)) {
            $mimeType = 'application/octet-stream';
        }

        // Normalize SVG MIME
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if ($ext === 'svg') {
            $mimeType = 'image/svg+xml';
        }

        return [
            "filePath" => $realFilePath,
            "mimeType" => $mimeType
        ];
    }

    public static function deleteFilesPermanent(string $folder, array $files): array
    {
        $errors  = [];
        $deleted = [];
        $storage = self::storage();

        list($uploadDir, $err) = self::resolveFolderPath($folder, false);
        if ($err) return ['error' => $err];

        $uploadDir = rtrim($uploadDir, '/\\') . DIRECTORY_SEPARATOR;
        $safeFileNamePattern = REGEX_FILE_NAME;

        foreach ($files as $fileName) {
            $originalName = basename(trim((string)$fileName));
            $basename     = $originalName;

            if ($basename === '') {
                $errors[] = 'Empty file name.';
                continue;
            }

            if (!preg_match($safeFileNamePattern, $basename)) {
                $errors[] = "$basename has an invalid name.";
                continue;
            }

            $filePath = $uploadDir . $basename;

            if ($storage->stat($filePath) !== null) {
                if (!$storage->delete($filePath)) {
                    $errors[] = "Failed to delete {$basename}.";
                    continue;
                }
            }

            $deleted[] = $basename;

            // Remove from folder metadata if present
            $metadataFile = self::getMetadataFilePath($folder);
            if (file_exists($metadataFile)) {
                $meta = json_decode(file_get_contents($metadataFile), true);
                if (is_array($meta) && isset($meta[$basename])) {
                    unset($meta[$basename]);
                    @file_put_contents($metadataFile, json_encode($meta, JSON_PRETTY_PRINT), LOCK_EX);
                }
            }
        }

        if ($errors && !$deleted) {
            return ['error' => implode('; ', $errors)];
        }

        if ($errors) {
            return [
                'error'   => implode('; ', $errors),
                'success' => 'Deleted: ' . implode(', ', $deleted),
            ];
        }

        return ['success' => 'Deleted: ' . implode(', ', $deleted)];
    }

    /**
     * Creates a ZIP archive of the specified files from a given folder.
     *
     * @param string $folder The folder from which to zip the files (e.g., "root" or a subfolder).
     * @param array $files An array of file names to include in the ZIP.
     * @return array An associative array with either an "error" key or a "zipPath" key.
     */
    public static function createZipArchive($folder, $files)
    {
        // Block ZIP creation inside encrypted folders (v1).
        try {
            if (FolderCrypto::isEncryptedOrAncestor((string)$folder)) {
                return ["error" => "ZIP operations are disabled inside encrypted folders."];
            }
        } catch (\Throwable $e) { /* ignore */ }

        // Purge old temp zips > 6h (best-effort)
        $zipRoot = rtrim(self::metaRoot(), '/\\') . DIRECTORY_SEPARATOR . 'ziptmp';
        $now = time();
        foreach ((glob($zipRoot . DIRECTORY_SEPARATOR . 'download-*.zip') ?: []) as $zp) {
            if (is_file($zp) && ($now - (int)@filemtime($zp)) > 21600) {
                @unlink($zp);
            }
        }

        // Normalize and validate target folder
        $folder = trim((string)$folder) ?: 'root';
        $baseDir = realpath(self::uploadRoot());
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }

        if (strtolower($folder) === 'root' || $folder === "") {
            $folderPathReal = $baseDir;
        } else {
            if (strpos($folder, '..') !== false) {
                return ["error" => "Invalid folder name."];
            }
            $parts = explode('/', trim($folder, "/\\ "));
            foreach ($parts as $part) {
                if ($part === '' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                    return ["error" => "Invalid folder name."];
                }
            }
            $folderPath = rtrim(self::uploadRoot(), '/\\') . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
            $folderPathReal = realpath($folderPath);
            if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
                return ["error" => "Folder not found."];
            }
        }

        // Collect files to zip (only regular files in the chosen folder)
        $filesToZip = [];
        foreach ($files as $fileName) {
            $fileName = basename(trim((string)$fileName));
            if (!preg_match(REGEX_FILE_NAME, $fileName)) {
                continue;
            }
            $fullPath = $folderPathReal . DIRECTORY_SEPARATOR . $fileName;
            // Skip symlinks (avoid archiving outside targets via links)
            if (is_link($fullPath)) {
                continue;
            }
            if (is_file($fullPath)) {
                $filesToZip[] = $fullPath;
            }
        }
        if (empty($filesToZip)) {
            return ["error" => "No valid files found to zip."];
        }

        // Workspace on the big disk: META_DIR/ziptmp
        $work = rtrim(self::metaRoot(), '/\\') . DIRECTORY_SEPARATOR . 'ziptmp';
        if (!is_dir($work)) {
            @mkdir($work, 0775, true);
        }
        if (!is_dir($work) || !is_writable($work)) {
            return ["error" => "ZIP temp dir not writable: " . $work];
        }

        // Optional sanity: ensure there is roughly enough free space
        $totalSize = 0;
        foreach ($filesToZip as $fp) {
            $sz = @filesize($fp);
            if ($sz !== false) $totalSize += (int)$sz;
        }
        $free = @disk_free_space($work);
        // Add ~20MB overhead and a 5% cushion
        if ($free !== false && $totalSize > 0) {
            $needed = (int)ceil($totalSize * 1.05) + (20 * 1024 * 1024);
            if ($free < $needed) {
                return ["error" => "Insufficient free space in ZIP workspace."];
            }
        }

        @set_time_limit(0);

        // Create the ZIP path inside META_DIR/ziptmp (libzip temp stays on same FS)
        $zipName = 'download-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.zip';
        $zipPath = $work . DIRECTORY_SEPARATOR . $zipName;

        $zip = new \ZipArchive();
        if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return ["error" => "Could not create zip archive."];
        }

        foreach ($filesToZip as $filePath) {
            // Add using basename at the root of the zip (matches current behavior)
            $zip->addFile($filePath, basename($filePath));
        }

        if (!$zip->close()) {
            // Commonly indicates disk full at finalize
            return ["error" => "Failed to finalize ZIP (disk full?)."];
        }

        // Success: controller will readfile() and unlink()
        return ["zipPath" => $zipPath];
    }

    /**
     * Extracts archive files from the specified folder.
     * Supports ZIP via ZipArchive and other formats via 7z (RAR extraction prefers unar when available).
     *
     * @param string $folder The folder from which archives will be extracted (e.g., "root" or a subfolder).
     * @param array $files An array of archive file names to extract.
     * @return array An associative array with keys "success" (boolean), and either "extractedFiles" (array) on success or "error" (string) on failure.
     */
    public static function extractZipArchive($folder, $files)
    {
        // Block ZIP extraction inside encrypted folders (v1).
        try {
            if (FolderCrypto::isEncryptedOrAncestor((string)$folder)) {
                return ["error" => "ZIP operations are disabled inside encrypted folders."];
            }
        } catch (\Throwable $e) { /* ignore */ }

        $errors = [];
        $warnings = [];
        $allSuccess = true;
        $extractedFiles = [];

        // Config toggles
        $SKIP_DOTFILES = defined('SKIP_DOTFILES_ON_EXTRACT') ? (bool)SKIP_DOTFILES_ON_EXTRACT : true;

        // Hard limits to mitigate zip-bombs (tweak via defines if you like)
        $MAX_UNZIP_BYTES = defined('MAX_UNZIP_BYTES') ? (int)MAX_UNZIP_BYTES : (200 * 1024 * 1024 * 1024); // 200 GiB
        $MAX_UNZIP_FILES = defined('MAX_UNZIP_FILES') ? (int)MAX_UNZIP_FILES : 20000;
        $formatBytes = function (int $bytes): string {
            $bytes = max(0, $bytes);
            $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
            $value = (float)$bytes;
            $i = 0;
            while ($value >= 1024 && $i < count($units) - 1) {
                $value /= 1024;
                $i++;
            }
            $dec = ($value >= 10 || $i === 0) ? 0 : 1;
            return number_format($value, $dec) . ' ' . $units[$i];
        };

        $baseDir = realpath(self::uploadRoot());
        if ($baseDir === false) {
            return ["error" => "Uploads directory not configured correctly."];
        }

        // Build target dir
        if (strtolower(trim($folder) ?: '') === "root") {
            $relativePath = "";
            $folderNorm = "root";
        } else {
            $parts = explode('/', trim($folder, "/\\"));
            foreach ($parts as $part) {
                if ($part === '' || $part === '.' || $part === '..' || !preg_match(REGEX_FOLDER_NAME, $part)) {
                    return ["error" => "Invalid folder name."];
                }
            }
            $relativePath = implode(DIRECTORY_SEPARATOR, $parts) . DIRECTORY_SEPARATOR;
            $folderNorm   = implode('/', $parts); // normalized with forward slashes for metadata helpers
        }

        $folderPath = $baseDir . DIRECTORY_SEPARATOR . $relativePath;
        if (!is_dir($folderPath) && !mkdir($folderPath, 0775, true)) {
            return ["error" => "Folder not found and cannot be created."];
        }
        $folderPathReal = realpath($folderPath);
        if ($folderPathReal === false || strpos($folderPathReal, $baseDir) !== 0) {
            return ["error" => "Folder not found."];
        }

        // Metadata cache per folder to avoid many reads/writes
        $metaCache = [];
        $getMeta = function (string $folderStr) use (&$metaCache) {
            if (!isset($metaCache[$folderStr])) {
                $mf = self::getMetadataFilePath($folderStr);
                $metaCache[$folderStr] = file_exists($mf) ? (json_decode(file_get_contents($mf), true) ?: []) : [];
            }
            return $metaCache[$folderStr];
        };
        $putMeta = function (string $folderStr, array $meta) use (&$metaCache) {
            $metaCache[$folderStr] = $meta;
        };

        $safeFileNamePattern = REGEX_FILE_NAME;
        $actor = $_SESSION['username'] ?? 'Unknown';
        $now   = date(DATE_TIME_FORMAT);

        // --- Helpers ---

        // Reject absolute paths, traversal, drive letters
        $isUnsafeEntryPath = function (string $entry): bool {
            $e = str_replace('\\', '/', $entry);
            if ($e === '' || str_contains($e, "\0")) return true;
            if (str_starts_with($e, '/')) return true;                 // absolute nix path
            if (preg_match('/^[A-Za-z]:[\\/]/', $e)) return true;      // Windows drive
            if (str_contains($e, '../') || str_contains($e, '..\\')) return true;
            return false;
        };

        // Validate each subfolder name in the path using REGEX_FOLDER_NAME
        $validEntrySubdirs = function (string $entry): bool {
            $e = trim(str_replace('\\', '/', $entry), '/');
            if ($e === '') return true;
            $dirs = explode('/', $e);
            array_pop($dirs); // remove basename; we only validate directories here
            foreach ($dirs as $d) {
                if ($d === '' || !preg_match(REGEX_FOLDER_NAME, $d)) return false;
            }
            return true;
        };

        // NEW: hidden path detector — true if ANY segment starts with '.'
        $isHiddenDotPath = function (string $entry): bool {
            $e = trim(str_replace('\\', '/', $entry), '/');
            if ($e === '') return false;
            foreach (explode('/', $e) as $seg) {
                if ($seg !== '' && $seg[0] === '.') return true;
            }
            return false;
        };

        // Generalized metadata stamper: writes to the specified folder's metadata.json
        $stampMeta = function (string $folderStr, string $basename) use (&$getMeta, &$putMeta, $actor, $now) {
            $meta = $getMeta($folderStr);
            $meta[$basename] = [
                'uploaded' => $now,
                'modified' => $now,
                'uploader' => $actor,
            ];
            $putMeta($folderStr, $meta);
        };

        $isRarArchiveName = function (string $name): bool {
            $lower = strtolower($name);
            if (str_ends_with($lower, '.rar')) return true;
            if (preg_match('/\\.r\\d{2}$/i', $lower)) return true;
            if (preg_match('/\\.part\\d+\\.rar$/i', $lower)) return true;
            return false;
        };

        $archiveExts = [
            '.rar',
            '.7z',
            '.tar',
            '.tar.gz',
            '.tgz',
            '.tar.bz2',
            '.tbz2',
            '.tar.xz',
            '.txz',
            '.gz',
            '.bz2',
            '.xz',
        ];
        $resolveArchive = function (string $name) use ($archiveExts): array {
            $lower = strtolower($name);
            if (str_ends_with($lower, '.zip')) {
                return ['name' => $name, 'type' => 'zip', 'mapped' => null];
            }
            if (preg_match('/\\.r\\d{2}$/i', $name)) {
                $base = substr($name, 0, -4) . '.rar';
                return ['name' => $base, 'type' => '7z', 'mapped' => $name];
            }
            if (preg_match('/\\.part(\\d+)\\.rar$/i', $name, $m)) {
                $pad = str_pad('1', strlen($m[1]), '0', STR_PAD_LEFT);
                $base = preg_replace('/\\.part\\d+\\.rar$/i', '.part' . $pad . '.rar', $name);
                $mapped = (strcasecmp($name, $base) === 0) ? null : $name;
                return ['name' => $base, 'type' => '7z', 'mapped' => $mapped];
            }
            foreach ($archiveExts as $ext) {
                if (str_ends_with($lower, $ext)) {
                    return ['name' => $name, 'type' => '7z', 'mapped' => null];
                }
            }
            return ['name' => '', 'type' => null, 'mapped' => null];
        };

        $sevenZipBin = null;
        $findSevenZip = function () use (&$sevenZipBin): ?string {
            if ($sevenZipBin !== null) {
                return $sevenZipBin ?: null;
            }
            $candidates = [
                '7zz',
                '/usr/bin/7zz',
                '/usr/local/bin/7zz',
                '/bin/7zz',
                '7z',
                '/usr/bin/7z',
                '/usr/local/bin/7z',
                '/bin/7z',
            ];
            foreach ($candidates as $bin) {
                if ($bin === '') continue;
                if (str_contains($bin, '/')) {
                    if (is_file($bin) && is_executable($bin)) {
                        $sevenZipBin = $bin;
                        return $sevenZipBin;
                    }
                } else {
                    $out = [];
                    $rc = 1;
                    @exec('command -v ' . escapeshellarg($bin) . ' 2>/dev/null', $out, $rc);
                    if ($rc === 0 && !empty($out[0])) {
                        $sevenZipBin = trim($out[0]);
                        return $sevenZipBin;
                    }
                }
            }
            $sevenZipBin = '';
            return null;
        };

        $unarBin = null;
        $findUnar = function () use (&$unarBin): ?string {
            if ($unarBin !== null) {
                return $unarBin ?: null;
            }
            $candidates = [
                'unar',
                '/usr/bin/unar',
                '/usr/local/bin/unar',
                '/bin/unar',
            ];
            foreach ($candidates as $bin) {
                if ($bin === '') continue;
                if (str_contains($bin, '/')) {
                    if (is_file($bin) && is_executable($bin)) {
                        $unarBin = $bin;
                        return $unarBin;
                    }
                } else {
                    $out = [];
                    $rc = 1;
                    @exec('command -v ' . escapeshellarg($bin) . ' 2>/dev/null', $out, $rc);
                    if ($rc === 0 && !empty($out[0])) {
                        $unarBin = trim($out[0]);
                        return $unarBin;
                    }
                }
            }
            $unarBin = '';
            return null;
        };

        $sevenZipErrorDetail = function (array $lines): string {
            $fallback = '';
            for ($i = count($lines) - 1; $i >= 0; $i--) {
                $line = trim((string)$lines[$i]);
                if ($line === '') {
                    continue;
                }
                $lower = strtolower($line);
                $isSubItems = str_contains($lower, 'sub items errors');
                if (!$isSubItems && $fallback === '') {
                    $fallback = $line;
                }
                if ($isSubItems) {
                    continue;
                }
                if (
                    str_contains($lower, 'error')
                    || str_contains($lower, 'warning')
                    || str_contains($lower, 'unsupported')
                    || str_contains($lower, 'data error')
                    || str_contains($lower, 'crc')
                    || str_contains($lower, 'cannot')
                    || str_contains($lower, "can't")
                ) {
                    if (strlen($line) > 200) {
                        $line = substr($line, 0, 200) . '...';
                    }
                    return $line;
                }
                if (!$isSubItems) {
                    $fallback = $line;
                }
            }
            if ($fallback !== '') {
                if (strlen($fallback) > 200) {
                    $fallback = substr($fallback, 0, 200) . '...';
                }
                return $fallback;
            }
            return '';
        };

        $unarErrorDetail = function (array $lines): string {
            $fallback = '';
            for ($i = count($lines) - 1; $i >= 0; $i--) {
                $line = trim((string)$lines[$i]);
                if ($line === '') {
                    continue;
                }
                $lower = strtolower($line);
                if (
                    str_contains($lower, 'error')
                    || str_contains($lower, 'warning')
                    || str_contains($lower, 'unsupported')
                    || str_contains($lower, 'cannot')
                    || str_contains($lower, "can't")
                ) {
                    if (strlen($line) > 200) {
                        $line = substr($line, 0, 200) . '...';
                    }
                    return $line;
                }
                if ($fallback === '') {
                    $fallback = $line;
                }
            }
            if ($fallback !== '') {
                if (strlen($fallback) > 200) {
                    $fallback = substr($fallback, 0, 200) . '...';
                }
                return $fallback;
            }
            return '';
        };

        $stampExtractedFiles = function (array $allowedFiles) use ($folderPathReal, $folderNorm, $safeFileNamePattern, $stampMeta, &$extractedFiles): int {
            $found = 0;
            foreach ($allowedFiles as $entryName) {
                // Normalize entry path for filesystem checks
                $entryFsRel = str_replace(['\\'], '/', $entryName);
                $entryFsRel = ltrim($entryFsRel, '/'); // ensure relative

                // Skip any directories (shouldn't be listed here, but defend anyway)
                if ($entryFsRel === '' || str_ends_with($entryFsRel, '/')) continue;

                $basename = basename($entryFsRel);
                if ($basename === '' || !preg_match($safeFileNamePattern, $basename)) continue;

                // Decide which folder's metadata to update:
                // - top-level files -> $folderNorm
                // - nested files    -> corresponding "<folderNorm>/<sub/dir>" (or "sub/dir" if folderNorm is 'root')
                $relDir = str_replace('\\', '/', trim(dirname($entryFsRel), '.'));
                $relDir = ($relDir === '.' ? '' : trim($relDir, '/'));

                $targetFolderNorm = ($relDir === '' || $relDir === '.')
                    ? $folderNorm
                    : (($folderNorm === 'root') ? $relDir : ($folderNorm . '/' . $relDir));

                // Only stamp if the file actually exists on disk after extraction
                $targetAbs = $folderPathReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                if (is_file($targetAbs)) {
                    $found++;
                    // Preserve list behavior: only include top-level extracted names
                    if ($relDir === '' || $relDir === '.') {
                        $extractedFiles[] = $basename;
                    }
                    $stampMeta($targetFolderNorm, $basename);
                }
            }
            return $found;
        };

        $pruneExtractedFiles = function (array $allowedFiles, array $expectedSizes, string $archiveBase, bool $strictEmpty = false, bool $pruneEmpty = true) use ($folderPathReal, &$warnings): array {
            $kept = [];
            $emptyCount = 0;
            $escapedCount = 0;
            $rootPrefix = rtrim($folderPathReal, '/\\') . DIRECTORY_SEPARATOR;

            foreach ($allowedFiles as $entryName) {
                $entryFsRel = str_replace(['\\'], '/', $entryName);
                $entryFsRel = ltrim($entryFsRel, '/');
                if ($entryFsRel === '' || str_ends_with($entryFsRel, '/')) {
                    continue;
                }
                $targetAbs = $folderPathReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                if (!is_file($targetAbs)) {
                    continue;
                }
                $real = realpath($targetAbs);
                if ($real === false || strpos($real, $rootPrefix) !== 0) {
                    @unlink($targetAbs);
                    $escapedCount++;
                    continue;
                }
                if ($pruneEmpty) {
                    $expected = $expectedSizes[$entryName] ?? null;
                    $size = @filesize($targetAbs);
                    if ($size === false) {
                        $size = null;
                    }
                    $shouldPruneEmpty = ($size === 0) && (
                        ($expected !== null && $expected > 0)
                        || ($strictEmpty && $expected === null)
                    );
                    if ($shouldPruneEmpty) {
                        clearstatcache(true, $targetAbs);
                        $sizeCheck = @filesize($targetAbs);
                        if ($sizeCheck === false) {
                            $sizeCheck = 0;
                        }
                        if ($sizeCheck !== 0) {
                            $shouldPruneEmpty = false;
                        } else {
                            $fh = @fopen($targetAbs, 'rb');
                            if ($fh !== false) {
                                $byte = @fread($fh, 1);
                                @fclose($fh);
                                if ($byte !== '' && $byte !== false) {
                                    $shouldPruneEmpty = false;
                                }
                            } else {
                                $shouldPruneEmpty = false;
                            }
                        }
                    }
                    if ($shouldPruneEmpty) {
                        @unlink($targetAbs);
                        $emptyCount++;
                        continue;
                    }
                }
                $kept[] = $entryName;
            }

            if ($escapedCount > 0) {
                $warnings[] = "$archiveBase: removed {$escapedCount} file" . ($escapedCount === 1 ? '' : 's') . " that escaped the extraction root.";
            }
            if ($pruneEmpty && $emptyCount > 0) {
                $warnings[] = "$archiveBase: removed {$emptyCount} empty file" . ($emptyCount === 1 ? '' : 's') . " created during extraction.";
            }
            return $kept;
        };

        $detectSizeMismatches = function (array $expectedSizes) use ($folderPathReal): array {
            $mismatches = [];
            foreach ($expectedSizes as $entryName => $expected) {
                $expected = (int)$expected;
                if ($expected <= 0) {
                    continue;
                }
                $entryFsRel = str_replace(['\\'], '/', (string)$entryName);
                $entryFsRel = ltrim($entryFsRel, '/');
                if ($entryFsRel === '' || str_ends_with($entryFsRel, '/')) {
                    continue;
                }
                $targetAbs = $folderPathReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                clearstatcache(true, $targetAbs);
                $size = @filesize($targetAbs);
                if ($size === false || (int)$size !== $expected) {
                    $mismatches[] = $entryName;
                }
            }
            return $mismatches;
        };

        $moveExtractedFile = function (string $src, string $dest): bool {
            if (@rename($src, $dest)) {
                return true;
            }
            if (@copy($src, $dest)) {
                @unlink($src);
                return true;
            }
            return false;
        };

        $removeTree = function (string $dir): void {
            if (!is_dir($dir)) {
                return;
            }
            $it = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($it as $item) {
                $path = $item->getPathname();
                if ($item->isDir()) {
                    @rmdir($path);
                } else {
                    @unlink($path);
                }
            }
            @rmdir($dir);
        };

        $processedArchives = [];

        // No PHP execution time limit during heavy work
        @set_time_limit(0);

        foreach ($files as $archiveName) {
            $rawBase = basename(trim((string)$archiveName));
            if ($rawBase === '') {
                continue;
            }
            if (!preg_match($safeFileNamePattern, $rawBase)) {
                $errors[] = "$rawBase has an invalid name.";
                $allSuccess = false;
                continue;
            }
            $resolved = $resolveArchive($rawBase);
            if (empty($resolved['type'])) {
                continue;
            }

            $archiveBase = $resolved['name'];
            $archiveType = $resolved['type'];
            $mappedFrom = $resolved['mapped'];

            if (
                $archiveType === '7z'
                && !preg_match('/\\.part\\d+\\.rar$/i', $archiveBase)
                && preg_match('/^(.*?)([-_.])(\\d+)\\.rar$/i', $archiveBase, $m)
            ) {
                $num = (int)$m[3];
                if ($num > 1) {
                    $pad = str_pad('1', strlen($m[3]), '0', STR_PAD_LEFT);
                    $candidate = $m[1] . $m[2] . $pad . '.rar';
                    $candidatePath = $folderPathReal . DIRECTORY_SEPARATOR . $candidate;
                    if (file_exists($candidatePath)) {
                        $mappedFrom = $mappedFrom ?: $archiveBase;
                        $archiveBase = $candidate;
                    }
                }
            }

            if (!preg_match($safeFileNamePattern, $archiveBase)) {
                $errors[] = "$archiveBase has an invalid name.";
                $allSuccess = false;
                continue;
            }

            $isRarArchive = str_ends_with(strtolower($archiveBase), '.rar');

            if (isset($processedArchives[$archiveBase])) {
                continue;
            }
            $processedArchives[$archiveBase] = true;

            $archivePath = $folderPathReal . DIRECTORY_SEPARATOR . $archiveBase;
            if (!file_exists($archivePath)) {
                if ($mappedFrom) {
                    $fallbackPath = $folderPathReal . DIRECTORY_SEPARATOR . $mappedFrom;
                    if (file_exists($fallbackPath)) {
                        $archiveBase = $mappedFrom;
                        $archivePath = $fallbackPath;
                        $mappedFrom = null;
                    } else {
                        $errors[] = "$mappedFrom is part of a multi-part archive, but $archiveBase is missing.";
                        $allSuccess = false;
                        continue;
                    }
                } else {
                    $errors[] = "$archiveBase does not exist in folder.";
                    $allSuccess = false;
                    continue;
                }
            }

            if ($archiveType === 'zip') {
                $zip = new \ZipArchive();
                if ($zip->open($archivePath) !== true) {
                    $errors[] = "Could not open $archiveBase as a zip file.";
                    $allSuccess = false;
                    continue;
                }

                // ---- Pre-scan: safety and size limits + build allow-list (skip dotfiles) ----
                $unsafe = false;
                $unsafeReason = '';
                $skippedSymlinks = 0;
                $totalUncompressed = 0;
                $fileCount = 0;
                $allowedEntries = [];   // names to extract (files and/or directories)
                $allowedFiles   = [];   // only files (for metadata stamping)
                $expectedSizes = [];

                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $stat = $zip->statIndex($i);
                    $name = $zip->getNameIndex($i);
                    if ($name === false || !$stat) {
                        $unsafe = true;
                        $unsafeReason = 'Archive entry metadata is unreadable.';
                        break;
                    }

                    $isDir = str_ends_with($name, '/');

                    // Basic path checks
                    if ($isUnsafeEntryPath($name)) {
                        $unsafe = true;
                        $unsafeReason = 'Archive contains absolute or traversal paths.';
                        break;
                    }
                    if (!$validEntrySubdirs($name)) {
                        $unsafe = true;
                        $unsafeReason = 'Archive contains unsupported folder names.';
                        break;
                    }

                    // Skip hidden entries (any segment starts with '.')
                    if ($SKIP_DOTFILES && $isHiddenDotPath($name)) {
                        continue; // just ignore; do not treat as unsafe
                    }

                    // Detect symlinks via external attributes (best-effort)
                    $mode = (isset($stat['external_attributes']) ? (($stat['external_attributes'] >> 16) & 0xF000) : 0);
                    if ($mode === 0120000) { // S_IFLNK
                        $skippedSymlinks++;
                        continue;
                    }

                    // Track limits only for files we're going to extract
                    if (!$isDir) {
                        $fileCount++;
                        $sz = isset($stat['size']) ? (int)$stat['size'] : 0;
                        $totalUncompressed += $sz;
                        if ($fileCount > $MAX_UNZIP_FILES) {
                            $unsafe = true;
                            $unsafeReason = "Archive exceeds file limit ({$fileCount} > {$MAX_UNZIP_FILES}).";
                            break;
                        }
                        if ($totalUncompressed > $MAX_UNZIP_BYTES) {
                            $unsafe = true;
                            $unsafeReason = "Archive exceeds size limit (" . $formatBytes($totalUncompressed) . " > " . $formatBytes($MAX_UNZIP_BYTES) . ").";
                            break;
                        }
                        $allowedFiles[] = $name;
                        $expectedSizes[$name] = $sz;
                    }

                    $allowedEntries[] = $name;
                }

                if ($unsafe) {
                    $zip->close();
                    $reason = $unsafeReason !== '' ? $unsafeReason : 'Archive contains unsafe or oversized contents.';
                    $errors[] = "$archiveBase blocked: {$reason}";
                    $allSuccess = false;
                    continue;
                }

                // Nothing to extract after filtering?
                if (empty($allowedEntries)) {
                    $zip->close();
                    // Treat as success (nothing visible to extract), but informatively note it
                    if ($skippedSymlinks > 0) {
                        $errors[] = "$archiveBase contained only symlink entries.";
                    } else {
                        $errors[] = "$archiveBase contained only hidden or unsupported entries.";
                    }
                    $allSuccess = false; // or keep true if you'd rather not mark as failure
                    continue;
                }

                // ---- Extract ONLY the allowed entries ----
                if (!$zip->extractTo($folderPathReal, $allowedEntries)) {
                    $errors[] = "Failed to extract $archiveBase.";
                    $allSuccess = false;
                    $zip->close();
                    continue;
                }

                $keptFiles = $pruneExtractedFiles($allowedFiles, $expectedSizes, $archiveBase);
                $extractedCount = $stampExtractedFiles($keptFiles);
                $zip->close();
                if ($extractedCount === 0) {
                    $errors[] = "Failed to extract $archiveBase: no valid files could be extracted.";
                    $allSuccess = false;
                    continue;
                }
                if ($skippedSymlinks > 0) {
                    $warnings[] = "$archiveBase: skipped {$skippedSymlinks} symlink entr" . ($skippedSymlinks === 1 ? 'y' : 'ies') . ".";
                }
                continue;
            }

            $sevenZip = $findSevenZip();
            if (!$sevenZip) {
                $errors[] = "7z is not available on the server; cannot extract $archiveBase.";
                $allSuccess = false;
                continue;
            }

            // ---- 7z list: safety and size limits + build allow-list (skip dotfiles) ----
            $listCmd = escapeshellarg($sevenZip) . ' l -slt -bd ' . escapeshellarg($archivePath);
            $listOut = [];
            $listCode = 1;
            @exec($listCmd, $listOut, $listCode);
            if ($listCode !== 0) {
                $detail = $sevenZipErrorDetail($listOut);
                $errors[] = $detail !== ''
                    ? "Could not open $archiveBase as an archive: $detail."
                    : "Could not open $archiveBase as an archive.";
                $allSuccess = false;
                continue;
            }

            $unsafe = false;
            $unsafeReason = '';
            $skippedSymlinks = 0;
            $totalUncompressed = 0;
            $fileCount = 0;
            $allowedEntries = [];
            $allowedFiles = [];
            $expectedSizes = [];
            $curPath = null;
            $curIsDir = false;
            $curSize = 0;
            $curIsLink = false;
            $curType = '';
            $inFileList = false;
            $seenHeaderPath = false;

            $flushEntry = function () use (
                &$curPath,
                &$curIsDir,
                &$curSize,
                &$curIsLink,
                &$allowedEntries,
                &$allowedFiles,
                &$expectedSizes,
                &$curType,
                &$unsafe,
                &$unsafeReason,
                &$skippedSymlinks,
                &$totalUncompressed,
                &$fileCount,
                $isUnsafeEntryPath,
                $validEntrySubdirs,
                $isHiddenDotPath,
                $SKIP_DOTFILES,
                $MAX_UNZIP_BYTES,
                $MAX_UNZIP_FILES,
                $formatBytes
            ) {
                if ($curPath === null) return;
                $name = $curPath;
                $isDir = $curIsDir;
                $size = $curSize;
                $type = strtolower(trim((string)$curType));
                $isLink = $type !== '' ? str_contains($type, 'link') : $curIsLink;

                $curPath = null;
                $curIsDir = false;
                $curSize = 0;
                $curIsLink = false;
                $curType = '';

                $name = str_replace('\\', '/', $name);
                if ($name === '' || preg_match('/[\\r\\n]/', $name)) {
                    $unsafe = true;
                    if ($unsafeReason === '') $unsafeReason = 'Archive contains invalid entry names.';
                    return;
                }
                if ($isUnsafeEntryPath($name)) {
                    $unsafe = true;
                    if ($unsafeReason === '') $unsafeReason = 'Archive contains absolute or traversal paths.';
                    return;
                }
                if (!$validEntrySubdirs($name)) {
                    $unsafe = true;
                    if ($unsafeReason === '') $unsafeReason = 'Archive contains unsupported folder names.';
                    return;
                }
                if ($SKIP_DOTFILES && $isHiddenDotPath($name)) {
                    return; // ignore hidden entries
                }
                if ($isLink) {
                    $skippedSymlinks++;
                    return;
                }

                $allowedEntries[] = $name;
                if (!$isDir) {
                    $fileCount++;
                    $totalUncompressed += $size;
                    if ($fileCount > $MAX_UNZIP_FILES) {
                        $unsafe = true;
                        if ($unsafeReason === '') $unsafeReason = "Archive exceeds file limit ({$fileCount} > {$MAX_UNZIP_FILES}).";
                        return;
                    }
                    if ($totalUncompressed > $MAX_UNZIP_BYTES) {
                        $unsafe = true;
                        if ($unsafeReason === '') $unsafeReason = "Archive exceeds size limit (" . $formatBytes($totalUncompressed) . " > " . $formatBytes($MAX_UNZIP_BYTES) . ").";
                        return;
                    }
                    $allowedFiles[] = $name;
                    $expectedSizes[$name] = $size;
                }
            };

            foreach ($listOut as $line) {
                $line = rtrim((string)$line, "\r");
                if (strpos($line, '----------') === 0) {
                    $inFileList = true;
                    $curPath = null;
                    $curIsDir = false;
                    $curSize = 0;
                    $curIsLink = false;
                    continue;
                }
                if (!$inFileList && strpos($line, 'Path = ') === 0) {
                    if (!$seenHeaderPath) {
                        $seenHeaderPath = true;
                        continue;
                    }
                    $inFileList = true;
                }
                if (!$inFileList) {
                    continue;
                }
                if (strpos($line, 'Path = ') === 0) {
                    $flushEntry();
                    $curPath = substr($line, 7);
                    continue;
                }
                if (strpos($line, 'Folder = ') === 0) {
                    $curIsDir = (trim(substr($line, 9)) === '+');
                    continue;
                }
                if (strpos($line, 'Type = ') === 0) {
                    $curType = trim(substr($line, 7));
                    continue;
                }
                if (strpos($line, 'Size = ') === 0) {
                    $curSize = (int)trim(substr($line, 7));
                    continue;
                }
                if (strpos($line, 'Attributes = ') === 0) {
                    $attr = strtolower(trim(substr($line, 13)));
                    if ($attr !== '' && $attr[0] === 'l') {
                        $curIsLink = true;
                    }
                    continue;
                }
                if (strpos($line, 'Link = ') === 0) {
                    $linkTarget = trim(substr($line, 7));
                    $linkTargetLower = strtolower($linkTarget);
                    if (
                        $linkTarget !== ''
                        && $linkTarget !== '-'
                        && $linkTargetLower !== 'none'
                        && $linkTargetLower !== 'false'
                        && $linkTargetLower !== 'no'
                        && !ctype_digit($linkTargetLower)
                    ) {
                        $curIsLink = true;
                    }
                    continue;
                }
                if (stripos($line, 'Symbolic Link = ') === 0 || stripos($line, 'Symlink = ') === 0) {
                    $pos = strpos($line, '=');
                    $linkTarget = ($pos === false) ? '' : trim(substr($line, $pos + 1));
                    $linkTargetLower = strtolower($linkTarget);
                    if (
                        $linkTarget !== ''
                        && $linkTarget !== '-'
                        && $linkTargetLower !== 'none'
                        && $linkTargetLower !== 'false'
                        && $linkTargetLower !== 'no'
                        && !ctype_digit($linkTargetLower)
                    ) {
                        $curIsLink = true;
                    }
                    continue;
                }
            }
            $flushEntry();

            if ($unsafe) {
                $reason = $unsafeReason !== '' ? $unsafeReason : 'Archive contains unsafe or oversized contents.';
                $errors[] = "$archiveBase blocked: {$reason}";
                $allSuccess = false;
                continue;
            }

            if (empty($allowedEntries)) {
                if ($skippedSymlinks > 0) {
                    $errors[] = "$archiveBase contained only symlink entries.";
                } else {
                    $errors[] = "$archiveBase contained only hidden or unsupported entries.";
                }
                $allSuccess = false;
                continue;
            }

            $workDir = rtrim(self::metaRoot(), '/\\') . DIRECTORY_SEPARATOR . 'ziptmp';
            if (!is_dir($workDir)) {
                @mkdir($workDir, 0775, true);
            }
            if (!is_dir($workDir) || !is_writable($workDir)) {
                $errors[] = "Archive temp dir not writable: " . $workDir;
                $allSuccess = false;
                continue;
            }

            $unar = $isRarArchive ? $findUnar() : null;
            $usedUnar = false;
            $extractCode = 0;
            $extractDetail = '';

            if ($unar) {
                $usedUnar = true;
                $tmpBase = tempnam($workDir, 'unar-');
                if ($tmpBase === false) {
                    $errors[] = "Failed to prepare RAR extract workspace for $archiveBase.";
                    $allSuccess = false;
                    continue;
                }
                @unlink($tmpBase);
                if (!@mkdir($tmpBase, 0775, true)) {
                    $errors[] = "Failed to create RAR extract workspace for $archiveBase.";
                    $allSuccess = false;
                    continue;
                }

                $unarOut = [];
                $unarCode = 1;
                $unarCmd = escapeshellarg($unar) . ' -o ' . escapeshellarg($tmpBase) . ' ' . escapeshellarg($archivePath);
                @exec($unarCmd, $unarOut, $unarCode);
                if ($unarCode !== 0) {
                    $detail = $unarErrorDetail($unarOut);
                    $errors[] = $detail !== ''
                        ? "Failed to extract $archiveBase: $detail"
                        : "Failed to extract $archiveBase.";
                    $allSuccess = false;
                    $removeTree($tmpBase);
                    continue;
                }

                $extractRoot = $tmpBase;
                $entries = array_values(array_diff(@scandir($tmpBase) ?: [], ['.', '..']));
                if (count($entries) === 1) {
                    $single = $tmpBase . DIRECTORY_SEPARATOR . $entries[0];
                    if (is_dir($single)) {
                        $extractRoot = $single;
                    }
                }

                $moveFailed = false;
                foreach ($allowedFiles as $entryName) {
                    $entryFsRel = str_replace(['\\'], '/', $entryName);
                    $entryFsRel = ltrim($entryFsRel, '/');
                    if ($entryFsRel === '' || str_ends_with($entryFsRel, '/')) {
                        continue;
                    }
                    $srcPath = $extractRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                    if (!is_file($srcPath)) {
                        continue;
                    }
                    $destPath = $folderPathReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                    $destDir = dirname($destPath);
                    if (!is_dir($destDir) && !@mkdir($destDir, 0775, true)) {
                        $errors[] = "Failed to create folder for extracted file $entryFsRel.";
                        $moveFailed = true;
                        continue;
                    }
                    if (!$moveExtractedFile($srcPath, $destPath)) {
                        $errors[] = "Failed to place extracted file $entryFsRel.";
                        $moveFailed = true;
                    }
                }

                $removeTree($tmpBase);
                if ($moveFailed) {
                    $allSuccess = false;
                    continue;
                }

                $sizeMismatches = $detectSizeMismatches($expectedSizes);
                if (!empty($sizeMismatches)) {
                    $count = count($sizeMismatches);
                    $errors[] = "Failed to extract $archiveBase: {$count} file" . ($count === 1 ? '' : 's') . " extracted with incorrect sizes.";
                    $allSuccess = false;
                    continue;
                }
            } else {
                $listFile = tempnam($workDir, '7zlist-');
                if ($listFile === false) {
                    $errors[] = "Failed to prepare archive extract list for $archiveBase.";
                    $allSuccess = false;
                    continue;
                }
                $extractEntries = $allowedFiles ?: $allowedEntries;
                if (file_put_contents($listFile, implode("\n", $extractEntries) . "\n", LOCK_EX) === false) {
                    @unlink($listFile);
                    $errors[] = "Failed to write archive extract list for $archiveBase.";
                    $allSuccess = false;
                    continue;
                }

                $outDirArg = '-o' . $folderPathReal;
                $extractCmd = escapeshellarg($sevenZip) . ' x -y -aoa -bd ' . escapeshellarg($outDirArg) . ' ' . escapeshellarg($archivePath) . ' ' . escapeshellarg('-i@' . $listFile);
                $extractOut = [];
                $extractCode = 1;
                @exec($extractCmd, $extractOut, $extractCode);
                @unlink($listFile);

                if ($extractCode !== 0) {
                    $detail = $sevenZipErrorDetail($extractOut);
                    $extractDetail = $detail !== '' ? $detail : 'Archive extracted with warnings.';
                }

                if ($isRarArchive) {
                    $sizeMismatches = $detectSizeMismatches($expectedSizes);
                    if (!empty($sizeMismatches)) {
                        $count = count($sizeMismatches);
                        $errors[] = "Failed to extract $archiveBase: {$count} file" . ($count === 1 ? '' : 's') . " extracted with incorrect sizes. Install unar for RAR archives.";
                        $allSuccess = false;
                        continue;
                    }
                }
            }

            $hasLinks = 0;
            foreach ($allowedEntries as $entryName) {
                $entryFsRel = str_replace(['\\'], '/', $entryName);
                $entryFsRel = ltrim($entryFsRel, '/');
                if ($entryFsRel === '') continue;
                $entryFsRel = rtrim($entryFsRel, '/');
                if ($entryFsRel === '') continue;
                $targetAbs = $folderPathReal . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryFsRel);
                if (is_link($targetAbs)) {
                    $hasLinks++;
                    @unlink($targetAbs);
                    if (is_link($targetAbs)) {
                        @rmdir($targetAbs);
                    }
                }
            }
            if ($hasLinks > 0) {
                $warnings[] = "$archiveBase: removed {$hasLinks} symlink entr" . ($hasLinks === 1 ? 'y' : 'ies') . ".";
            }

            $keptFiles = $pruneExtractedFiles($allowedFiles, $expectedSizes, $archiveBase, $extractCode !== 0, false);
            $extractedCount = $stampExtractedFiles($keptFiles);
            if ($extractedCount === 0) {
                $reason = $extractDetail !== '' ? $extractDetail : 'no valid files could be extracted.';
                $errors[] = "Failed to extract $archiveBase: $reason";
                $allSuccess = false;
                continue;
            }
            if ($skippedSymlinks > 0) {
                $warnings[] = "$archiveBase: skipped {$skippedSymlinks} symlink entr" . ($skippedSymlinks === 1 ? 'y' : 'ies') . ".";
            }
            if (!$usedUnar && $extractDetail !== '') {
                $warnings[] = "$archiveBase: " . $extractDetail;
            }
        }

        // Persist metadata for any touched folder(s)
        foreach ($metaCache as $folderStr => $meta) {
            $metadataFile = self::getMetadataFilePath($folderStr);
            if (!is_dir(dirname($metadataFile))) {
                @mkdir(dirname($metadataFile), 0775, true);
            }
            if (file_put_contents($metadataFile, json_encode($meta, JSON_PRETTY_PRINT), LOCK_EX) === false) {
                $errors[] = "Failed to update metadata for {$folderStr}.";
                $allSuccess = false;
            }
        }

        $response = $allSuccess
            ? ["success" => true, "extractedFiles" => $extractedFiles]
            : ["success" => false, "error" => implode(" ", $errors)];
        if (!$allSuccess && $extractedFiles) {
            $response['extractedFiles'] = $extractedFiles;
        }
        if ($warnings) {
            $response['warning'] = implode(" ", $warnings);
        }
        return $response;
    }

    /**
     * Retrieves the share record for a given token.
     *
     * @param string $token The share token.
     * @return array|null Returns the share record as an associative array, or null if not found.
     */
    public static function getShareRecord($token)
    {
        $token = (string)$token;
        $readRecord = function (string $path, string $token): ?array {
            if (!is_file($path)) {
                return null;
            }
            $shareLinks = json_decode((string)@file_get_contents($path), true);
            if (!is_array($shareLinks) || !isset($shareLinks[$token])) {
                return null;
            }
            return $shareLinks[$token];
        };

        $currentId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';
        $shareFile = self::metaRoot() . "share_links.json";
        $record = $readRecord($shareFile, $token);
        if ($record) {
            return $record;
        }

        if (!class_exists('SourceContext') || !SourceContext::sourcesEnabled()) {
            return null;
        }

        $sources = SourceContext::listAllSources();
        foreach ($sources as $src) {
            if (isset($src['enabled']) && !$src['enabled']) {
                continue;
            }
            $id = (string)($src['id'] ?? '');
            if ($id === '' || $id === $currentId) {
                continue;
            }
            $path = SourceContext::metaRootForId($id) . "share_links.json";
            $record = $readRecord($path, $token);
            if ($record) {
                SourceContext::setActiveId($id, false);
                return $record;
            }
        }

        return null;
    }

    /**
     * Creates a share link for a file.
     *
     * @param string $folder The folder containing the shared file (or "root").
     * @param string $file The name of the file being shared.
     * @param int $expirationSeconds The number of seconds until expiration.
     * @param string $password Optional password protecting the share.
     * @return array Returns an associative array with keys "token" and "expires" on success,
     *               or "error" on failure.
     */
    public static function createShareLink($folder, $file, $expirationSeconds = 3600, $password = "")
    {
        try {
            if (FolderCrypto::isEncryptedOrAncestor((string)$folder)) {
                return ["error" => "Sharing is disabled inside encrypted folders."];
            }
        } catch (\Throwable $e) { /* ignore */ }

        // Validate folder if necessary (this can also be done in the controller).
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }
        // Validate file name.
        $file = basename(trim($file));
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            return ["error" => "Invalid file name."];
        }

        // Generate a secure token (32 hex characters).
        $token = bin2hex(random_bytes(16));

        // Calculate expiration (Unix timestamp).
        $expires = time() + $expirationSeconds;

        // Hash the password if provided.
        $hashedPassword = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : "";

        // File to store share links.
        $shareFile = self::metaRoot() . "share_links.json";
        $shareLinks = [];
        if (file_exists($shareFile)) {
            $data = file_get_contents($shareFile);
            $shareLinks = json_decode($data, true);
            if (!is_array($shareLinks)) {
                $shareLinks = [];
            }
        }

        // Clean up expired share links.
        $currentTime = time();
        foreach ($shareLinks as $key => $link) {
            if ($link["expires"] < $currentTime) {
                unset($shareLinks[$key]);
            }
        }

        // Add new share record.
        $shareLinks[$token] = [
            "folder"   => $folder,
            "file"     => $file,
            "expires"  => $expires,
            "password" => $hashedPassword
        ];

        // Save the updated share links.
        if (file_put_contents($shareFile, json_encode($shareLinks, JSON_PRETTY_PRINT), LOCK_EX)) {
            return ["token" => $token, "expires" => $expires];
        } else {
            return ["error" => "Could not save share link."];
        }
    }

    /**
     * Retrieves and enriches trash records from the trash metadata file.
     *
     * @return array An array of trash items.
     */
    public static function getTrashItems()
    {
        $storage = self::storage();
        $trashDir = rtrim(self::trashRoot(), '/\\') . DIRECTORY_SEPARATOR;
        $trashMetadataFile = $trashDir . "trash.json";
        $trashItems = [];
        $trashJson = $storage->read($trashMetadataFile);
        if ($trashJson !== false) {
            $trashItems = json_decode($trashJson, true);
        }
        if (!is_array($trashItems)) {
            $trashItems = [];
        }

        // Enrich each trash record.
        foreach ($trashItems as &$item) {
            if (empty($item['deletedBy'])) {
                $item['deletedBy'] = "Unknown";
            }
            if (empty($item['uploaded']) || empty($item['uploader'])) {
                if (isset($item['originalFolder']) && isset($item['originalName'])) {
                    $metadataFile = self::getMetadataFilePath($item['originalFolder']);
                    if (file_exists($metadataFile)) {
                        $metadata = json_decode(file_get_contents($metadataFile), true);
                        if (is_array($metadata) && isset($metadata[$item['originalName']])) {
                            $item['uploaded'] = !empty($metadata[$item['originalName']]['uploaded']) ? $metadata[$item['originalName']]['uploaded'] : "Unknown";
                            $item['uploader'] = !empty($metadata[$item['originalName']]['uploader']) ? $metadata[$item['originalName']]['uploader'] : "Unknown";
                        } else {
                            $item['uploaded'] = "Unknown";
                            $item['uploader'] = "Unknown";
                        }
                    } else {
                        $item['uploaded'] = "Unknown";
                        $item['uploader'] = "Unknown";
                    }
                } else {
                    $item['uploaded'] = "Unknown";
                    $item['uploader'] = "Unknown";
                }
            }
        }
        unset($item);
        return $trashItems;
    }

    /**
     * Restores files from Trash based on an array of trash file identifiers.
     *
     * @param array $trashFiles An array of trash file names (i.e. the 'trashName' fields).
     * @return array An associative array with keys "restored" (an array of successfully restored items)
     *               and optionally an "error" message if any issues occurred.
     */
    public static function restoreFiles(array $trashFiles)
    {
        $errors = [];
        $restoredItems = [];
        $storage = self::storage();

        // Setup Trash directory and trash metadata file.
        $trashDir = rtrim(self::trashRoot(), '/\\') . DIRECTORY_SEPARATOR;
        if ($storage->stat($trashDir) === null) {
            $storage->mkdir($trashDir, 0755, true);
        }
        $trashMetadataFile = $trashDir . "trash.json";
        $trashData = [];
        $trashJson = $storage->read($trashMetadataFile);
        if ($trashJson !== false) {
            $trashData = json_decode($trashJson, true);
        }
        if (!is_array($trashData)) {
            $trashData = [];
        }

        // Helper to get metadata file path for a folder.
        $getMetadataFilePath = function ($folder) {
            if (strtolower($folder) === 'root' || trim($folder) === '') {
                return self::metaRoot() . "root_metadata.json";
            }
            return self::metaRoot() . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
        };

        // Process each provided trash file name.
        foreach ($trashFiles as $trashFileName) {
            $trashFileName = trim($trashFileName);
            // Validate file name with REGEX_FILE_NAME.
            if (!preg_match(REGEX_FILE_NAME, $trashFileName)) {
                $errors[] = "$trashFileName has an invalid format.";
                continue;
            }

            // Locate the matching trash record.
            $recordKey = null;
            foreach ($trashData as $key => $record) {
                if (isset($record['trashName']) && $record['trashName'] === $trashFileName) {
                    $recordKey = $key;
                    break;
                }
            }
            if ($recordKey === null) {
                $errors[] = "No trash record found for $trashFileName.";
                continue;
            }

            $record = $trashData[$recordKey];
            if (!isset($record['originalFolder']) || !isset($record['originalName'])) {
                $errors[] = "Incomplete trash record for $trashFileName.";
                continue;
            }
            $originalFolder = $record['originalFolder'];
            $originalName = $record['originalName'];

            // Convert absolute original folder to relative folder.
            $relativeFolder = 'root';
            $root = rtrim(self::uploadRoot(), '/\\') . DIRECTORY_SEPARATOR;
            if (strpos($originalFolder, $root) === 0) {
                $relativeFolder = trim(substr($originalFolder, strlen($root)), '/\\');
                if ($relativeFolder === '') {
                    $relativeFolder = 'root';
                }
            }

            // Build destination path.
            $destinationPath = (strtolower($relativeFolder) !== 'root')
                ? rtrim($root, '/\\') . DIRECTORY_SEPARATOR . $relativeFolder . DIRECTORY_SEPARATOR . $originalName
                : rtrim($root, '/\\') . DIRECTORY_SEPARATOR . $originalName;

            // Handle folder-type records if necessary.
            if (isset($record['type']) && $record['type'] === 'folder') {
                if ($storage->stat($destinationPath) === null) {
                    if ($storage->mkdir($destinationPath, 0755, true)) {
                        $restoredItems[] = $originalName . " (folder restored)";
                    } else {
                        $errors[] = "Failed to restore folder $originalName.";
                        continue;
                    }
                } else {
                    $errors[] = "Folder already exists at destination: $originalName.";
                    continue;
                }
                unset($trashData[$recordKey]);
                continue;
            }

            // For files: Ensure destination directory exists.
            $destinationDir = dirname($destinationPath);
            if ($storage->stat($destinationDir) === null) {
                if (!$storage->mkdir($destinationDir, 0755, true)) {
                    $errors[] = "Failed to create destination folder for $originalName.";
                    continue;
                }
            }

            if ($storage->stat($destinationPath) !== null) {
                $errors[] = "File already exists at destination: $originalName.";
                continue;
            }

            // Move the file from trash to its original location.
            $sourcePath = $trashDir . $trashFileName;
            if ($storage->stat($sourcePath) !== null) {
                if ($storage->move($sourcePath, $destinationPath)) {
                    $restoredItems[] = $originalName;

                    // Update metadata: Restore metadata for this file.
                    $metadataFile = $getMetadataFilePath($relativeFolder);
                    $metadata = [];
                    if (file_exists($metadataFile)) {
                        $metadata = json_decode(file_get_contents($metadataFile), true);
                        if (!is_array($metadata)) {
                            $metadata = [];
                        }
                    }
                    $restoredMeta = [
                        "uploaded" => isset($record['uploaded']) ? $record['uploaded'] : date(DATE_TIME_FORMAT),
                        "uploader" => isset($record['uploader']) ? $record['uploader'] : "Unknown"
                    ];
                    $metadata[$originalName] = $restoredMeta;
                    file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT), LOCK_EX);
                    unset($trashData[$recordKey]);
                } else {
                    $errors[] = "Failed to restore $originalName.";
                }
            } else {
                $errors[] = "Trash file not found: $trashFileName.";
            }
        }

        // Write back updated trash metadata.
        $storage->write($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT), LOCK_EX);

        if (empty($errors)) {
            return ["success" => "Items restored: " . implode(", ", $restoredItems), "restored" => $restoredItems];
        } else {
            return ["success" => false, "error" => implode("; ", $errors), "restored" => $restoredItems];
        }
    }

    /**
     * Deletes trash items based on an array of trash file identifiers.
     *
     * @param array $filesToDelete An array of trash file names (identifiers).
     * @return array An associative array containing "deleted" (array of deleted items) and optionally "error" (error message).
     */
    public static function deleteTrashFiles(array $filesToDelete)
    {
        $storage = self::storage();
        // Setup trash directory and metadata file.
        $trashDir = rtrim(self::trashRoot(), '/\\') . DIRECTORY_SEPARATOR;
        if ($storage->stat($trashDir) === null) {
            $storage->mkdir($trashDir, 0755, true);
        }
        $trashMetadataFile = $trashDir . "trash.json";

        // Load trash metadata into an associative array keyed by trashName.
        $trashData = [];
        $trashJson = $storage->read($trashMetadataFile);
        if ($trashJson !== false) {
            $tempData = json_decode($trashJson, true);
            if (is_array($tempData)) {
                foreach ($tempData as $item) {
                    if (isset($item['trashName'])) {
                        $trashData[$item['trashName']] = $item;
                    }
                }
            }
        }

        $deletedFiles = [];
        $errors = [];

        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;

        // Process each file identifier in the $filesToDelete array.
        foreach ($filesToDelete as $trashName) {
            $trashName = trim($trashName);
            if (!preg_match($safeFileNamePattern, $trashName)) {
                $errors[] = "$trashName has an invalid format.";
                continue;
            }
            if (!isset($trashData[$trashName])) {
                $errors[] = "Trash item $trashName not found.";
                continue;
            }
            // Build the full path to the trash file.
            $filePath = $trashDir . $trashName;
            if ($storage->stat($filePath) !== null) {
                if ($storage->delete($filePath)) {
                    $deletedFiles[] = $trashName;
                    unset($trashData[$trashName]);
                } else {
                    $errors[] = "Failed to delete $trashName.";
                }
            } else {
                // If the file doesn't exist, remove its metadata.
                unset($trashData[$trashName]);
                $deletedFiles[] = $trashName;
            }
        }

        // Save the updated trash metadata back as an indexed array.
        $storage->write($trashMetadataFile, json_encode(array_values($trashData), JSON_PRETTY_PRINT), LOCK_EX);

        if (empty($errors)) {
            return ["deleted" => $deletedFiles];
        } else {
            return ["deleted" => $deletedFiles, "error" => implode("; ", $errors)];
        }
    }

    /**
     * Retrieves file tags from the createdTags.json metadata file.
     *
     * @return array An array of tags. Returns an empty array if the file doesn't exist or is not readable.
     */
    public static function getFileTags(): array
    {
        $metadataPath = self::metaRoot() . 'createdTags.json';

        // Missing file is normal (especially for new sources); unreadable is worth logging.
        if (!file_exists($metadataPath)) {
            return [];
        }
        if (!is_readable($metadataPath)) {
            error_log('Metadata file is not readable: ' . $metadataPath);
            return [];
        }

        $data = file_get_contents($metadataPath);
        if ($data === false) {
            error_log('Failed to read metadata file: ' . $metadataPath);
            // Return an empty array for a graceful fallback.
            return [];
        }

        $jsonData = json_decode($data, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('Invalid JSON in metadata file: ' . $metadataPath . ' Error: ' . json_last_error_msg());
            return [];
        }

        if (!is_array($jsonData)) {
            return [];
        }

        return self::sanitizeTags($jsonData);
    }

    private static function isValidTagColor($color): bool
    {
        $color = trim((string)$color);
        if ($color === '') {
            return false;
        }
        if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
            return true;
        }
        if (preg_match('/^[a-zA-Z]{1,32}$/', $color)) {
            return true;
        }
        return false;
    }

    private static function sanitizeTagColor($color): string
    {
        $color = trim((string)$color);
        return self::isValidTagColor($color) ? $color : '#777777';
    }

    private static function sanitizeTags(array $tags): array
    {
        $clean = [];
        foreach ($tags as $tag) {
            if (is_string($tag)) {
                $name = trim($tag);
                if ($name === '') {
                    continue;
                }
                $clean[] = [
                    'name' => $name,
                    'color' => self::sanitizeTagColor('')
                ];
                continue;
            }
            if (!is_array($tag)) {
                continue;
            }
            $name = trim((string)($tag['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $tag['name'] = $name;
            $tag['color'] = self::sanitizeTagColor($tag['color'] ?? '');
            $clean[] = $tag;
        }

        return $clean;
    }

    /**
     * Saves tag data for a specified file and updates the global tags.
     *
     * @param string $folder The folder where the file is located (e.g., "root" or a subfolder).
     * @param string $file The name of the file for which tags are being saved.
     * @param array  $tags An array of tag definitions, each being an associative array (e.g. ['name' => 'Tag1', 'color' => '#FF0000']).
     * @param bool   $deleteGlobal Optional flag; if true and 'tagToDelete' is provided, remove that tag from the global tags.
     * @param string|null $tagToDelete Optional tag name to delete from global tags when $deleteGlobal is true.
     * @return array Returns an associative array with a "success" key and updated "globalTags", or an "error" key on failure.
     */
    public static function saveFileTag(string $folder, string $file, array $tags, bool $deleteGlobal = false, ?string $tagToDelete = null): array
    {
        // Validate the file name and folder
        $folder = trim($folder) ?: 'root';
        $file   = basename(trim($file));
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }
        if (!preg_match(REGEX_FILE_NAME, $file)) {
            return ["error" => "Invalid file name."];
        }

        $tags = is_array($tags) ? $tags : [];
        $tags = self::sanitizeTags($tags);

        // Determine the folder metadata file.
        $metadataFile = (strtolower($folder) === "root")
            ? self::metaRoot() . "root_metadata.json"
            : self::metaRoot() . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';

        // Load existing metadata for this folder.
        $metadata = [];
        if (file_exists($metadataFile)) {
            $metadata = json_decode(file_get_contents($metadataFile), true) ?? [];
        }

        // Update the metadata for the specified file.
        if (!isset($metadata[$file])) {
            $metadata[$file] = [];
        }
        $metadata[$file]['tags'] = $tags;

        if (file_put_contents($metadataFile, json_encode($metadata, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Failed to save tag data for file metadata."];
        }

        // Now update the global tags file.
        $globalTagsFile = self::metaRoot() . "createdTags.json";
        $globalTags = [];
        if (file_exists($globalTagsFile)) {
            $globalTags = json_decode(file_get_contents($globalTagsFile), true) ?? [];
            if (!is_array($globalTags)) {
                $globalTags = [];
            }
        }
        $globalTags = self::sanitizeTags($globalTags);

        // If deleteGlobal is true and tagToDelete is provided, remove that tag.
        if ($deleteGlobal && !empty($tagToDelete)) {
            $tagToDeleteLower = strtolower($tagToDelete);
            $globalTags = array_values(array_filter($globalTags, function ($globalTag) use ($tagToDeleteLower) {
                return strtolower($globalTag['name']) !== $tagToDeleteLower;
            }));
        } else {
            // Otherwise, merge (update or add) new tags into the global tags.
            foreach ($tags as $tag) {
                $found = false;
                foreach ($globalTags as &$globalTag) {
                    if (strtolower($globalTag['name']) === strtolower($tag['name'])) {
                        $globalTag['color'] = $tag['color'];
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $globalTags[] = $tag;
                }
            }
            unset($globalTag);
        }

        if (file_put_contents($globalTagsFile, json_encode($globalTags, JSON_PRETTY_PRINT), LOCK_EX) === false) {
            return ["error" => "Failed to save global tags."];
        }

        return ["success" => "Tag data saved successfully.", "globalTags" => $globalTags];
    }

    /**
     * Retrieves the list of files in a given folder, enriched with metadata, along with global tags.
     *
     * @param string $folder The folder name (e.g., "root" or a subfolder).
     * @return array Returns an associative array with keys "files" and "globalTags".
     */
    public static function getFileList(string $folder): array
    {
        // --- caps for safe inlining ---
        if (!defined('LISTING_CONTENT_BYTES_MAX')) define('LISTING_CONTENT_BYTES_MAX', 8192);          // 8 KB snippet
        if (!defined('INDEX_TEXT_BYTES_MAX'))    define('INDEX_TEXT_BYTES_MAX', 5 * 1024 * 1024);     // only sample files ≤ 5 MB

        $folder = trim($folder) ?: 'root';
        $storage = self::storage();
        $activeSourceId = class_exists('SourceContext') ? SourceContext::getActiveId() : '';

        // Determine the target directory.
        $baseDir = rtrim(self::uploadRoot(), '/\\');
        if (strtolower($folder) !== 'root') {
            $directory = $baseDir . DIRECTORY_SEPARATOR . $folder;
        } else {
            $directory = $baseDir;
        }

        // Validate folder.
        if (strtolower($folder) !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            return ["error" => "Invalid folder name."];
        }

        // Helper: Build the metadata file path.
        $getMetadataFilePath = function (string $folder): string {
            $metaRoot = self::metaRoot();
            if (strtolower($folder) === 'root' || trim($folder) === '') {
                return $metaRoot . "root_metadata.json";
            }
            return $metaRoot . str_replace(['/', '\\', ' '], '-', trim($folder)) . '_metadata.json';
        };
        $metadataFile = $getMetadataFilePath($folder);
        $metadata = file_exists($metadataFile) ? (json_decode(file_get_contents($metadataFile), true) ?: []) : [];

        $dirStat = $storage->stat($directory);
        if ($dirStat === null || $dirStat['type'] !== 'dir') {
            return ["error" => "Directory not found."];
        }

        $allFiles = array_values(array_diff($storage->list($directory), array('.', '..')));
        $fileList = [];

        // Define a safe file name pattern.
        $safeFileNamePattern = REGEX_FILE_NAME;

        // Prepare finfo (local only) for MIME sniffing.
        $finfo = ($storage->isLocal() && function_exists('finfo_open'))
            ? @finfo_open(FILEINFO_MIME_TYPE)
            : false;
        $remoteUploader = null;
        $localUploader = null;
        if (!$storage->isLocal()) {
            $remoteUploader = 'Remote';
            if (class_exists('SourceContext')) {
                $src = SourceContext::getActiveSource();
                $type = strtolower((string)($src['type'] ?? ''));
                $name = trim((string)($src['name'] ?? ''));
                $id = trim((string)($src['id'] ?? ''));
                $cfg = is_array($src['config'] ?? null) ? $src['config'] : [];
                $bucket = trim((string)($cfg['bucket'] ?? ''));
                if ($type === 's3') {
                    if ($bucket !== '') {
                        $remoteUploader = 'S3: ' . $bucket;
                    } elseif ($name !== '') {
                        $remoteUploader = $name;
                    } elseif ($id !== '') {
                        $remoteUploader = $id;
                    } else {
                        $remoteUploader = 'S3';
                    }
                } elseif ($name !== '') {
                    $remoteUploader = $name;
                } elseif ($id !== '') {
                    $remoteUploader = $id;
                }
            }
        } elseif (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
            $src = SourceContext::getActiveSource();
            $name = trim((string)($src['name'] ?? ''));
            $id = trim((string)($src['id'] ?? ''));
            if ($name !== '') {
                $localUploader = $name;
            } elseif ($id !== '') {
                $localUploader = $id;
            }
        }
        $skipContentForRemote = false;
        if (!$storage->isLocal() && class_exists('SourceContext')) {
            $src = SourceContext::getActiveSource();
            if (is_array($src)) {
                $type = strtolower((string)($src['type'] ?? ''));
                if (in_array($type, ['ftp', 'sftp', 'webdav', 'gdrive', 'onedrive', 'dropbox'], true)) {
                    $skipContentForRemote = true;
                }
            }
        }

        foreach ($allFiles as $file) {
            if ($file === '' || $file[0] === '.') {
                continue; // Skip hidden/invalid entries.
            }

            $filePath = $directory . DIRECTORY_SEPARATOR . $file;
            $stat = $storage->stat($filePath);
            if ($stat === null || $stat['type'] !== 'file') {
                continue; // Only process files.
            }
            if (!preg_match($safeFileNamePattern, $file)) {
                continue;
            }

            // Meta
            $mtime = $stat['mtime'] ?? 0;
            $fileDateModified = $mtime ? date(DATE_TIME_FORMAT, $mtime) : '';
            $metaKey = $file;
            $metaModified = isset($metadata[$metaKey]["modified"])
                ? trim((string)$metadata[$metaKey]["modified"])
                : '';
            if ($fileDateModified === '' && $metaModified !== '' && $metaModified !== 'Unknown') {
                $fileDateModified = $metaModified;
            }
            if ($fileDateModified === '') {
                $fileDateModified = "Unknown";
            }
            $fileUploadedDate = isset($metadata[$metaKey]["uploaded"]) ? $metadata[$metaKey]["uploaded"] : "Unknown";
            $fileUploader = isset($metadata[$metaKey]["uploader"]) ? $metadata[$metaKey]["uploader"] : "Unknown";
            if (!$storage->isLocal()) {
                if (($fileUploadedDate === "Unknown" || $fileUploadedDate === "") && $fileDateModified !== "Unknown") {
                    $fileUploadedDate = $fileDateModified;
                }
                if (($fileUploader === "Unknown" || $fileUploader === "") && $remoteUploader) {
                    $fileUploader = $remoteUploader;
                }
            } elseif (class_exists('SourceContext') && SourceContext::sourcesEnabled()) {
                if (($fileUploadedDate === "Unknown" || $fileUploadedDate === "") && $fileDateModified !== "Unknown") {
                    $fileUploadedDate = $fileDateModified;
                }
                if (($fileUploader === "Unknown" || $fileUploader === "") && $localUploader) {
                    $fileUploader = $localUploader;
                }
            }

            // Size
            $fileSizeBytes = isset($stat['size']) ? (int)$stat['size'] : 0;
            if ($fileSizeBytes >= 1073741824) {
                $fileSizeFormatted = sprintf("%.1f GB", $fileSizeBytes / 1073741824);
            } elseif ($fileSizeBytes >= 1048576) {
                $fileSizeFormatted = sprintf("%.1f MB", $fileSizeBytes / 1048576);
            } elseif ($fileSizeBytes >= 1024) {
                $fileSizeFormatted = sprintf("%.1f KB", $fileSizeBytes / 1024);
            } else {
                $fileSizeFormatted = sprintf("%s bytes", number_format($fileSizeBytes));
            }

            // MIME + text detection (fallback to extension)
            $mime = $stat['mime'] ?? 'application/octet-stream';
            if (!is_string($mime) || $mime === '') {
                $mime = 'application/octet-stream';
            }
            if ($finfo) {
                $det = @finfo_file($finfo, $filePath);
                if (is_string($det) && $det !== '') $mime = $det;
            }
            $isTextByMime = (strpos((string)$mime, 'text/') === 0) || $mime === 'application/json' || $mime === 'application/xml';
            $isTextByExt  = (bool)preg_match('/\.(txt|md|csv|json|xml|html?|css|js|log|ini|conf|config|yml|yaml|php|py|rb|sh|bat|ps1|ts|tsx|c|cpp|h|hpp|java|go|rs)$/i', $file);
            $isText = $isTextByMime || $isTextByExt;

            // Build entry
            $fileEntry = [
                'name'      => $file,
                'modified'  => $fileDateModified,
                'uploaded'  => $fileUploadedDate,
                'size'      => $fileSizeFormatted,
                'sizeBytes' => $fileSizeBytes,            // ← numeric size for frontend logic
                'uploader'  => $fileUploader,
                'tags'      => [],
                'mime'      => $mime,
                'sourceId'  => $activeSourceId,
            ];

            // Small, safe snippet for text files only (never full content)
            $fileEntry['content']          = '';
            $fileEntry['contentTruncated'] = false;

            if ($isText && $fileSizeBytes > 0) {
                if ($skipContentForRemote) {
                    $fileEntry['contentTruncated'] = true;
                } elseif ($fileSizeBytes <= INDEX_TEXT_BYTES_MAX) {
                    $snippet = $storage->read($filePath, LISTING_CONTENT_BYTES_MAX, 0);
                    if ($snippet !== false) {
                        // ensure UTF-8 for JSON
                        if (function_exists('mb_check_encoding') && !mb_check_encoding($snippet, 'UTF-8')) {
                            if (function_exists('mb_convert_encoding')) {
                                $snippet = @mb_convert_encoding($snippet, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252');
                            }
                        }
                        $fileEntry['content'] = $snippet;
                        $fileEntry['contentTruncated'] = ($fileSizeBytes > LISTING_CONTENT_BYTES_MAX);
                    }
                } else {
                    // too large to sample: mark truncated so UI/search knows
                    $fileEntry['contentTruncated'] = true;
                }
            }

            $tags = [];
            if (isset($metadata[$metaKey]['tags']) && is_array($metadata[$metaKey]['tags'])) {
                $tags = self::sanitizeTags($metadata[$metaKey]['tags']);
            }
            $fileEntry['tags'] = $tags;

            $fileList[] = $fileEntry;
        }

        if ($finfo) {
            @finfo_close($finfo);
        }

        // Load global tags.
        $globalTagsFile = self::metaRoot() . "createdTags.json";
        $globalTags = file_exists($globalTagsFile) ? (json_decode(file_get_contents($globalTagsFile), true) ?: []) : [];
        $globalTags = is_array($globalTags) ? self::sanitizeTags($globalTags) : [];

        return ["files" => $fileList, "globalTags" => $globalTags, "sourceId" => $activeSourceId];
    }

    public static function getAllShareLinks(): array
    {
        $shareFile = self::metaRoot() . "share_links.json";
        if (!file_exists($shareFile)) {
            return [];
        }
        $links = json_decode(file_get_contents($shareFile), true);
        return is_array($links) ? $links : [];
    }

    public static function deleteShareLink(string $token): bool
    {
        $shareFile = self::metaRoot() . "share_links.json";
        if (!file_exists($shareFile)) {
            return false;
        }
        $links = json_decode(file_get_contents($shareFile), true);
        if (!is_array($links) || !isset($links[$token])) {
            return false;
        }
        unset($links[$token]);
        file_put_contents($shareFile, json_encode($links, JSON_PRETTY_PRINT), LOCK_EX);
        return true;
    }

    private static function seedFileContents(string $filename): ?string
    {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === 'docx') {
            $data = base64_decode(self::EMPTY_DOCX_BASE64, true);
            return ($data === false) ? null : $data;
        }
        if ($ext === 'xlsx') {
            $data = base64_decode(self::EMPTY_XLSX_BASE64, true);
            return ($data === false) ? null : $data;
        }
        return null;
    }

    /**
     * Create an empty file plus metadata entry.
     *
     * @param string $folder
     * @param string $filename
     * @param string $uploader
     * @return array ['success'=>bool, 'error'=>string, 'code'=>int]
     */
    public static function createFile(string $folder, string $filename, string $uploader): array
    {
        // 1) basic validation
        $filename = basename(trim($filename));
        if (!preg_match(REGEX_FILE_NAME, $filename)) {
            return ['success' => false, 'error' => 'Invalid filename', 'code' => 400];
        }

        $storage = self::storage();

        // 2) resolve target folder
        list($baseDir, $err) = self::resolveFolderPath($folder, true);
        if ($err) {
            return ['success' => false, 'error' => $err, 'code' => ($err === 'Invalid folder name.' ? 400 : 500)];
        }

        $path = $baseDir . DIRECTORY_SEPARATOR . $filename;

        // 3) no overwrite
        if ($storage->stat($path) !== null) {
            return ['success' => false, 'error' => 'File already exists', 'code' => 400];
        }

        // 4) touch the file (seed minimal DOCX to keep ONLYOFFICE happy)
        $seed = self::seedFileContents($filename);
        $data = ($seed !== null) ? $seed : '';
        if (!$storage->write($path, $data, LOCK_EX)) {
            $detail = self::adapterErrorDetail($storage);
            return [
                'success' => false,
                'error' => $detail !== '' ? ('Could not create file: ' . $detail) : 'Could not create file',
                'code' => 500
            ];
        }

        // 5) write metadata
        $metaKey  = (strtolower($folder) === 'root' || trim($folder) === '') ? 'root' : $folder;
        $metaName = str_replace(['/', '\\', ' '], '-', $metaKey) . '_metadata.json';
        $metaPath = self::metaRoot() . $metaName;

        $collection = [];
        if (file_exists($metaPath)) {
            $json = file_get_contents($metaPath);
            $collection = json_decode($json, true) ?: [];
        }

        $now = date(DATE_TIME_FORMAT);
        $collection[$filename] = [
            'uploaded' => $now,
            'modified' => $now,
            'uploader' => $uploader
        ];

        if (false === file_put_contents($metaPath, json_encode($collection, JSON_PRETTY_PRINT), LOCK_EX)) {
            return ['success' => false, 'error' => 'Failed to update metadata', 'code' => 500];
        }

        return ['success' => true];
    }
}
