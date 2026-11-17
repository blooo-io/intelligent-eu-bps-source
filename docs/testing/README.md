# Testing docs

## Cahier de tests démo (testeurs)

**Document principal pour la démo live :**

→ [`cahier-de-tests-demo-intelligent-billing-and-payment.md`](./cahier-de-tests-demo-intelligent-billing-and-payment.md)  
→ PDF : [`cahier-de-tests-demo-intelligent-billing-and-payment.pdf`](./cahier-de-tests-demo-intelligent-billing-and-payment.pdf)

Contient **tous les personas Horizon Energy** (Hugo Moreau onboarding Invited, Léa argent, Thomas/Claire KYC, Marie, Paul), le **parcours C Invite CSV** (REQ-008 / Mailpit), les données à saisir, les cases Pass/Fail, **tous les écrans en capture** (`assets/demo-workbook/`), et pour chaque scénario l’appel API direct avec le JSON déjà rempli (INT-398). Captures rafraîchies INT-399 : chaque écran connecté montre le lien **API**, et chaque persona a une capture de `/api`. `node scripts/capture-demo-workbook.mjs` puis `node scripts/export-cahier-pdf.mjs`.

| Document | Usage |
|---|---|
| [Cahier démo (personas + écrans)](./cahier-de-tests-demo-intelligent-billing-and-payment.md) | Support testeurs / démo |
| [Manual S1 portal journey](./manual-s1-portal-journey.md) | Parcours argent S1 (complément) |
| [V1 UAT package](./v1-uat-package.md) | Pack UAT / comptes |
| [AC-01 e2e](./ac01-e2e.md) | Playwright déployé |
