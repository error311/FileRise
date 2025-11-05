<?php
// src/controllers/MediaController.php
declare(strict_types=1);

require_once PROJECT_ROOT . '/config/config.php';
require_once PROJECT_ROOT . '/src/models/MediaModel.php';
require_once PROJECT_ROOT . '/src/lib/ACL.php';

class MediaController
{
    private function jsonStart(): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        header('Content-Type: application/json; charset=utf-8');
        set_error_handler(function ($severity, $message, $file, $line) {
            if (!(error_reporting() & $severity)) return;
            throw new ErrorException($message, 0, $severity, $file, $line);
        });
    }
    private function jsonEnd(): void { restore_error_handler(); }
    private function out($payload, int $status=200): void {
        http_response_code($status);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    private function readJson(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
    private function requireAuth(): ?string {
        if (empty($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
            $this->out(['error'=>'Unauthorized'], 401); return 'no';
        }
        return null;
    }
    private function checkCsrf(): ?string {
        $headers = function_exists('getallheaders') ? array_change_key_case(getallheaders(), CASE_LOWER) : [];
        $received = $headers['x-csrf-token'] ?? '';
        if (!isset($_SESSION['csrf_token']) || $received !== $_SESSION['csrf_token']) {
            $this->out(['error'=>'Invalid CSRF token'], 403); return 'no';
        }
        return null;
    }
    private function normalizeFolder($f): string {
        $f = trim((string)$f);
        return ($f==='' || strtolower($f)==='root') ? 'root' : $f;
    }
    private function validFolder($f): bool {
        return $f==='root' || (bool)preg_match(REGEX_FOLDER_NAME, $f);
    }
    private function validFile($f): bool {
        $f = basename((string)$f);
        return $f !== '' && (bool)preg_match(REGEX_FILE_NAME, $f);
    }
    private function enforceRead(string $folder, string $username): ?string {
        $perms = loadUserPermissions($username) ?: [];
        return ACL::canRead($username, $perms, $folder) ? null : "Forbidden";
    }

    /** POST /api/media/updateProgress.php */
    public function updateProgress(): void {
        $this->jsonStart();
        try {
            if ($this->requireAuth()) return;
            if ($this->checkCsrf())    return;

            $u = $_SESSION['username'] ?? '';
            $d = $this->readJson();
            $folder = $this->normalizeFolder($d['folder'] ?? 'root');
            $file   = (string)($d['file'] ?? '');
            $seconds   = isset($d['seconds'])  ? floatval($d['seconds'])  : 0.0;
            $duration  = isset($d['duration']) ? floatval($d['duration']) : null;
            $completed = isset($d['completed']) ? (bool)$d['completed'] : null;
            $clear     = isset($d['clear']) ? (bool)$d['clear'] : false;

            if (!$this->validFolder($folder) || !$this->validFile($file)) {
                $this->out(['error'=>'Invalid folder/file'], 400); return;
            }
            if ($this->enforceRead($folder, $u)) { $this->out(['error'=>'Forbidden'], 403); return; }

            if ($clear) {
                $ok = MediaModel::clearProgress($u, $folder, $file);
                $this->out(['success'=>$ok]); return;
            }

            $row = MediaModel::saveProgress($u, $folder, $file, $seconds, $duration, $completed);
            $this->out(['success'=>true, 'state'=>$row]);
        } catch (Throwable $e) {
            error_log('MediaController::updateProgress: '.$e->getMessage());
            $this->out(['error'=>'Internal server error'], 500);
        } finally { $this->jsonEnd(); }
    }

    /** GET /api/media/getProgress.php?folder=…&file=… */
    public function getProgress(): void {
        $this->jsonStart();
        try {
            if ($this->requireAuth()) return;
            $u = $_SESSION['username'] ?? '';
            $folder = $this->normalizeFolder($_GET['folder'] ?? 'root');
            $file   = (string)($_GET['file'] ?? '');

            if (!$this->validFolder($folder) || !$this->validFile($file)) {
                $this->out(['error'=>'Invalid folder/file'], 400); return;
            }
            if ($this->enforceRead($folder, $u)) { $this->out(['error'=>'Forbidden'], 403); return; }

            $row = MediaModel::getProgress($u, $folder, $file);
            $this->out(['state'=>$row]);
        } catch (Throwable $e) {
            error_log('MediaController::getProgress: '.$e->getMessage());
            $this->out(['error'=>'Internal server error'], 500);
        } finally { $this->jsonEnd(); }
    }

    /** GET /api/media/getViewedMap.php?folder=…  (optional, for badges) */
    public function getViewedMap(): void {
        $this->jsonStart();
        try {
            if ($this->requireAuth()) return;
            $u = $_SESSION['username'] ?? '';
            $folder = $this->normalizeFolder($_GET['folder'] ?? 'root');

            if (!$this->validFolder($folder)) {
                $this->out(['error'=>'Invalid folder'], 400); return;
            }
            if ($this->enforceRead($folder, $u)) { $this->out(['error'=>'Forbidden'], 403); return; }

            $map = MediaModel::getFolderMap($u, $folder);
            $this->out(['map'=>$map]);
        } catch (Throwable $e) {
            error_log('MediaController::getViewedMap: '.$e->getMessage());
            $this->out(['error'=>'Internal server error'], 500);
        } finally { $this->jsonEnd(); }
    }
}