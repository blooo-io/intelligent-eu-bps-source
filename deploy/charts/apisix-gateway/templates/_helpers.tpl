{{- /*
  INT-187 / TD-8 — CORS for the Refine SPA (app host → api host).
  Plugin priority 4000 runs before openid-connect (2599), so OPTIONS preflight
  is answered with ACAO without requiring a bearer token.
*/ -}}
{{- define "apisix-gateway.corsPlugin" -}}
- name: cors
  enable: true
  config:
    allow_origins: {{ .Values.cors.allowOrigins | quote }}
    allow_methods: {{ .Values.cors.allowMethods | quote }}
    allow_headers: {{ .Values.cors.allowHeaders | quote }}
    expose_headers: {{ .Values.cors.exposeHeaders | quote }}
    allow_credential: {{ .Values.cors.allowCredential }}
    max_age: {{ .Values.cors.maxAge }}
{{- end -}}

{{- /*
  INT-289 — baseline security response headers (SEC-03).
  Pass dict with "csp" key for Content-Security-Policy (route-specific).
*/ -}}
{{- define "apisix-gateway.securityHeadersPlugin" -}}
- name: response-rewrite
  enable: true
  config:
    headers:
      set:
        Strict-Transport-Security: {{ .Values.securityHeaders.hsts | quote }}
        X-Content-Type-Options: {{ .Values.securityHeaders.contentTypeOptions | quote }}
        X-Frame-Options: {{ .Values.securityHeaders.frameOptions | quote }}
        Referrer-Policy: {{ .Values.securityHeaders.referrerPolicy | quote }}
        Content-Security-Policy: {{ .csp | quote }}
      remove:
        - Server
{{- end -}}

{{- /*
  NFR-013 / INT-357 — dot-path of the roles array claim (default Keycloak
  realm_access.roles). Restricted charset: the value is inlined in Lua source.
*/ -}}
{{- define "apisix-gateway.roleClaim" -}}
{{- $claim := .Values.oidc.roleClaim | default "realm_access.roles" -}}
{{- if not (regexMatch "^[A-Za-z0-9_:-]+(\\.[A-Za-z0-9_:-]+)*$" $claim) -}}
{{- fail (printf "oidc.roleClaim %q must be a dot-path of [A-Za-z0-9_:-] segments" $claim) -}}
{{- end -}}
{{- $claim -}}
{{- end -}}

{{- define "apisix-gateway.oidcPlugin" -}}
{{ include "apisix-gateway.corsPlugin" . }}
{{ include "apisix-gateway.securityHeadersPlugin" (dict "Values" .Values "csp" .Values.securityHeaders.csp.api) }}
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
# INT-179 — after JWKS validation (openid-connect priority 2599 runs first in access),
# map JWT claims to the x-intelligent-* headers Nest principal middleware expects.
# serverless-pre-function priority -2000 runs later in the same phase.
- name: serverless-pre-function
  enable: true
  config:
    phase: access
    functions:
      - |
        return function(conf, ctx)
          local core = require("apisix.core")
          -- Overwrite any client-supplied principal headers (never trust the browser).
          core.request.set_header(ctx, "x-intelligent-sub", "")
          core.request.set_header(ctx, "x-intelligent-roles", "")
          core.request.set_header(ctx, "x-intelligent-community", "")
          core.request.set_header(ctx, "x-intelligent-token-use", "")
          local auth = core.request.header(ctx, "Authorization")
          if not auth then
            return
          end
          local m = ngx.re.match(auth, [[^[Bb]earer\s+(.+)$]], "jo")
          if not m then
            return
          end
          local parts = {}
          for part in string.gmatch(m[1], "[^.]+") do
            parts[#parts + 1] = part
          end
          if #parts < 2 then
            return
          end
          local b64 = parts[2]:gsub("-", "+"):gsub("_", "/")
          local pad = #b64 % 4
          if pad > 0 then
            b64 = b64 .. string.rep("=", 4 - pad)
          end
          local raw = ngx.decode_base64(b64)
          if not raw then
            return
          end
          local claims, err = core.json.decode(raw)
          if not claims then
            core.log.warn("INT-179 principal decode failed: ", err)
            return
          end
          core.request.set_header(ctx, "x-intelligent-sub", tostring(claims.sub or ""))
          local roles = {}
          local function push_roles(list)
            if type(list) ~= "table" then
              return
            end
            for _, r in ipairs(list) do
              if type(r) == "string" and r ~= "" then
                roles[#roles + 1] = r
              end
            end
          end
          -- NFR-013 / INT-357 — role claim dot-path from oidc.roleClaim.
          local role_node = claims
          for segment in string.gmatch({{ include "apisix-gateway.roleClaim" . | quote }}, "[^.]+") do
            if type(role_node) ~= "table" then
              role_node = nil
              break
            end
            role_node = role_node[segment]
          end
          push_roles(role_node)
          if type(claims.resource_access) == "table" then
            for _, client in pairs(claims.resource_access) do
              if type(client) == "table" then
                push_roles(client.roles)
              end
            end
          end
          core.request.set_header(ctx, "x-intelligent-roles", table.concat(roles, ","))
          local community = claims.community_id or claims.communityId or ""
          if type(community) == "table" then
            community = community[1] or ""
          end
          core.request.set_header(ctx, "x-intelligent-community", tostring(community))
          if claims.token_use == "service" or claims.tokenUse == "service" then
            core.request.set_header(ctx, "x-intelligent-token-use", "service")
          end
        end
# INT-327 / TD-8 — rate-limit /v1 after OIDC (kube probes hit ClusterIP /health, not APISIX).
- name: limit-req
  enable: true
  config:
    rate: {{ .Values.api.rate.rate }}
    burst: {{ .Values.api.rate.burst }}
    rejected_code: 429
    key_type: var
    key: remote_addr
{{- end -}}
