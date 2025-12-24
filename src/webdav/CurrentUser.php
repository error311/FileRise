<?php
// src/webdav/CurrentUser.php
namespace FileRise\WebDAV;

/**
 * Singleton holder for the current WebDAV username.
 */
class CurrentUser {
    private static string $user = '';
    public static function set(string $u): void {
        self::$user = $u;
    }
    public static function get(): string {
        return self::$user;
    }
}
