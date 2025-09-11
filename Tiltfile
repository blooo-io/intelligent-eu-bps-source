# Local development stack (TD-12): same Helm charts as the target cluster, via helmfile.
# Requires: Docker, k3d, helm, helmfile. Stripe CLI and Mailpit UI are started by scripts/local-stack.mjs.
allow_k8s_contexts("k3d-intelligent-local")

load("ext://uibutton", "cmd_button")

local_resource(
    "helmfile-local",
    cmd="helmfile -e local -f deploy/helmfile/helmfile.yaml apply --skip-deps",
    deps=["deploy/"],
    labels=["deploy"],
)

# Module source live-reload lands here once services/*/ exist (INT-98+).
# Until then Tilt only keeps the local cluster charts in sync.
print("INT-136: use `node scripts/local-stack.mjs --up` to create the k3d cluster first.")
