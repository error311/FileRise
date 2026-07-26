<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);
$tmpBase = sys_get_temp_dir() . '/filerise_oidc_binding_' . bin2hex(random_bytes(6));
$uploadDir = $tmpBase . '/uploads/';
$usersDir = $tmpBase . '/users/';
$metadataDir = $tmpBase . '/metadata/';
$sessionDir = $tmpBase . '/sessions/';

function oidcBindingFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function oidcBindingRmTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }
    foreach (array_diff(scandir($path) ?: [], ['.', '..']) as $item) {
        oidcBindingRmTree($path . DIRECTORY_SEPARATOR . $item);
    }
    @rmdir($path);
}

try {
    @mkdir($uploadDir, 0775, true);
    @mkdir($usersDir, 0700, true);
    @mkdir($metadataDir, 0775, true);
    @mkdir($sessionDir, 0700, true);
    session_save_path($sessionDir);

    putenv('FR_TEST_UPLOAD_DIR=' . $uploadDir);
    putenv('FR_TEST_USERS_DIR=' . $usersDir);
    putenv('FR_TEST_META_DIR=' . $metadataDir);
    putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
    ini_set('error_log', $tmpBase . '/php-error.log');

    require_once $baseDir . '/config/config.php';

    class OidcIdentityTestController extends \FileRise\Http\Controllers\AuthController
    {
        public function resolveIdentity($userinfo, $idTokenClaims, array $cfg): array
        {
            return $this->resolveOidcIdentityClaims($userinfo, $idTokenClaims, $cfg);
        }

        public function recentUsername(): ?string
        {
            return $this->getRecentlyAuthenticatedUsername();
        }
    }

    $errors = [];
    $controller = new OidcIdentityTestController();
    $cfg = ['oidc' => ['providerUrl' => 'https://issuer.example.test/']];

    $_SESSION = [
        'authenticated' => true,
        'username' => 'admin',
    ];
    oidcBindingFailIf(
        $controller->recentUsername() !== null,
        'A session without full-authentication time was allowed to link an OIDC identity.',
        $errors
    );
    $_SESSION['authenticated_at'] = time() - 301;
    oidcBindingFailIf(
        $controller->recentUsername() !== null,
        'A stale session was allowed to link an OIDC identity.',
        $errors
    );
    $_SESSION['authenticated_at'] = time();
    oidcBindingFailIf(
        $controller->recentUsername() !== 'admin',
        'A recently fully authenticated session could not link an OIDC identity.',
        $errors
    );

    $unverifiedEmail = $controller->resolveIdentity(
        (object)[
            'sub' => 'subject-email-unverified',
            'email' => 'admin',
            'email_verified' => false,
        ],
        (object)['iss' => 'https://issuer.example.test/', 'sub' => 'subject-email-unverified'],
        $cfg
    );
    oidcBindingFailIf(
        ($unverifiedEmail['suggestedUsername'] ?? '') === 'admin',
        'Unverified email was accepted as an OIDC username.',
        $errors
    );

    $verifiedEmail = $controller->resolveIdentity(
        (object)[
            'sub' => 'subject-email-verified',
            'email' => 'verified@example.test',
            'email_verified' => true,
        ],
        (object)['iss' => 'https://issuer.example.test/', 'sub' => 'subject-email-verified'],
        $cfg
    );
    oidcBindingFailIf(
        ($verifiedEmail['suggestedUsername'] ?? '') !== 'verified@example.test',
        'Verified email was not available as a new-account username.',
        $errors
    );

    $preferred = $controller->resolveIdentity(
        (object)[
            'sub' => 'subject-preferred',
            'preferred_username' => 'friendly-name',
            'email' => 'ignored@example.test',
            'email_verified' => false,
        ],
        (object)['iss' => 'https://issuer.example.test/', 'sub' => 'subject-preferred'],
        $cfg
    );
    oidcBindingFailIf(
        ($preferred['suggestedUsername'] ?? '') !== 'friendly-name',
        'Preferred username was not retained as a new-account display name.',
        $errors
    );

    $mismatchedSubject = $controller->resolveIdentity(
        (object)['sub' => 'userinfo-sub'],
        (object)['iss' => 'https://issuer.example.test/', 'sub' => 'id-token-sub'],
        $cfg
    );
    oidcBindingFailIf(
        !isset($mismatchedSubject['error']),
        'Mismatched ID-token and UserInfo subjects were accepted.',
        $errors
    );

    $usersFile = $usersDir . 'users.txt';
    file_put_contents(
        $usersFile,
        implode(PHP_EOL, [
            'admin:' . password_hash('AdminPass123!', PASSWORD_BCRYPT) . ':1',
            'alice:' . password_hash('AlicePass123!', PASSWORD_BCRYPT) . ':0',
        ]) . PHP_EOL,
        LOCK_EX
    );

    $attackerCollision = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'ADMIN',
        true,
        'https://issuer.example.test/',
        'attacker-subject'
    );
    oidcBindingFailIf(
        empty($attackerCollision['linkRequired'])
            || ($attackerCollision['username'] ?? '') !== 'admin'
            || isset($attackerCollision['success']),
        'An unbound OIDC identity did not require proof of the existing admin account.',
        $errors
    );
    oidcBindingFailIf(
        \FileRise\Domain\AuthModel::getUserRole('admin') !== '1',
        'Rejected OIDC collision modified the local admin account.',
        $errors
    );

    $_SESSION = [
        'authenticated' => true,
        'authenticated_at' => time() - 600,
        'username' => 'someone-else',
        'isAdmin' => false,
    ];
    $linkStarted = \FileRise\Support\OidcAccountLinker::begin(
        'https://issuer.example.test/',
        'admin-legitimate-subject',
        'admin',
        true,
        ['frp_staff']
    );
    oidcBindingFailIf(!$linkStarted, 'A valid guided OIDC account link could not be started.', $errors);
    oidcBindingFailIf(
        isset($_SESSION['authenticated']) || isset($_SESSION['username']),
        'Starting a guided OIDC account link retained an unrelated authenticated identity.',
        $errors
    );
    oidcBindingFailIf(
        \FileRise\Support\OidcAccountLinker::getPendingUsername() !== 'admin',
        'Guided OIDC account link did not retain its server-side target.',
        $errors
    );
    $unconfirmedLink = \FileRise\Support\OidcAccountLinker::complete('admin');
    oidcBindingFailIf(
        !isset($unconfirmedLink['error']),
        'Guided OIDC account link completed without fresh local authentication.',
        $errors
    );
    oidcBindingFailIf(
        \FileRise\Support\OidcAccountLinker::confirmLocalAuthentication('alice'),
        'A different local account confirmed the pending OIDC link.',
        $errors
    );
    $_SESSION['pending_oidc_account_link']['created_at'] = time() - 301;
    oidcBindingFailIf(
        \FileRise\Support\OidcAccountLinker::getPendingUsername() !== null,
        'Expired guided OIDC account-link state remained usable.',
        $errors
    );

    \FileRise\Support\OidcAccountLinker::begin(
        'https://issuer.example.test/',
        'admin-legitimate-subject',
        'admin',
        true,
        ['frp_staff']
    );
    oidcBindingFailIf(
        !\FileRise\Support\OidcAccountLinker::confirmLocalAuthentication('admin'),
        'Fresh local authentication did not confirm its exact OIDC link target.',
        $errors
    );
    $completedLink = \FileRise\Support\OidcAccountLinker::complete('admin');
    oidcBindingFailIf(
        ($completedLink['username'] ?? '') !== 'admin',
        'Confirmed guided OIDC account link did not bind the existing account.',
        $errors
    );
    oidcBindingFailIf(
        \FileRise\Support\OidcAccountLinker::getPendingUsername() !== null,
        'Completed guided OIDC account-link state was reusable.',
        $errors
    );
    $replayedLink = \FileRise\Support\OidcAccountLinker::complete('admin');
    oidcBindingFailIf(
        !isset($replayedLink['error']),
        'Completed guided OIDC account link was accepted a second time.',
        $errors
    );

    $created = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'bob',
        false,
        'https://issuer.example.test/',
        'bob-subject'
    );
    oidcBindingFailIf(
        ($created['username'] ?? '') !== 'bob'
            || \FileRise\Domain\AuthModel::getUserRole('bob') !== '0',
        'A new OIDC identity was not safely auto-provisioned.',
        $errors
    );

    $stableBinding = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'admin',
        true,
        'https://issuer.example.test/',
        'bob-subject'
    );
    oidcBindingFailIf(
        ($stableBinding['username'] ?? '') !== 'bob',
        'A mutable username claim changed an existing OIDC identity binding.',
        $errors
    );
    oidcBindingFailIf(
        \FileRise\Domain\AuthModel::getUserRole('bob') !== '1',
        'IdP admin-group synchronization did not apply to the bound account.',
        $errors
    );

    $secondIdentityCollision = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'bob',
        false,
        'https://issuer.example.test/',
        'different-bob-subject'
    );
    oidcBindingFailIf(
        !isset($secondIdentityCollision['error']),
        'A second OIDC identity attached to an already bound local account.',
        $errors
    );

    $linked = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'ALICE',
        false,
        'https://issuer.example.test/',
        'alice-subject',
        'alice'
    );
    oidcBindingFailIf(
        ($linked['username'] ?? '') !== 'alice',
        'A recently authenticated local user could not link their OIDC identity.',
        $errors
    );

    $linkedClaimChanged = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'admin',
        false,
        'https://issuer.example.test/',
        'alice-subject'
    );
    oidcBindingFailIf(
        ($linkedClaimChanged['username'] ?? '') !== 'alice',
        'A linked OIDC identity followed a changed preferred_username claim.',
        $errors
    );

    $otherIssuer = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'alice',
        false,
        'https://other-issuer.example.test/',
        'alice-subject'
    );
    oidcBindingFailIf(
        !isset($otherIssuer['error']),
        'The same subject from another issuer reused an existing binding.',
        $errors
    );

    $bindingFile = $usersDir . 'oidc_identities.json';
    $bindingContents = is_file($bindingFile) ? (string)file_get_contents($bindingFile) : '';
    oidcBindingFailIf($bindingContents === '', 'OIDC identity binding store was not created.', $errors);
    oidcBindingFailIf(
        str_contains($bindingContents, 'bob-subject')
            || str_contains($bindingContents, 'alice-subject')
            || str_contains($bindingContents, 'admin-legitimate-subject')
            || str_contains($bindingContents, 'issuer.example.test'),
        'OIDC identity binding store exposed raw issuer or subject identifiers.',
        $errors
    );

    oidcBindingFailIf(
        !\FileRise\Domain\AuthModel::removeOidcBindingsForUser('alice'),
        'OIDC identity bindings could not be removed with their local user.',
        $errors
    );
    $bindingContents = (string)file_get_contents($bindingFile);
    oidcBindingFailIf(
        str_contains($bindingContents, '"username": "alice"'),
        'Deleted local user retained an OIDC identity binding.',
        $errors
    );

    file_put_contents($bindingFile, '{"version":1,"identities":', LOCK_EX);
    $corruptStoreResult = \FileRise\Domain\AuthModel::ensureLocalOidcUser(
        'charlie',
        false,
        'https://issuer.example.test/',
        'charlie-subject'
    );
    oidcBindingFailIf(
        !isset($corruptStoreResult['error'])
            || \FileRise\Domain\AuthModel::getUserRole('charlie') !== null,
        'Corrupt OIDC identity state did not fail closed.',
        $errors
    );

    if ($errors !== []) {
        fwrite(STDERR, "FAIL OIDC identity binding regressions:\n- " . implode("\n- ", $errors) . "\n");
        exit(1);
    }

    fwrite(STDOUT, "PASS OIDC identity binding regressions\n");
} finally {
    oidcBindingRmTree($tmpBase);
}
