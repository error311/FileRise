<?php
// public/api/folder/capabilities.php

/**
 * @OA\Get(
 *   path="/api/folder/capabilities.php",
 *   summary="Get effective capabilities for the current user in a folder",
 *   description="Computes the caller's capabilities for a given folder by combining account flags (readOnly/disableUpload), ACL grants (read/write/share), and the user-folder-only scope. Returns booleans indicating what the user can do.",
 *   operationId="getFolderCapabilities",
 *   tags={"Folders"},
 *   security={{"cookieAuth": {}}},
 *
 *   @OA\Parameter(
 *     name="folder",
 *     in="query",
 *     required=false,
 *     description="Target folder path. Defaults to 'root'. Supports nested paths like 'team/reports'.",
 *     @OA\Schema(type="string"),
 *     example="projects/acme"
 *   ),
 *
 *   @OA\Response(
 *     response=200,
 *     description="Capabilities computed successfully.",
 *     @OA\JsonContent(
 *       type="object",
 *       required={"user","folder","isAdmin","flags","canView","canUpload","canCreate","canRename","canDelete","canMoveIn","canShare"},
 *       @OA\Property(property="user", type="string", example="alice"),
 *       @OA\Property(property="folder", type="string", example="projects/acme"),
 *       @OA\Property(property="isAdmin", type="boolean", example=false),
 *       @OA\Property(
 *         property="flags",
 *         type="object",
 *         required={"folderOnly","readOnly","disableUpload"},
 *         @OA\Property(property="folderOnly", type="boolean", example=false),
 *         @OA\Property(property="readOnly", type="boolean", example=false),
 *         @OA\Property(property="disableUpload", type="boolean", example=false)
 *       ),
 *       @OA\Property(property="owner", type="string", nullable=true, example="alice"),
 *       @OA\Property(property="canView",   type="boolean", example=true,  description="User can view items in this folder."),
 *       @OA\Property(property="canUpload", type="boolean", example=true,  description="User can upload/edit/rename/move/delete items (i.e., WRITE)."),
 *       @OA\Property(property="canCreate", type="boolean", example=true,  description="User can create subfolders here."),
 *       @OA\Property(property="canRename", type="boolean", example=true,  description="User can rename items here."),
 *       @OA\Property(property="canDelete", type="boolean", example=true,  description="User can delete items here."),
 *       @OA\Property(property="canMoveIn", type="boolean", example=true,  description="User can move items into this folder."),
 *       @OA\Property(property="canShare",  type="boolean", example=false, description="User can create share links for this folder.")
 *     )
 *   ),
 *   @OA\Response(response=400, description="Invalid folder name."),
 *   @OA\Response(response=401, ref="#/components/responses/Unauthorized")
 * )
 */

declare(strict_types=1);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

require_once __DIR__ . '/../../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/UserModel.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

header('Content-Type: application/json');

// --- auth ---
$username = $_SESSION['username'] ?? '';
if ($username === '') {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}

// --- helpers ---
function loadPermsFor(string $u): array {
  try {
    if (function_exists('loadUserPermissions')) {
      $p = loadUserPermissions($u);
      return is_array($p) ? $p : [];
    }
    if (class_exists('userModel') && method_exists('userModel', 'getUserPermissions')) {
      $all = userModel::getUserPermissions();
      if (is_array($all)) {
        if (isset($all[$u])) return (array)$all[$u];
        $lk = strtolower($u);
        if (isset($all[$lk])) return (array)$all[$lk];
      }
    }
  } catch (Throwable $e) {}
  return [];
}

function isOwnerOrAncestorOwner(string $user, array $perms, string $folder): bool {
  $f = ACL::normalizeFolder($folder);
  // direct owner
  if (ACL::isOwner($user, $perms, $f)) return true;
  // ancestor owner
  while ($f !== '' && strcasecmp($f, 'root') !== 0) {
    $pos = strrpos($f, '/');
    if ($pos === false) break;
    $f = substr($f, 0, $pos);
    if ($f === '' || strcasecmp($f, 'root') === 0) break;
    if (ACL::isOwner($user, $perms, $f)) return true;
  }
  return false;
}

/**
 * folder-only scope:
 * - Admins: always in scope
 * - Non folder-only accounts: always in scope
 * - Folder-only accounts: in scope iff:
 *   - folder == username OR subpath of username, OR
 *   - user is owner of this folder (or any ancestor)
 */
function inUserFolderScope(string $folder, string $u, array $perms, bool $isAdmin): bool {
  if ($isAdmin) return true;
  //$folderOnly = !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']);
  //if (!$folderOnly) return true;

  $f = ACL::normalizeFolder($folder);
  if ($f === 'root' || $f === '') {
    // folder-only users cannot act on root unless they own a subfolder (handled below)
    return isOwnerOrAncestorOwner($u, $perms, $f);
  }

  if ($f === $u || str_starts_with($f, $u . '/')) return true;

  // Treat ownership as in-scope
  return isOwnerOrAncestorOwner($u, $perms, $f);
}

