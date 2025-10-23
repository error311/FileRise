<?php
// src/controllers/FileController.php

require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/models/FileModel.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class FileController
{
    /* =========================
     * Permission helpers (fail-closed)
     * ========================= */
    private function isAdmin(array $perms): bool {
        if (!empty($perms['admin']) || !empty($perms['isAdmin'])) return true;
        if (!empty($_SESSION['isAdmin']) && $_SESSION['isAdmin'] === true) return true;
        $role = $_SESSION['role'] ?? null;
        if ($role === 'admin' || $role === '1' || $role === 1) return true;

        $u = $_SESSION['username'] ?? '';
        if ($u) {
            $roleStr = userModel::getUserRole($u);
            if ($roleStr === '1') return true;
        }
        return false;
    }

    private function isFolderOnly(array $perms): bool {
        return !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
    }

    private function getMetadataPath(string $folder): string {
        $folder = trim($folder);
        if ($folder === '' || strtolower($folder) === 'root') {
            return META_DIR . 'root_metadata.json';
        }
        return META_DIR . str_replace(['/', '\\', ' '], '-', $folder) . '_metadata.json';
    }

    private function loadFolderMetadata(string $folder): array {
        $meta = $this->getMetadataPath($folder);
        if (file_exists($meta)) {
            $data = json_decode(file_get_contents($meta), true);
            if (is_array($data)) return $data;
        }
        return [];
    }

    private function loadPerms(string $username): array {
        try {
            if (function_exists('loadUserPermissions')) {
                $p = loadUserPermissions($username);
                return is_array($p) ? $p : [];
            }
            if (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
                $all = userModel::getUserPermissions();
                if (is_array($all)) {
                    if (isset($all[$username])) return (array)$all[$username];
                    $lk = strtolower($username);
                    if (isset($all[$lk])) return (array)$all[$lk];
                }
            }
        } catch (\Throwable $e) { /* ignore */ }
        return [];
    }

    private static function folderOfPath(string $path): string {
        // normalize path to folder; files: use dirname, folders: return path
        $p = trim(str_replace('\\', '/', $path), "/ \t\r\n");
        if ($p === '' || $p === 'root') return 'root';
        // If it ends with a slash or is an existing folder path, treat as folder
        if (substr($p, -1) === '/') $p = rtrim($p, '/');
        // For files, take the parent folder
        $dir = dirname($p);
        return ($dir === '.' || $dir === '') ? 'root' : $dir;
    }
    
    private static function ensureSrcDstAllowedForCopy(
        string $user, array $perms, string $srcPath, string $dstFolder
    ): bool {
        $srcFolder = ACL::normalizeFolder(self::folderOfPath($srcPath));
        $dstFolder = ACL::normalizeFolder($dstFolder);
        // Need to be able to see the source (own or full) and copy into destination
        return ACL::canReadOwn($user, $perms, $srcFolder)
            && ACL::canCopy($user, $perms, $dstFolder);
    }
    
    private static function ensureSrcDstAllowedForMove(
        string $user, array $perms, string $srcPath, string $dstFolder
    ): bool {
        $srcFolder = ACL::normalizeFolder(self::folderOfPath($srcPath));
        $dstFolder = ACL::normalizeFolder($dstFolder);
        // Move removes from source and adds to dest
        return ACL::canDelete($user, $perms, $srcFolder)
            && ACL::canMove($user, $perms, $dstFolder);
    }

    /**
     * Ownership-only enforcement for a set of files in a folder.
     * Returns null if OK, or an error string.
     */
    private function enforceScopeAndOwnership(string $folder, array $files, string $username, array $userPermissions): ?string {
        $ignoreOwnership = $this->isAdmin($userPermissions)
            || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
        if ($ignoreOwnership) return null;

        $metadata = $this->loadFolderMetadata($folder);
        foreach ($files as $f) {
            $name = basename((string)$f);
            if (!isset($metadata[$name]['uploader']) || strcasecmp((string)$metadata[$name]['uploader'], $username) !== 0) {
                return "Forbidden: you are not the owner of '{$name}'.";
            }
        }
        return null;
    }

    /**
     * True if the user is an owner of the folder or any ancestor folder (admin also true).
     */
    private function ownsFolderOrAncestor(string $folder, string $username, array $userPermissions): bool {
        if ($this->isAdmin($userPermissions)) return true;
        $folder = ACL::normalizeFolder($folder);

        // Direct folder first, then walk up ancestors (excluding 'root' sentinel)
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $userPermissions, $f)) {
                return true;
            }
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }
        return false;
    }

    /**
     * Enforce per-folder scope when the account is in "folder-only" mode.
     * $need: 'read' (default) | 'write' | 'manage' | 'share' | 'read_own'
     * Returns null if allowed, or an error string if forbidden.
     */
    private function enforceFolderScope(
        string $folder,
        string $username,
        array $userPermissions,
        string $need = 'read'
    ): ?string {
        // Admins bypass all folder scope checks
        if ($this->isAdmin($userPermissions)) return null;

        // If the account isn't restricted to a folder scope, don't gate here
        if (!$this->isFolderOnly($userPermissions)) return null;

        $folder = ACL::normalizeFolder($folder);

        // If user owns this folder (or any ancestor), allow
        $f = $folder;
        while ($f !== '' && strtolower($f) !== 'root') {
            if (ACL::isOwner($username, $userPermissions, $f)) {
                return null;
            }
            $pos = strrpos($f, '/');
            $f = ($pos === false) ? '' : substr($f, 0, $pos);
        }

        // Otherwise, require the specific capability on the target folder
        $ok = false;
        switch ($need) {
                case 'manage':   $ok = ACL::canManage($username, $userPermissions, $folder); break;
                case 'write':    $ok = ACL::canWrite($username, $userPermissions, $folder);  break; // legacy
                case 'share':    $ok = ACL::canShare($username, $userPermissions, $folder);  break; // legacy
                case 'read_own': $ok = ACL::canReadOwn($username, $userPermissions, $folder); break;
                // granular:
                case 'create':   $ok = ACL::canCreate($username, $userPermissions, $folder); break;
                case 'upload':   $ok = ACL::canUpload($username, $userPermissions, $folder); break;
                case 'edit':     $ok = ACL::canEdit($username, $userPermissions, $folder);   break;
                case 'rename':   $ok = ACL::canRename($username, $userPermissions, $folder); break;
                case 'copy':     $ok = ACL::canCopy($username, $userPermissions, $folder);   break;
                case 'move':     $ok = ACL::canMove($username, $userPermissions, $folder);   break;
                case 'delete':   $ok = ACL::canDelete($username, $userPermissions, $folder); break;
                case 'extract':  $ok = ACL::canExtract($username, $userPermissions, $folder); break;
                case 'shareFile':
                case 'share_file':   $ok = ACL::canShareFile($username, $userPermissions, $folder);   break;
                case 'shareFolder':
                case 'share_folder': $ok = ACL::canShareFolder($username, $userPermissions, $folder); break;
                default: // 'read'
                    $ok = ACL::canRead($username, $userPermissions, $folder);
            }

        return $ok ? null : "Forbidden: folder scope violation.";
    }

    // --- small helpers ---
    private function _jsonStart(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        header('Content-Type: application/json; charset=utf-8');
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) return;
            throw new ErrorException($message, 0, $severity, $file, $line);
        });
    }
    private function _jsonEnd(): void { restore_error_handler(); }
    private function _jsonOut(array $payload, int $status = 200): void {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    private function _checkCsrf(): bool {
        $headersArr = function_exists('getallheaders')
            ? array_change_key_case(getallheaders(), CASE_LOWER)
            : [];
        $receivedToken = $headersArr['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || $receivedToken !== $_SESSION['csrf_token']) {
            $this->_jsonOut(['error' => 'Invalid CSRF token'], 403);
            return false;
        }
        return true;
    }
    private function _requireAuth(): bool {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            $this->_jsonOut(['error' => 'Unauthorized'], 401);
            return false;
        }
        return true;
    }
    private function _readJsonBody(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    private function _normalizeFolder($f): string {
        $f = trim((string)$f);
        if ($f === '' || strtolower($f) === 'root') return 'root';
        return $f;
    }
    private function _validFolder($f): bool {
        if ($f === 'root') return true;
        return (bool)preg_match(REGEX_FOLDER_NAME, $f);
    }
    private function _validFile($f): bool {
        $f = basename((string)$f);
        return $f !== '' && (bool)preg_match(REGEX_FILE_NAME, $f);
    }

    /* =========================
     * Actions
     * ========================= */

     public function copyFiles()
     {
         $this->_jsonStart();
         try {
             if (!$this->_checkCsrf()) return;
             if (!$this->_requireAuth()) return;
     
             $data = $this->_readJsonBody();
             if (
                 !$data
                 || !isset($data['source'], $data['destination'], $data['files'])
                 || !is_array($data['files'])
             ) {
                 $this->_jsonOut(["error" => "Invalid request"], 400); return;
             }
     
             $sourceFolder      = $this->_normalizeFolder($data['source']);
             $destinationFolder = $this->_normalizeFolder($data['destination']);
             $files             = array_values(array_filter(array_map('basename', (array)$data['files'])));

     
             if (!$this->_validFolder($sourceFolder) || !$this->_validFolder($destinationFolder)) {
                 $this->_jsonOut(["error" => "Invalid folder name(s)."], 400); return;
             }
             if (empty($files)) {
                        $this->_jsonOut(["error" => "No files specified."], 400); return;
                }
     
             $username        = $_SESSION['username'] ?? '';
             $userPermissions = $this->loadPerms($username);
     
             // --- Permission gates (granular) ------------------------------------
             // Source: own-only view is enough to copy (we'll enforce ownership below if no full read)
             $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                            || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
             if (!$hasSourceView) {
                 $this->_jsonOut(["error" => "Forbidden: no read access to source"], 403); return;
             }
     
             // Destination: must have 'copy' capability (or own ancestor)
             $hasDestCreate = ACL::canCreate($username, $userPermissions, $destinationFolder)
                          || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
            if (!$hasDestCreate) {
                $this->_jsonOut(["error" => "Forbidden: no write access to destination"], 403); return;
            }

            $needSrcScope = ACL::canRead($username, $userPermissions, $sourceFolder) ? 'read' : 'read_own';
     
             // Folder-scope checks with the needed capabilities
             $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, $needSrcScope);
            if ($sv) { $this->_jsonOut(["error" => $sv], 403); return; }
     
             $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'create');
             if ($dv) { $this->_jsonOut(["error" => $dv], 403); return; }
     
             // If the user doesn't have full read on source (only read_own), enforce per-file ownership
             $ignoreOwnership = $this->isAdmin($userPermissions)
                 || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
     
             if (
                 !$ignoreOwnership
                 && !ACL::canRead($username, $userPermissions, $sourceFolder)   // no explicit full read
                 && ACL::hasGrant($username, $sourceFolder, 'read_own')         // but has own-only
             ) {
                 $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                 if ($ownErr) { $this->_jsonOut(["error" => $ownErr], 403); return; }
             }

             // Account flags: copy writes new objects into destination
           if (!empty($userPermissions['readOnly'])) {
                    $this->_jsonOut(["error" => "Account is read-only."], 403); return;
                }
                if (!empty($userPermissions['disableUpload'])) {
                    $this->_jsonOut(["error" => "Uploads are disabled for your account."], 403); return;
                }
     
             // --- Do the copy ----------------------------------------------------
             $result = FileModel::copyFiles($sourceFolder, $destinationFolder, $files);
             $this->_jsonOut($result);
     
         } catch (Throwable $e) {
             error_log('FileController::copyFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
             $this->_jsonOut(['error' => 'Internal server error while copying files.'], 500);
         } finally {
             $this->_jsonEnd();
         }
     }

