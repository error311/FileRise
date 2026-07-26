<?php

declare(strict_types=1);

$baseDir = dirname(__DIR__, 2);

$GLOBALS['onlyOfficeRegressionHeaders'] = [];
if (!function_exists('getallheaders')) {
    function getallheaders(): array
    {
        return $GLOBALS['onlyOfficeRegressionHeaders'];
    }
}

putenv('PERSISTENT_TOKENS_KEY=test_persistent_tokens_key_32bytes!');
require_once $baseDir . '/config/config.php';
require_once $baseDir . '/src/FileRise/Http/Controllers/OnlyOfficeController.php';

function onlyOfficeJwtFailIf(bool $condition, string $message, array &$errors): void
{
    if ($condition) {
        $errors[] = $message;
    }
}

function onlyOfficeJwtB64u(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function onlyOfficeJwtCreate(array $payload, string $secret, string $algorithm = 'HS256'): string
{
    $header = onlyOfficeJwtB64u((string)json_encode(['alg' => $algorithm, 'typ' => 'JWT']));
    $body = onlyOfficeJwtB64u((string)json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signature = onlyOfficeJwtB64u(hash_hmac('sha256', $header . '.' . $body, $secret, true));
    return $header . '.' . $body . '.' . $signature;
}

$errors = [];
$secret = 'onlyoffice-regression-secret';
$controller = new \FileRise\Http\Controllers\OnlyOfficeController();
$reflection = new ReflectionClass($controller);
$trustedBody = $reflection->getMethod('trustedCallbackBody');
$tokenFromRequest = $reflection->getMethod('callbackJwtTokenFromRequest');
$allowUnsigned = $reflection->getMethod('allowUnsignedCallbacks');

putenv('ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS');
$rawBody = ['status' => 2, 'url' => 'https://docs.example.test/save.docx'];

onlyOfficeJwtFailIf(
    $allowUnsigned->invoke($controller) !== false,
    'Strict callback JWT enforcement should be enabled by default',
    $errors
);
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $rawBody, $secret) !== null,
    'A missing callback JWT should fail closed by default',
    $errors
);

putenv('ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS=1');
onlyOfficeJwtFailIf(
    $allowUnsigned->invoke($controller) !== true,
    'The explicit compatibility override should be recognized',
    $errors
);
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $rawBody, $secret) !== $rawBody,
    'The explicit compatibility override should accept an unsigned callback body',
    $errors
);

$invalidBody = $rawBody;
$invalidBody['token'] = 'invalid.jwt.value';
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $invalidBody, $secret) !== null,
    'The compatibility override must not accept a supplied invalid JWT',
    $errors
);

putenv('ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS');
$bodyToken = onlyOfficeJwtCreate($rawBody, $secret);
$signedBody = $rawBody;
$signedBody['token'] = $bodyToken;
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $signedBody, $secret) !== $rawBody,
    'A valid JWT in the callback body should be accepted',
    $errors
);

$wrappedPayload = ['payload' => $rawBody];
$headerToken = onlyOfficeJwtCreate($wrappedPayload, $secret);
$GLOBALS['onlyOfficeRegressionHeaders'] = ['Authorization' => 'Bearer ' . $headerToken];
onlyOfficeJwtFailIf(
    $tokenFromRequest->invoke($controller, $rawBody) !== $headerToken,
    'A Bearer token in the Authorization header should be detected',
    $errors
);
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $rawBody, $secret) !== $rawBody,
    'A valid wrapped JWT in the Authorization header should be accepted',
    $errors
);

$wrongSecretToken = onlyOfficeJwtCreate($wrappedPayload, 'wrong-secret');
$GLOBALS['onlyOfficeRegressionHeaders'] = ['Authorization' => 'Bearer ' . $wrongSecretToken];
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $rawBody, $secret) !== null,
    'A callback JWT signed with the wrong secret should be rejected',
    $errors
);

$wrongAlgorithmToken = onlyOfficeJwtCreate($wrappedPayload, $secret, 'HS512');
$GLOBALS['onlyOfficeRegressionHeaders'] = ['Authorization' => 'Bearer ' . $wrongAlgorithmToken];
onlyOfficeJwtFailIf(
    $trustedBody->invoke($controller, $rawBody, $secret) !== null,
    'A callback JWT declaring a non-HS256 algorithm should be rejected',
    $errors
);

$bodyWins = $rawBody;
$bodyWins['token'] = $bodyToken;
onlyOfficeJwtFailIf(
    $tokenFromRequest->invoke($controller, $bodyWins) !== $bodyToken,
    'A callback body token should take precedence over a header token',
    $errors
);

$GLOBALS['onlyOfficeRegressionHeaders'] = [];
putenv('ONLYOFFICE_ALLOW_UNSIGNED_CALLBACKS');

if ($errors) {
    fwrite(STDERR, "ONLYOFFICE callback JWT regression failures:\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}

echo "ONLYOFFICE callback JWT regressions passed\n";
