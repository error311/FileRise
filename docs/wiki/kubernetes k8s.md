# Kubernetes / k8s deployment

FileRise runs cleanly on Kubernetes. The container needs persistent storage and standard env vars.

---

## 1) Volumes / PVCs

FileRise expects these writable paths:

- `/var/www/uploads` (file data)
- `/var/www/users` (users, admin config, Pro license)
- `/var/www/metadata` (indexes, tags, logs)

Example PVCs:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: filerise-uploads
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 200Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: filerise-users
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: filerise-metadata
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 5Gi
```

If you enable **encryption at rest**, back up `/uploads` and `/metadata` together.

---

## 2) Deployment example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: filerise
spec:
  replicas: 1
  selector:
    matchLabels:
      app: filerise
  template:
    metadata:
      labels:
        app: filerise
    spec:
      containers:
        - name: filerise
          image: error311/filerise-docker:latest
          ports:
            - containerPort: 80
          env:
            - name: TIMEZONE
              value: "America/New_York"
            - name: TOTAL_UPLOAD_SIZE
              value: "10G"
            - name: SECURE
              value: "true"
            - name: PERSISTENT_TOKENS_KEY
              value: "change_me"
            - name: SCAN_ON_START
              value: "true"
            - name: CHOWN_ON_START
              value: "true"
            # Recommended behind proxies/subpaths:
            # - name: FR_PUBLISHED_URL
            #   value: "https://example.com/files"
            # - name: FR_TRUSTED_PROXIES
            #   value: "10.0.0.0/8"
          volumeMounts:
            - name: uploads
              mountPath: /var/www/uploads
            - name: users
              mountPath: /var/www/users
            - name: metadata
              mountPath: /var/www/metadata
      volumes:
        - name: uploads
          persistentVolumeClaim:
            claimName: filerise-uploads
        - name: users
          persistentVolumeClaim:
            claimName: filerise-users
        - name: metadata
          persistentVolumeClaim:
            claimName: filerise-metadata
```

---

## 3) Ingress / reverse proxy notes

### Subpath deployments (e.g. `/files`)

For Traefik, the recommended pattern is:

- Route `PathPrefix("/files")`
- Strip `/files` before forwarding to the service
- Preserve the prefix with `X-Forwarded-Prefix`
- Set `FR_PUBLISHED_URL`

Example Traefik middleware:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: filerise-strip-files
  namespace: filerise
spec:
  stripPrefix:
    prefixes:
      - /files
```

IngressRoute example:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: filerise
  namespace: filerise
spec:
  entryPoints:
    - https
  routes:
    - match: Host(`example.com`) && PathPrefix(`/files`)
      kind: Rule
      middlewares:
        - name: filerise-strip-files
      services:
        - name: filerise
          port: 8080
  tls:
    secretName: example-tls
```

Recommended env:

```yaml
- name: FR_PUBLISHED_URL
  value: "https://example.com/files"
```

If your proxy cannot send `X-Forwarded-Prefix`, set `FR_BASE_PATH=/files` instead.

---

## 4) Encryption at rest (k8s considerations)

- Encryption keys live in `/metadata`
- Encrypted content lives in `/uploads`
- Back up both PVCs together

Encrypted folders disable:
- WebDAV
- Sharing
- ZIP create/extract
- ONLYOFFICE editing

---

## 5) Operational tips

- Use a dedicated uploads PVC (avoid mounting massive share roots).
- `SCAN_ON_START=true` for first run; set `false` for normal restarts.
- `CHOWN_ON_START=true` is helpful initially; disable after perms are correct.
- Single replica is recommended (FileRise assumes a single active instance).