public function deleteFiles()
{
    $this->_jsonStart();
    try {
        if (!$this->_checkCsrf()) return;
        if (!$this->_requireAuth()) return;

        $data = $this->_readJsonBody();
        if (!is_array($data) || !isset($data['files']) || !is_array($data['files'])) {
            $this->_jsonOut(["error" => "No file names provided"], 400); return;
        }

        // sanitize/normalize the list (empty names filtered out)
        $files = array_values(array_filter(array_map('strval', $data['files']), fn($s) => $s !== ''));
        if (!$files) {
            $this->_jsonOut(["error" => "No file names provided"], 400); return;
        }

        $folder = $this->_normalizeFolder($data['folder'] ?? 'root');
        if (!$this->_validFolder($folder)) {
            $this->_jsonOut(["error" => "Invalid folder name."], 400); return;
        }

        $username        = $_SESSION['username'] ?? '';
        $userPermissions = $this->loadPerms($username);

        // --- Permission gates (granular) ------------------------------------
        // Need delete on folder (or ancestor-owner)
        $hasDelete = ACL::canDelete($username, $userPermissions, $folder)
                  || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
        if (!$hasDelete) {
            $this->_jsonOut(["error" => "Forbidden: no delete permission"], 403); return;
        }

        // --- Folder-scope check (granular) ----------------------------------
        $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'delete');
        if ($dv) { $this->_jsonOut(["error" => $dv], 403); return; }

        // --- Ownership enforcement when user only has viewOwn ----------------
        $ignoreOwnership = $this->isAdmin($userPermissions)
            || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
        $isFolderOwner = ACL::isOwner($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

        // If user is not owner/admin and does NOT have full view, but does have own-only, enforce per-file ownership
        if (
            !$ignoreOwnership
            && !$isFolderOwner
            && !ACL::canRead($username, $userPermissions, $folder)   // lacks full read
            && ACL::hasGrant($username, $folder, 'read_own')         // has own-only
        ) {
            $ownErr = $this->enforceScopeAndOwnership($folder, $files, $username, $userPermissions);
            if ($ownErr) { $this->_jsonOut(["error" => $ownErr], 403); return; }
        }

        // --- Perform delete --------------------------------------------------
        $result = FileModel::deleteFiles($folder, $files);
        $this->_jsonOut($result);

    } catch (Throwable $e) {
        error_log('FileController::deleteFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
        $this->_jsonOut(['error' => 'Internal server error while deleting files.'], 500);
    } finally { $this->_jsonEnd(); }
}

    public function moveFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;
    
            $data = $this->_readJsonBody();
            if (
                !$data
                || !isset($data['source'], $data['destination'], $data['files'])
                || !is_array($data['files'])
            ) {
                $this->_jsonOut(["error" => "Invalid request"], 400); return;
            }
    
            $sourceFolder      = $this->_normalizeFolder($data['source']);
            $destinationFolder = $this->_normalizeFolder($data['destination']);
            if (!$this->_validFolder($sourceFolder) || !$this->_validFolder($destinationFolder)) {
                $this->_jsonOut(["error" => "Invalid folder name(s)."], 400); return;
            }
    
            $files            = $data['files'];
            $username         = $_SESSION['username'] ?? '';
            $userPermissions  = $this->loadPerms($username);
    
            // --- Permission gates (granular) ------------------------------------
            // Must be able to at least SEE the source and DELETE there
            $hasSourceView = ACL::canReadOwn($username, $userPermissions, $sourceFolder)
                           || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
            if (!$hasSourceView) {
                $this->_jsonOut(["error" => "Forbidden: no read access to source"], 403); return;
            }
    
            $hasSourceDelete = ACL::canDelete($username, $userPermissions, $sourceFolder)
                            || $this->ownsFolderOrAncestor($sourceFolder, $username, $userPermissions);
            if (!$hasSourceDelete) {
                $this->_jsonOut(["error" => "Forbidden: no delete permission on source"], 403); return;
            }
    
            // Destination must allow MOVE
            $hasDestMove = ACL::canMove($username, $userPermissions, $destinationFolder)
                        || $this->ownsFolderOrAncestor($destinationFolder, $username, $userPermissions);
            if (!$hasDestMove) {
                $this->_jsonOut(["error" => "Forbidden: no move permission on destination"], 403); return;
            }
    
            // --- Folder-scope checks --------------------------------------------
            // Source needs 'delete' scope; destination needs 'move' scope
            $sv = $this->enforceFolderScope($sourceFolder, $username, $userPermissions, 'delete');
            if ($sv) { $this->_jsonOut(["error" => $sv], 403); return; }
    
            $dv = $this->enforceFolderScope($destinationFolder, $username, $userPermissions, 'move');
            if ($dv) { $this->_jsonOut(["error" => $dv], 403); return; }
    
            // --- Ownership enforcement when only viewOwn on source --------------
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
    
            if (
                !$ignoreOwnership
                && !ACL::canRead($username, $userPermissions, $sourceFolder)   // no explicit full read
                && ACL::hasGrant($username, $sourceFolder, 'read_own')         // but has own-only
            ) {
                $ownErr = $this->enforceScopeAndOwnership($sourceFolder, $files, $username, $userPermissions);
                if ($ownErr) { $this->_jsonOut(["error"=>$ownErr], 403); return; }
            }
    
            // --- Perform move ----------------------------------------------------
            $result = FileModel::moveFiles($sourceFolder, $destinationFolder, $files);
            $this->_jsonOut($result);
    
        } catch (Throwable $e) {
            error_log('FileController::moveFiles error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while moving files.'], 500);
        } finally {
            $this->_jsonEnd();
        }
    }

    public function renameFile()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;
    
            $data = $this->_readJsonBody();
            if (!$data || !isset($data['folder'], $data['oldName'], $data['newName'])) {
                $this->_jsonOut(["error" => "Invalid input"], 400); return;
            }
    
            $folder  = $this->_normalizeFolder($data['folder']);
            $oldName = basename(trim((string)$data['oldName']));
            $newName = basename(trim((string)$data['newName']));
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name"], 400); return; }
            if (!$this->_validFile($oldName) || !$this->_validFile($newName)) {
                $this->_jsonOut(["error"=>"Invalid file name(s)."], 400); return;
            }
    
            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);
    
            // Need granular rename (or ancestor-owner)
            if (!(ACL::canRename($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->_jsonOut(["error"=>"Forbidden: no rename rights"], 403); return;
            }
    
            // Folder scope: rename
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'rename');
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }
    
            // Ownership for non-admins when not a folder owner
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));
            $isFolderOwner = ACL::isOwner($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
            if (!$ignoreOwnership && !$isFolderOwner) {
                $violation = $this->enforceScopeAndOwnership($folder, [$oldName], $username, $userPermissions);
                if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
            }
    
            $result = FileModel::renameFile($folder, $oldName, $newName);
            if (!is_array($result)) throw new RuntimeException('FileModel::renameFile returned non-array');
            if (isset($result['error'])) { $this->_jsonOut($result, 400); return; }
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::renameFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while renaming file.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function saveFile()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (empty($data) || !isset($data["fileName"])) {
                $this->_jsonOut(["error" => "Invalid request data"], 400); return;
            }

            $fileName = basename(trim((string)$data["fileName"]));
            $folder   = $this->_normalizeFolder($data["folder"] ?? 'root');
            if (!$this->_validFile($fileName)) { $this->_jsonOut(["error"=>"Invalid file name."], 400); return; }
            if (!$this->_validFolder($folder))  { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Need write (or ancestor-owner)
            if (!(ACL::canEdit($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->_jsonOut(["error"=>"Forbidden: no full write access"], 403); return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'edit');
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            // If overwriting, enforce ownership for non-admins (unless folder owner)
            $baseDir = rtrim(UPLOAD_DIR, '/\\');
            $dir = ($folder === 'root') ? $baseDir : $baseDir . DIRECTORY_SEPARATOR . $folder;
            $path = $dir . DIRECTORY_SEPARATOR . $fileName;
            if (is_file($path)) {
                $ignoreOwnership = $this->isAdmin($userPermissions)
                    || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                    || ACL::isOwner($username, $userPermissions, $folder)
                    || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

                if (!$ignoreOwnership) {
                    $violation = $this->enforceScopeAndOwnership($folder, [$fileName], $username, $userPermissions);
                    if ($violation) { $this->_jsonOut(["error"=>$violation], 403); return; }
                }
            }

            $deny = ['php','phtml','phar','php3','php4','php5','php7','php8','pht','shtml','cgi','fcgi'];
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            if (in_array($ext, $deny, true)) {
                $this->_jsonOut(['error' => 'Saving this file type is not allowed.'], 400); return;
            }

            $content = (string)($data['content'] ?? '');
            $result = FileModel::saveFile($folder, $fileName, $content, $username);
            if (!is_array($result)) throw new RuntimeException('FileModel::saveFile returned non-array');
            if (isset($result['error'])) { $this->_jsonOut($result, 400); return; }
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::saveFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while saving file.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function downloadFile()
    {
        if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Unauthorized"]);
            exit;
        }

        $file   = isset($_GET['file']) ? basename($_GET['file']) : '';
        $folder = isset($_GET['folder']) ? trim($_GET['folder']) : 'root';

        if (!preg_match(REGEX_FILE_NAME, $file)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid file name."]);
            exit;
        }
        if ($folder !== 'root' && !preg_match(REGEX_FOLDER_NAME, $folder)) {
            http_response_code(400);
            echo json_encode(["error" => "Invalid folder name."]);
            exit;
        }

        $username = $_SESSION['username'] ?? '';
        $perms    = $this->loadPerms($username);

        $ignoreOwnership = $this->isAdmin($perms)
            || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

        // Treat ancestor-folder ownership as full view as well
        $fullView = $ignoreOwnership
            || ACL::canRead($username, $perms, $folder)
            || $this->ownsFolderOrAncestor($folder, $username, $perms);

        $ownGrant = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

        if (!$fullView && !$ownGrant) {
            http_response_code(403);
            echo json_encode(["error" => "Forbidden: no view access to this folder."]);
            exit;
        }

        // If own-only, enforce uploader==user
        if ($ownGrant) {
            $meta = $this->loadFolderMetadata($folder);
            if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                http_response_code(403);
                echo json_encode(["error" => "Forbidden: you are not the owner of this file."]);
                exit;
            }
        }

        $downloadInfo = FileModel::getDownloadInfo($folder, $file);
        if (isset($downloadInfo['error'])) {
            http_response_code((in_array($downloadInfo['error'], ["File not found.", "Access forbidden."])) ? 404 : 400);
            echo json_encode(["error" => $downloadInfo['error']]);
            exit;
        }

        $realFilePath = $downloadInfo['filePath'];
        $mimeType     = $downloadInfo['mimeType'];
        header("Content-Type: " . $mimeType);

        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        $inlineImageTypes = ['jpg','jpeg','png','gif','bmp','webp','svg','ico'];
        if (in_array($ext, $inlineImageTypes, true)) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        header('Content-Length: ' . filesize($realFilePath));
        readfile($realFilePath);
        exit;
    }

    public function downloadZip()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "Invalid input."], 400); return;
            }

            $folder = $this->_normalizeFolder($data['folder']);
            $files  = $data['files'];
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);

            // Optional zip gate by account flag
            if (!$this->isAdmin($perms) && !empty($perms['disableZip'])) {
                $this->_jsonOut(["error" => "ZIP downloads are not allowed for your account."], 403); return;
            }

            $ignoreOwnership = $this->isAdmin($perms)
                || ($perms['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false));

            // Ancestor-owner counts as full view
            $fullView = $ignoreOwnership
                || ACL::canRead($username, $perms, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $perms);
            $ownOnly  = !$fullView && ACL::hasGrant($username, $folder, 'read_own');

            if (!$fullView && !$ownOnly) {
                $this->_jsonOut(["error" => "Forbidden: no view access to this folder."], 403); return;
            }

            // If own-only, ensure all files are owned by the user
            if ($ownOnly) {
                $meta = $this->loadFolderMetadata($folder);
                foreach ($files as $f) {
                    $bn = basename((string)$f);
                    if (!isset($meta[$bn]['uploader']) || strcasecmp((string)$meta[$bn]['uploader'], $username) !== 0) {
                        $this->_jsonOut(["error" => "Forbidden: you are not the owner of '{$bn}'."], 403); return;
                    }
                }
            }

            $result = FileModel::createZipArchive($folder, $files);
            if (isset($result['error'])) {
                $this->_jsonOut(["error" => $result['error']], 400); return;
            }

            $zipPath = $result['zipPath'] ?? null;
            if (!$zipPath || !file_exists($zipPath)) { $this->_jsonOut(["error"=>"ZIP archive not found."], 500); return; }

            // switch to file streaming
            header_remove('Content-Type');
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="files.zip"');
            header('Content-Length: ' . filesize($zipPath));
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Pragma: no-cache');

            readfile($zipPath);
            @unlink($zipPath);
            exit;
        } catch (Throwable $e) {
            error_log('FileController::downloadZip error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while preparing ZIP.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function extractZip()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!is_array($data) || !isset($data['folder'], $data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "Invalid input."], 400); return;
            }

            $folder = $this->_normalizeFolder($data['folder']);
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);

            // must be able to write into target folder (or be ancestor-owner)
            if (!(ACL::canExtract($username, $perms, $folder) || $this->ownsFolderOrAncestor($folder, $username, $perms))) {
                $this->_jsonOut(["error"=>"Forbidden: no full write access to destination"], 403); return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $perms, 'extract');
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            $result = FileModel::extractZipArchive($folder, $data['files']);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::extractZip error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while extracting ZIP.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function shareFile()
    {
        $token = filter_input(INPUT_GET, 'token', FILTER_SANITIZE_STRING);
        $providedPass = filter_input(INPUT_GET, 'pass', FILTER_SANITIZE_STRING);

        if (empty($token)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Missing token."]);
            exit;
        }

        $record = FileModel::getShareRecord($token);
        if (!$record) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "Share link not found."]);
            exit;
        }

        if (time() > $record['expires']) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["error" => "This link has expired."]);
            exit;
        }

        if (!empty($record['password']) && empty($providedPass)) {
            header("Content-Type: text/html; charset=utf-8");
            ?>
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enter Password</title></head>
<body>
  <h2>This file is protected by a password.</h2>
  <form method="get" action="/api/file/share.php">
    <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
    <label for="pass">Password:</label>
    <input type="password" name="pass" id="pass" required>
    <button type="submit">Submit</button>
  </form>
</body>
</html>
<?php
            exit;
        }

        if (!empty($record['password'])) {
            if (!password_verify($providedPass, $record['password'])) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(["error" => "Invalid password."]);
                exit;
            }
        }

        $folder = trim($record['folder'], "/\\ ");
        $file = $record['file'];
        $filePath = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
        if (!empty($folder) && strtolower($folder) !== 'root') {
            $filePath .= $folder . DIRECTORY_SEPARATOR;
        }
        $filePath .= $file;

        $realFilePath = realpath($filePath);
        $uploadDirReal = realpath(UPLOAD_DIR);
        if ($realFilePath === false || strpos($realFilePath, $uploadDirReal) !== 0) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "File not found."]);
            exit;
        }
        if (!file_exists($realFilePath)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(["error" => "File not found."]);
            exit;
        }

        $mimeType = mime_content_type($realFilePath);
        header("Content-Type: " . $mimeType);
        $ext = strtolower(pathinfo($realFilePath, PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'])) {
            header('Content-Disposition: inline; filename="' . basename($realFilePath) . '"');
        } else {
            header('Content-Disposition: attachment; filename="' . basename($realFilePath) . '"');
        }
        header("Cache-Control: no-store, no-cache, must-revalidate");
        header("Pragma: no-cache");
        header('Content-Length: ' . filesize($realFilePath));

        readfile($realFilePath);
        exit;
    }

    public function createShareLink()
    {
        $this->_jsonStart();
        try {
            if (!$this->_requireAuth()) return;

            $input = $this->_readJsonBody();
            if (!$input) { $this->_jsonOut(["error" => "Invalid input."], 400); return; }

            $folder = $this->_normalizeFolder($input['folder'] ?? '');
            $file   = basename((string)($input['file'] ?? ''));
            $value  = isset($input['expirationValue']) ? (int)$input['expirationValue'] : 60;
            $unit   = $input['expirationUnit'] ?? 'minutes';
            $password = (string)($input['password'] ?? '');

            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }
            if (!$this->_validFile($file))     { $this->_jsonOut(["error"=>"Invalid file name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Need share (or ancestor-owner)
            if (!(ACL::canShareFile($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->_jsonOut(["error"=>"Forbidden: no share access"], 403); return;
            }

            // Folder scope: share
            $sv = $this->enforceFolderScope($folder, $username, $userPermissions, 'share');
            if ($sv) { $this->_jsonOut(["error"=>$sv], 403); return; }

            // Ownership unless admin/folder-owner
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                || ACL::isOwner($username, $userPermissions, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);

            if (!$ignoreOwnership) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                    $this->_jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403); return;
                }
            }

            switch ($unit) {
                case 'seconds': $expirationSeconds = $value; break;
                case 'hours':   $expirationSeconds = $value * 3600; break;
                case 'days':    $expirationSeconds = $value * 86400; break;
                case 'minutes':
                default:        $expirationSeconds = $value * 60; break;
            }

            $result = FileModel::createShareLink($folder, $file, $expirationSeconds, $password);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::createShareLink error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while creating share link.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function getTrashItems()
    {
        $this->_jsonStart();
        try {
            if (!$this->_requireAuth()) return;
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

            $trashItems = FileModel::getTrashItems();
            $this->_jsonOut($trashItems);
        } catch (Throwable $e) {
            error_log('FileController::getTrashItems error: '.$e->getMessage());
            $this->_jsonOut(['error' => 'Internal server error while fetching trash.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function restoreFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

            $data = $this->_readJsonBody();
            if (!isset($data['files']) || !is_array($data['files'])) {
                $this->_jsonOut(["error" => "No file or folder identifiers provided"], 400); return;
            }
            $result = FileModel::restoreFiles($data['files']);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::restoreFiles error: '.$e->getMessage());
            $this->_jsonOut(['error' => 'Internal server error while restoring files.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function deleteTrashFiles()
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;
            $perms = $this->loadPerms($_SESSION['username'] ?? '');
            if (!$this->isAdmin($perms)) { $this->_jsonOut(['error'=>'Admin only'], 403); return; }

            $data = $this->_readJsonBody();
            if (!$data) { $this->_jsonOut(["error" => "Invalid input"], 400); return; }

            $filesToDelete = [];
            if (!empty($data['deleteAll'])) {
                $trashDir = rtrim(TRASH_DIR, '/\\') . DIRECTORY_SEPARATOR;
                $shareFile = $trashDir . "trash.json";
                if (file_exists($shareFile)) {
                    $tmp = json_decode(file_get_contents($shareFile), true);
                    if (is_array($tmp)) {
                        foreach ($tmp as $item) {
                            if (!empty($item['trashName'])) $filesToDelete[] = $item['trashName'];
                        }
                    }
                }
            } elseif (isset($data['files']) && is_array($data['files'])) {
                $filesToDelete = $data['files'];
            } else {
                $this->_jsonOut(["error" => "No trash file identifiers provided"], 400); return;
            }

            $result = FileModel::deleteTrashFiles($filesToDelete);
            if (!empty($result['deleted'])) {
                $msg = "Trash item".(count($result['deleted']) === 1 ? "" : "s")." deleted: ".implode(", ", $result['deleted']);
                $this->_jsonOut(["success"=>$msg]);
            } elseif (!empty($result['error'])) {
                $this->_jsonOut(["error"=>$result['error']], 400);
            } else {
                $this->_jsonOut(["success"=>"No items to delete."]);
            }
        } catch (Throwable $e) {
            error_log('FileController::deleteTrashFiles error: '.$e->getMessage());
            $this->_jsonOut(['error' => 'Internal server error while deleting trash files.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function getFileTags(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $tags = FileModel::getFileTags();
        echo json_encode($tags);
        exit;
    }

    public function saveFileTag(): void
    {
        $this->_jsonStart();
        try {
            if (!$this->_checkCsrf()) return;
            if (!$this->_requireAuth()) return;

            $data = $this->_readJsonBody();
            if (!$data) { $this->_jsonOut(["error" => "No data received"], 400); return; }

            $file        = trim((string)($data['file'] ?? ''));
            $folder      = $this->_normalizeFolder($data['folder'] ?? 'root');
            $tags        = $data['tags'] ?? [];
            $deleteGlobal= !empty($data['deleteGlobal']);
            $tagToDelete = isset($data['tagToDelete']) ? trim((string)$data['tagToDelete']) : null;

            if ($file === '' || !$this->_validFile($file)) { $this->_jsonOut(["error"=>"Invalid file."], 400); return; }
            if (!$this->_validFolder($folder)) { $this->_jsonOut(["error"=>"Invalid folder name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Need write (or ancestor-owner)
            if (!(ACL::canWrite($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->_jsonOut(["error"=>"Forbidden: no full write access"], 403); return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'write');
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            // Ownership unless admin/folder-owner
            $ignoreOwnership = $this->isAdmin($userPermissions)
                || ($userPermissions['bypassOwnership'] ?? (defined('DEFAULT_BYPASS_OWNERSHIP') ? DEFAULT_BYPASS_OWNERSHIP : false))
                || ACL::isOwner($username, $userPermissions, $folder)
                || $this->ownsFolderOrAncestor($folder, $username, $userPermissions);
            if (!$ignoreOwnership) {
                $meta = $this->loadFolderMetadata($folder);
                if (!isset($meta[$file]['uploader']) || strcasecmp((string)$meta[$file]['uploader'], $username) !== 0) {
                    $this->_jsonOut(["error" => "Forbidden: you are not the owner of this file."], 403); return;
                }
            }

            $result = FileModel::saveFileTag($folder, $file, $tags, $deleteGlobal, $tagToDelete);
            $this->_jsonOut($result);
        } catch (Throwable $e) {
            error_log('FileController::saveFileTag error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while saving tags.'], 500);
        } finally { $this->_jsonEnd(); }
    }

    public function getFileList(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        header('Content-Type: application/json; charset=utf-8');
    
        // convert warnings/notices to exceptions for cleaner error handling
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) return;
            throw new ErrorException($message, 0, $severity, $file, $line);
        });
    
        try {
            if (empty($_SESSION['username'])) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
    
            if (!is_dir(META_DIR)) @mkdir(META_DIR, 0775, true);
            if (!is_dir(UPLOAD_DIR)) {
                http_response_code(500);
                echo json_encode(['error' => 'Uploads directory not found.']);
                return;
            }
    
            // --- inputs ---
            $folder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'root';
    
            // Validate folder path: allow "root" or nested segments that each match REGEX_FOLDER_NAME
            if ($folder !== 'root') {
                $parts = array_filter(explode('/', trim($folder, "/\\ ")));
                if (empty($parts)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid folder name.']);
                    return;
                }
                foreach ($parts as $seg) {
                    if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Invalid folder name.']);
                        return;
                    }
                }
                $folder = implode('/', $parts);
            }
    
            // ---- Folder-level view checks (full vs own-only) ----
            $username = $_SESSION['username'] ?? '';
            $perms    = $this->loadPerms($username);
    
            // Full view if read OR ancestor owner
            $fullView     = ACL::canRead($username, $perms, $folder) || $this->ownsFolderOrAncestor($folder, $username, $perms);
            $ownOnlyGrant = ACL::hasGrant($username, $folder, 'read_own');
    
            // Special-case: keep Root visible but inert if user lacks any visibility there.
            if ($folder === 'root' && !$fullView && !$ownOnlyGrant) {
                echo json_encode([
                    'success' => true,
                    'folder'  => 'root',
                    'files'   => [],
                    // Optional hint the UI can use to show a soft message / disable actions:
                    'uiHints' => [
                        'noAccessRoot' => true,
                        'message'      => "You don't have access to Root. Select a folder you have access to."
                    ],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                return;
            }
    
            // Non-root: still enforce 403 if no visibility
            if ($folder !== 'root' && !$fullView && !$ownOnlyGrant) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: no view access to this folder.']);
                return;
            }
    
            // Fetch the list
            $result = FileModel::getFileList($folder);
            if ($result === false || $result === null) {
                http_response_code(500);
                echo json_encode(['error' => 'File model failed.']);
                return;
            }
            if (!is_array($result)) {
                throw new RuntimeException('FileModel::getFileList returned a non-array.');
            }
            if (isset($result['error'])) {
                http_response_code(400);
                echo json_encode($result);
                return;
            }
    
            // ---- Apply own-only filter if user does NOT have full view ----
            if (!$fullView && $ownOnlyGrant && isset($result['files'])) {
                $files = $result['files'];
    
                // If files keyed by filename (assoc array)
                if (is_array($files) && array_keys($files) !== range(0, count($files) - 1)) {
                    $filtered = [];
                    foreach ($files as $name => $meta) {
                        if (isset($meta['uploader']) && strcasecmp((string)$meta['uploader'], $username) === 0) {
                            $filtered[$name] = $meta;
                        }
                    }
                    $result['files'] = $filtered;
                }
                // If files is a numeric array of metadata items
                else if (is_array($files)) {
                    $result['files'] = array_values(array_filter(
                        $files,
                        function ($f) use ($username) {
                            return isset($f['uploader']) && strcasecmp((string)$f['uploader'], $username) === 0;
                        }
                    ));
                }
            }
    
            echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (Throwable $e) {
            error_log('FileController::getFileList error: '.$e->getMessage().' in '.$e->getFile().':'.$e->getLine());
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error while listing files.']);
        } finally {
            restore_error_handler();
        }
    }

    public function getShareLinks()
    {
        header('Content-Type: application/json');
        $shareFile = FileModel::getAllShareLinks();
        echo json_encode($shareFile, JSON_PRETTY_PRINT);
    }

    public function getAllShareLinks(): void
    {
        header('Content-Type: application/json');
        $shareFile = META_DIR . 'share_links.json';
        $links     = file_exists($shareFile)
                   ? json_decode(file_get_contents($shareFile), true) ?? []
                   : [];
        $now       = time();
        $cleaned   = [];

        foreach ($links as $token => $record) {
            if (!empty($record['expires']) && $record['expires'] < $now) continue;
            $cleaned[$token] = $record;
        }

        if (count($cleaned) !== count($links)) {
            file_put_contents($shareFile, json_encode($cleaned, JSON_PRETTY_PRINT));
        }

        echo json_encode($cleaned);
    }

    public function deleteShareLink()
    {
        header('Content-Type: application/json');
        $token = $_POST['token'] ?? '';
        if (!$token) { echo json_encode(['success' => false, 'error' => 'No token provided']); return; }

        $deleted = FileModel::deleteShareLink($token);
        echo json_encode($deleted ? ['success' => true] : ['success' => false, 'error' => 'Not found']);
    }

    public function createFile(): void
    {
        $this->_jsonStart();
        try {
            if (!$this->_requireAuth()) return;

            $body = $this->_readJsonBody();
            $folder   = $this->_normalizeFolder($body['folder'] ?? 'root');
            $filename = basename(trim((string)($body['name'] ?? '')));

            if (!$this->_validFolder($folder))   { $this->_jsonOut(["error" => "Invalid folder name."], 400); return; }
            if (!$this->_validFile($filename))   { $this->_jsonOut(["error" => "Invalid file name."], 400); return; }

            $username        = $_SESSION['username'] ?? '';
            $userPermissions = $this->loadPerms($username);

            // Need write (or ancestor-owner)
            if (!(ACL::canCreate($username, $userPermissions, $folder) || $this->ownsFolderOrAncestor($folder, $username, $userPermissions))) {
                $this->_jsonOut(["error"=>"Forbidden: no full write access"], 403); return;
            }

            // Folder scope: write
            $dv = $this->enforceFolderScope($folder, $username, $userPermissions, 'create');
            if ($dv) { $this->_jsonOut(["error"=>$dv], 403); return; }

            $result = FileModel::createFile($folder, $filename, $username);
            if (empty($result['success'])) {
                $this->_jsonOut(['success'=>false,'error'=>$result['error'] ?? 'Failed to create file'], $result['code'] ?? 400);
                return;
            }
            $this->_jsonOut(['success'=>true]);
        } catch (Throwable $e) {
            error_log('FileController::createFile error: '.$e->getMessage().' @ '.$e->getFile().':'.$e->getLine());
            $this->_jsonOut(['error' => 'Internal server error while creating file.'], 500);
        } finally { $this->_jsonEnd(); }
    }
}