{{- define "module.labels" -}}
app.kubernetes.io/name: {{ .Values.name }}
app.kubernetes.io/part-of: intelligent-eu-billing-and-payment
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
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: {{ .Values.name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: {{ .Values.port }}
          envFrom:
            - secretRef:
                name: {{ .Values.name }}
                optional: true
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
    {{- if .Values.namespaceIngress }}
    - from:
        - podSelector: {}
      ports:
        - port: {{ .Values.port }}
          protocol: TCP
    {{- end }}
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
{{- end -}}
