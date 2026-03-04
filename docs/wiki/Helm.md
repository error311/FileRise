# Helm Chart

There's an unofficial helm chart that may be used to deploy FileRise

## Installation

### Add repository

```bash
helm repo add dofevine https://dofevine.github.io/charts/
```

### Basic Installation

```bash
helm install filerise dofevine/FileRise
```

### Install with custom values

```bash
helm install filerise dofevine/FileRise -f values
```

### Remove installed release

```bash
helm delete filerise 
```

## Configuration

### Environment Variables

The chart supports any variable that's present on FileRise

```yaml
env:
  TIMEZONE: "America/New_York"
  TOTAL_UPLOAD_SIZE: "10G"
  SECURE: "false"
  PERSISTENT_TOKENS_KEY: "change_me"
  SCAN_ON_START: "true"
  CHOWN_ON_START: "true"
  # HTTP_PORT: "80"
  # FR_BASE_PATH: "/files"
  # FR_PUBLISHED_URL: "http://0.0.0.0/files"
  # FR_TRUSTED_PROXIES: "10.0.0.0/8"
```

### Storage

The chart deppends on a storage class configured on the cluster. If the storage class is not defined, the default will be used.

```yaml
storage:
  keep: true # set this false if you would like to also delete the pvc when deleting the release
  storageClass: ""
  metadata:
    size: 1Gi
  users:
    size: 1Gi
  uploads:
    size: 5Gi
```

### Ingress

The chart was tested using [Kong Ingress Controller](https://github.com/Kong/charts). It should work with other ingress controllers. If using subpath it's important to set ```FR_PUBLISHED_URL``` and ```FR_BASE_PATH```

```yaml
ingress:
  enabled: true
  className: kong
  annotations:
    konghq.com/preserve-host: "true" # this tells the ingress to send the host to FileRise
    konghq.com/strip-path: "true" # this removes the subpath from the requisition
  hosts:
  - host: ""
    paths:
    - path: /files/
      pathType: Prefix
```

### Service

It's possible to connect direct to the service if not using a ingress

```yaml
service:
  type: ClusterIP # or loadbalancer if there's a loadbalancer available
```

If not using a loadbalancer, you can connect using kubectl

```bash
kubectl port-forward service/filerise 8080:80
```

## Full Example

Here is a working example

```yaml
env:
  TIMEZONE: "America/New_York"
  TOTAL_UPLOAD_SIZE: "10G"
  SECURE: "false"
  PERSISTENT_TOKENS_KEY: "change_me"
  SCAN_ON_START: "true"
  CHOWN_ON_START: "true"
  FR_BASE_PATH: "/files/"
  FR_PUBLISHED_URL: "http://0.0.0.0/files/" # change it for server IP or dns
ingress:
  enabled: true
  className: kong
  annotations:
    konghq.com/preserve-host: "true"
    konghq.com/strip-path: "true"
  hosts:
  - host: "" # add dns host if necessary
    paths:
    - path: /files/
      pathType: Prefix
```

## Deployment suggestions

- Change `PERSISTENT_TOKENS_KEY`
- Define resource limits and requests
- Use a reliable StorageClass
- Configure proper backups for persistent volumes

## Full Configuration Table

Below are the main configurable parameters available in `values.yaml`.

| Parameter | Description | Default |
| ------------ | ------------ | ---------- |
| `replicaCount` | Number of Deployment replicas | `1` |
| `image.repository` | Container image repository | `error311/filerise-docker` |
| `image.tag` | Image tag | `v3.5.2` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `imagePullSecrets` | Secrets for private repository | `[]` |
| `serviceAccount.create` | Create a ServiceAccount | `false` |
| `serviceAccount.name` | Custom name | `""` |
| `serviceAccount.automount` | Automount API credentials | `true` |
| `podAnnotations` | Extra pod annotations | `{}` |
| `podLabels` | Extra pod labels | `{}` |
| `service.type` | Kubernetes Service type | `ClusterIP` |
| `service.port` | Service port | `8080` |
| `ingress.enabled` | Enable Ingress | `false` |
| `ingress.className` | Ingress class | `""` |
| `ingress.hosts` | Configured hosts | `""` |
| `ingress.tls` | TLS configuration | `[]` |
| `httpRoute.enabled` | Enable HTTPRoute | `false` |
| `httpRoute.annotations` | Annotations | `{}` |
| `httpRoute.parentRefs` | Target Gateway | `{}` |
| `httpRoute.hostnames` | Hostnames | `[]` |
| `httpRoute.rules` | Routing rules | `{}` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Minimum replicas | `1` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | CPU utilization target | `80` |
| `autoscaling.targetMemoryUtilizationPercentage` | Memory utilization target | `2Gi` |
| `volumes` | list of volumes. See values.yaml | [] |
| `storage.keep` | Enable helm resource policy keep | `true` |
| `storage.storageClass` | Storage Class name. If empty will use cluster default | "" |
| `storage.metadata.size` | Size of pvc used for metadata | [] |
| `storage.users.size` | Size of pvc used for metadata | [] |
| `storage.uploads.size` | Size of pvc used for metadata | [] |
| `nodeselector` | Definition of the node that the pod will run. See [k8s docs](https://kubernetes.io/docs/tasks/configure-pod-container/assign-pods-nodes/) | `{}` |
| `affinity` | Definition of pod affinity and anti-affity. See [k8s docs](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/) | `{}` |
