# Nginx setup for FileRise

This guide covers running FileRise with Nginx:

- Directly with PHP-FPM
- As a reverse proxy in front of Docker/Apache

FileRise supports subpaths when configured correctly.

---

## Prerequisites

- Nginx
- PHP-FPM 8.3+
- FileRise installed (DocumentRoot set to `public/`)

---

## Option A: Nginx + PHP-FPM (root install)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/FileRise/public;
    index index.php index.html;

    client_max_body_size 0;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # Block direct access to uploads/users/metadata (serve files via API)
    location ~* ^/(uploads|users|metadata)(/|$) {
        return 403;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
    }

    location ~* ^/\.git {
        deny all;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

Notes:
- API docs are served at `api.php` and require login.
- If you are behind TLS, set `SECURE=true`.

---

## Option B: Nginx + PHP-FPM (subpath install)

If FileRise is served directly by Nginx (no proxy), you can run it under a subpath like `/files`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/FileRise/public;
    index index.php index.html;

    location = /files { return 301 /files/; }

    location /files/ {
        try_files $uri $uri/ /files/index.php?$query_string;
    }

    # Block direct access to uploads/users/metadata (serve files via API)
    location ~* ^/(uploads|users|metadata)(/|$) {
        return 403;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
    }
}
```

Recommended env:

```
FR_PUBLISHED_URL=https://yourdomain.com/files
```

---

## Option C: Nginx reverse proxy to Docker/Apache

When proxying to a container (Apache in Docker), **strip the prefix** and send `X-Forwarded-Prefix` so FileRise can generate correct URLs.

```nginx
location /files/ {
    rewrite ^/files/(.*)$ /$1 break;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Prefix /files;
}
```

Recommended env:

```
FR_PUBLISHED_URL=https://yourdomain.com/files
```

---

## Common pitfalls

- DocumentRoot must point to `public/` (not the repo root).
- For reverse proxy + subpath, make sure the prefix is stripped and `X-Forwarded-Prefix` is set.
- Set `client_max_body_size` for large uploads.
