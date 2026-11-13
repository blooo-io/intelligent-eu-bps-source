{{- /*
  INT-380 — the CNPG operator polls each instance manager status endpoint.
  Without it the Cluster reports "HTTP communication issue" and cannot drive
  failover or rolling updates.
*/ -}}
{{- define "platform-network-policies.cnpgOperatorIngress" -}}
- from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: {{ .Values.cnpgOperatorNamespace }}
  ports:
    - port: {{ .Values.cnpgInstanceStatusPort }}
      protocol: TCP
{{- end -}}
