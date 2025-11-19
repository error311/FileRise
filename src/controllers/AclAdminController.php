<?php
// src/controllers/AclAdminController.php
require_once __DIR__ . '/../../config/config.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';
require_once PROJECT_ROOT . '/src/models/FolderModel.php';

class AclAdminController
{

    public function getUserGrants(string $user): array
    {
        if (!preg_match(REGEX_USER, $user)) {
            throw new InvalidArgumentException('Invalid user');
        }

        $folders = [];
        try {
            $rows = FolderModel::getFolderList();
            if (is_array($rows)) {
                foreach ($rows as $r) {
                    $f = is_array($r) ? ($r['folder'] ?? '') : (string)$r;
                    if ($f !== '') $folders[$f] = true;
                }
            }
        } catch (\Throwable $e) {
            // ignore, fall back to ACL file
        }

        if (empty($folders)) {
            $aclPath = rtrim(META_DIR, "/\\") . DIRECTORY_SEPARATOR . 'folder_acl.json';
            if (is_file($aclPath)) {
                $data = json_decode((string)@file_get_contents($aclPath), true);
                if (is_array($data['folders'] ?? null)) {
                    foreach ($data['folders'] as $name => $_) {
                        $folders[$name] = true;
                    }
                }
            }
        }

        $folderList = array_keys($folders);
        if (!in_array('root', $folderList, true)) {
            array_unshift($folderList, 'root');
        }

        $has = function(array $arr, string $u): bool {
            foreach ($arr as $x) {
                if (strcasecmp((string)$x, $u) === 0) return true;
            }
            return false;
        };

        $out = [];
        foreach ($folderList as $f) {
            $rec = ACL::explicitAll($f);

            $isOwner    = $has($rec['owners'], $user);
            $canViewAll = $isOwner || $has($rec['read'], $user);
            $canViewOwn = $has($rec['read_own'], $user);
            $canShare   = $isOwner || $has($rec['share'], $user);
            $canUpload  = $isOwner || $has($rec['write'], $user) || $has($rec['upload'], $user);

            if (
                $canViewAll || $canViewOwn || $canUpload || $canShare || $isOwner
                || $has($rec['create'], $user) || $has($rec['edit'], $user) || $has($rec['rename'], $user)
                || $has($rec['copy'], $user) || $has($rec['move'], $user) || $has($rec['delete'], $user)
                || $has($rec['extract'], $user) || $has($rec['share_file'], $user) || $has($rec['share_folder'], $user)
            ) {
                $out[$f] = [
                    'view'        => $canViewAll,
                    'viewOwn'     => $canViewOwn,
                    'write'       => $has($rec['write'], $user) || $isOwner,
                    'manage'      => $isOwner,
                    'share'       => $canShare,
                    'create'      => $isOwner || $has($rec['create'], $user),
                    'upload'      => $isOwner || $has($rec['upload'], $user) || $has($rec['write'], $user),
                    'edit'        => $isOwner || $has($rec['edit'], $user)   || $has($rec['write'], $user),
                    'rename'      => $isOwner || $has($rec['rename'], $user) || $has($rec['write'], $user),
                    'copy'        => $isOwner || $has($rec['copy'], $user)   || $has($rec['write'], $user),
                    'move'        => $isOwner || $has($rec['move'], $user)   || $has($rec['write'], $user),
                    'delete'      => $isOwner || $has($rec['delete'], $user) || $has($rec['write'], $user),
                    'extract'     => $isOwner || $has($rec['extract'], $user)|| $has($rec['write'], $user),
                    'shareFile'   => $isOwner || $has($rec['share_file'], $user) || $has($rec['share'], $user),
                    'shareFolder' => $isOwner || $has($rec['share_folder'], $user) || $has($rec['share'], $user),
                ];
            }
        }

        return $out;
    }

    public function saveUserGrantsPayload(array $payload): array
    {

        $normalizeCaps = function (array $row): array {
            $bool = function ($v) {
                return !empty($v) && $v !== 'false' && $v !== 0;
            };
            $k = [
                'view','viewOwn','upload','manage','share',
                'create','edit','rename','copy','move','delete','extract',
                'shareFile','shareFolder','write'
            ];
            $out = [];
            foreach ($k as $kk) {
                $out[$kk] = $bool($row[$kk] ?? false);
            }

            if ($out['shareFolder'] && !$out['view']) {
                $out['view'] = true;
            }
            if ($out['shareFile'] && !$out['view'] && !$out['viewOwn']) {
                $out['viewOwn'] = true;
            }

            return $out;
        };

        $sanitizeGrantsMap = function (array $grants) use ($normalizeCaps): array {
            $out = [];
            foreach ($grants as $folder => $caps) {
                if (!is_string($folder)) $folder = (string)$folder;
                if (!is_array($caps))    $caps   = [];
                $out[$folder] = $normalizeCaps($caps);
            }
            return $out;
        };

        $validUser = function (string $u): bool {
            return ($u !== '' && preg_match(REGEX_USER, $u));
        };

        // Single-user mode
        if (isset($payload['user'], $payload['grants']) && is_array($payload['grants'])) {
            $user = trim((string)$payload['user']);
            if (!$validUser($user)) {
                throw new InvalidArgumentException('Invalid user');
            }

            $grants = $sanitizeGrantsMap($payload['grants']);

            return ACL::applyUserGrantsAtomic($user, $grants);
        }

        // Batch mode
        if (isset($payload['changes']) && is_array($payload['changes'])) {
            $updated = [];
            foreach ($payload['changes'] as $chg) {
                if (!is_array($chg)) continue;
                $user = trim((string)($chg['user'] ?? ''));
                $gr   = $chg['grants'] ?? null;
                if (!$validUser($user) || !is_array($gr)) continue;

                try {
                    $res = ACL::applyUserGrantsAtomic($user, $sanitizeGrantsMap($gr));
                    $updated[$user] = $res['updated'] ?? [];
                } catch (\Throwable $e) {
                    $updated[$user] = ['error' => $e->getMessage()];
                }
            }
            return ['ok' => true, 'updated' => $updated];
        }

        throw new InvalidArgumentException('Invalid payload: expected {user,grants} or {changes:[{user,grants}]}');
    }
}