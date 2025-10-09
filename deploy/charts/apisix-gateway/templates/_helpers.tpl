{{- define "apisix-gateway.oidcPlugin" -}}
- name: openid-connect
  enable: true
  config:
    client_id: {{ .Values.oidc.clientId | quote }}
    discovery: {{ printf "https://%s/realms/%s/.well-known/openid-configuration" .Values.oidc.discoveryHost .Values.oidc.realm | quote }}
    bearer_only: {{ .Values.oidc.bearerOnly }}
    realm: {{ .Values.oidc.realm | quote }}
    use_jwks: true
    # V1 virtual: Keycloak may present a cluster/self-signed chain until cert-manager TLS lands.
    ssl_verify: false
{{- end -}}
