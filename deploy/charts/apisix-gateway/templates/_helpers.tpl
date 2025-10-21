{{- define "apisix-gateway.oidcPlugin" -}}
- name: openid-connect
  enable: true
  # INT-169 — client_secret comes from ExternalSecret (OpenBao); APISIX requires the field.
  secretRef: {{ .Values.oidc.secretName | quote }}
  config:
    client_id: {{ .Values.oidc.clientId | quote }}
    discovery: {{ printf "https://%s/realms/%s/.well-known/openid-configuration" .Values.oidc.discoveryHost .Values.oidc.realm | quote }}
    bearer_only: {{ .Values.oidc.bearerOnly }}
    realm: {{ .Values.oidc.realm | quote }}
    use_jwks: true
    ssl_verify: {{ .Values.oidc.sslVerify }}
{{- end -}}
