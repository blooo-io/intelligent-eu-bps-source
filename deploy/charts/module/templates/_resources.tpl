{{- define "module.labels" -}}
app.kubernetes.io/name: {{ .Values.name }}
app.kubernetes.io/part-of: intelligent-eu-bps-source
app.kubernetes.io/component: {{ .Values.component }}
{{- end -}}

{{- define "module.resources" -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.name }}
  labels:
    {{- include "module.labels" . | nindent 4 }}
automountServiceAccountToken: false
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.name }}
  labels:
    {{- include "module.labels" . | nindent 4 }}
spec:
  selector:
    app.kubernetes.io/name: {{ .Values.name }}
  ports:
    - name: http
      port: {{ .Values.port }}
      targetPort: http
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.name }}
  labels:
    {{- include "module.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Values.name }}
  template:
    metadata:
      labels:
        {{- include "module.labels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ .Values.name }}
      automountServiceAccountToken: false
      {{- if .Values.image.pullSecret }}
      imagePullSecrets:
        - name: {{ .Values.image.pullSecret }}
      {{- end }}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: {{ .Values.name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy | default "IfNotPresent" }}
          {{- with index (.Values.diagnosticCommands | default dict) .Values.name }}
          args: {{- toYaml . | nindent 12 }}
          {{- end }}
          ports:
            - name: http
              containerPort: {{ .Values.port }}
          envFrom:
            - secretRef:
                name: {{ .Values.name }}
                optional: true
            # INT-213 — DATABASE_URL from outbox-bootstrap Job (CNPG role → int-apps).
            - secretRef:
                name: {{ .Values.name }}-database
                optional: true
            # INT-338 — NATS account user/password (NATS_USER / NATS_PASSWORD).
            - secretRef:
                name: nats-client
                optional: true
          {{- with .Values.env }}
          env:
            {{- range $k, $v := . }}
            - name: {{ $k }}
              value: {{ $v | quote }}
            {{- end }}
          {{- end }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          livenessProbe:
            httpGet:
              path: /health
              port: http
          readinessProbe:
            httpGet:
              path: /health
              port: http
      volumes:
        - name: tmp
          emptyDir: {}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ .Values.name }}
  labels:
    {{- include "module.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: {{ .Values.name }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress
      ports:
        - port: {{ .Values.port }}
          protocol: TCP
    {{- range .Values.ingressFrom }}
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: {{ . }}
      ports:
        - port: {{ $.Values.port }}
          protocol: TCP
    {{- end }}
  # INT-287 — peers only via ingressFrom (no namespace-wide ingress).
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ .Values.dataNamespace }}
      ports:
        - port: 5432
          protocol: TCP
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: nats
      ports:
        - port: 4222
          protocol: TCP
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: temporal
      ports:
        - port: 7233
          protocol: TCP
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: observability
      ports:
        - port: 4317
          protocol: TCP
        - port: 4318
          protocol: TCP
    {{- range .Values.egressModules }}
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: {{ . }}
      ports:
        - port: {{ $.Values.port }}
          protocol: TCP
    {{- end }}
    {{- if .Values.keycloakEgress }}
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: keycloak
      ports:
        # INT-218 — Keycloakx HTTP is :80; keep 8080/443 for legacy / TLS.
        - port: 80
          protocol: TCP
        - port: 443
          protocol: TCP
        - port: 8080
          protocol: TCP
    {{- end }}
    {{- if .Values.stripeEgress }}
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - port: 443
          protocol: TCP
    {{- end }}
{{- /* INT-249 — skip OpenBao sync when the workload needs no secret (e.g. docs-portal). */ -}}
{{- if ne .Values.externalSecret false }}
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ .Values.name }}
  labels:
    {{- include "module.labels" . | nindent 4 }}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: openbao
    kind: ClusterSecretStore
  target:
    name: {{ .Values.name }}
    creationPolicy: Owner
  dataFrom:
    - extract:
        key: {{ .Values.environment }}/{{ .Values.name }}
{{- /* One owner per namespace — every module reads Secret nats-client. */ -}}
{{- if eq .Values.name "invoicing" }}
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: nats-client
  labels:
    {{- include "module.labels" . | nindent 4 }}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: openbao
    kind: ClusterSecretStore
  target:
    name: nats-client
    creationPolicy: Owner
  data:
    - secretKey: NATS_USER
      remoteRef:
        key: platform/nats/accounts
        property: user
    - secretKey: NATS_PASSWORD
      remoteRef:
        key: platform/nats/accounts
        property: password
{{- end }}
{{- end }}
{{- end -}}