// --- inputs ---
$folder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'root';

// validate folder path
if ($folder !== 'root') {
  $parts = array_filter(explode('/', trim($folder, "/\\ ")));
  if (empty($parts)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid folder name.']);
    exit;
  }
  foreach ($parts as $seg) {
    if (!preg_match(REGEX_FOLDER_NAME, $seg)) {
      http_response_code(400);
      echo json_encode(['error' => 'Invalid folder name.']);
      exit;
    }
  }
  $folder = implode('/', $parts);
}

// --- user + flags ---
$perms       = loadPermsFor($username);
$isAdmin     = ACL::isAdmin($perms);
$readOnly    = !empty($perms['readOnly']);
$inScope     = inUserFolderScope($folder, $username, $perms, $isAdmin);

// --- ACL base abilities ---
$canViewBase   = $isAdmin || ACL::canRead($username, $perms, $folder);
$canViewOwn    = $isAdmin || ACL::canReadOwn($username, $perms, $folder);
$canWriteBase  = $isAdmin || ACL::canWrite($username, $perms, $folder);
$canShareBase  = $isAdmin || ACL::canShare($username, $perms, $folder);

$canManageBase = $isAdmin || ACL::canManage($username, $perms, $folder);

// granular base
$gCreateBase   = $isAdmin || ACL::canCreate($username, $perms, $folder);
$gRenameBase   = $isAdmin || ACL::canRename($username, $perms, $folder);
$gDeleteBase   = $isAdmin || ACL::canDelete($username, $perms, $folder);
$gMoveBase     = $isAdmin || ACL::canMove($username, $perms, $folder);
$gUploadBase   = $isAdmin || ACL::canUpload($username, $perms, $folder);
$gEditBase     = $isAdmin || ACL::canEdit($username, $perms, $folder);
$gCopyBase     = $isAdmin || ACL::canCopy($username, $perms, $folder);
$gExtractBase  = $isAdmin || ACL::canExtract($username, $perms, $folder);
$gShareFile    = $isAdmin || ACL::canShareFile($username, $perms, $folder);
$gShareFolder  = $isAdmin || ACL::canShareFolder($username, $perms, $folder);

// --- Apply scope + flags to effective UI actions ---
$canView     = $canViewBase && $inScope;              // keep scope for folder-only
$canUpload   = $gUploadBase   && !$readOnly && $inScope;
$canCreate   = $canManageBase && !$readOnly && $inScope;  // Create **folder**
$canRename   = $canManageBase && !$readOnly && $inScope;  // Rename **folder**
$canDelete   = $gDeleteBase   && !$readOnly && $inScope;
// Destination can receive items if user can create/write (or manage) here
$canReceive  = ($gUploadBase || $gCreateBase || $canManageBase) && !$readOnly && $inScope;
// Back-compat: expose as canMoveIn (used by toolbar/context-menu/drag&drop)
$canMoveIn   = $canReceive;
$canEdit     = $gEditBase     && !$readOnly && $inScope;
$canCopy     = $gCopyBase     && !$readOnly && $inScope;
$canExtract  = $gExtractBase  && !$readOnly && $inScope;

// Sharing respects scope; optionally also gate on readOnly
$canShare         = $canShareBase && $inScope;         // legacy umbrella
$canShareFileEff  = $gShareFile   && $inScope;
$canShareFoldEff  = $gShareFolder && $inScope;

// never allow destructive ops on root
$isRoot = ($folder === 'root');
if ($isRoot) {
  $canRename = false;
  $canDelete = false;
  $canShareFoldEff = false;
}

$owner = null;
try { $owner = FolderModel::getOwnerFor($folder); } catch (Throwable $e) {}

echo json_encode([
  'user'    => $username,
  'folder'  => $folder,
  'isAdmin' => $isAdmin,
  'flags'   => [
    //'folderOnly'    => !empty($perms['folderOnly']) || !empty($perms['userFolderOnly']) || !empty($perms['UserFolderOnly']),
    'readOnly'      => $readOnly,
  ],
  'owner'        => $owner,

  // viewing
  'canView'      => $canView,
  'canViewOwn'   => $canViewOwn,

  // write-ish
  'canUpload'    => $canUpload,
  'canCreate'    => $canCreate,
  'canRename'    => $canRename,
  'canDelete'    => $canDelete,
  'canMoveIn'    => $canMoveIn,
  'canEdit'      => $canEdit,
  'canCopy'      => $canCopy,
  'canExtract'   => $canExtract,

  // sharing
  'canShare'        => $canShare,          // legacy
  'canShareFile'    => $canShareFileEff,
  'canShareFolder'  => $canShareFoldEff,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);