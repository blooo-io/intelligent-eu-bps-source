# Cahier de tests — Intelligent Billing & Payment

**Produit :** Intelligent Billing & Payment  
**Environnement :** https://app.dev.intelligent-eu-bp.blooo.dev  
**IdP :** Keycloak realm `int` (thème Volt INT-332)  
**Mot de passe (tous) :** `Intelligent-UAT-2026!`  
**Communauté démo :** **Horizon Energy**  
**Tickets :** INT-282 … INT-285 · refresh captures INT-333  


> Ouvrir en aperçu Markdown (GitHub / IDE) pour voir les captures.  
> Version imprimable : [`cahier-de-tests-demo-intelligent-billing-and-payment.pdf`](./cahier-de-tests-demo-intelligent-billing-and-payment.pdf).

---

## Comment lire ce cahier

Trois parcours **sur la même communauté** Horizon Energy :

| Parcours | Persona | État seed | Objectif démo |
|---|---|---|---|
| **A — Onboarding complet** | Hugo Moreau | `Invited` (seed) | Profil → CGU → carte (wizard from scratch) |
| **B — Argent** | Léa / Thomas / Claire / Marie | Léa `TermsAccepted` ; producteurs Ready | KYC, run, factures, Pay |
| **C — Invite live** | Marie → nouvel invité | — | CSV Invite (REQ-008) → Mailpit → 1ʳᵉ connexion |

### Subtilité UI — barre latérale (INT-254)

Un **membre** (pas manager/operator) **sans statut Ready** n’a **pas de sider** : seulement le header + le contenu (« setup chrome »).  
Dès que le payment setup est Ready, le menu gauche apparaît.

Ce n’est **pas** un bug si Léa ou Hugo voient Invoices / Balances sans menu.

### Empty states vs bugs

- Message du type « No unbilled balances yet » / « No payments yet » = **état vide attendu**.  
- Un **spinner** seul = capture trop tôt ou API lente — **pas** l’écran final.

---

## Personas Horizon Energy

| Persona | Login | Rôle | État attendu au login |
|---|---|---|---|
| **Hugo Moreau** | `hugo.moreau` | Consommateur Invited | Wizard étape 1 — profil à saisir |
| **Léa Martin** | `lea.martin` | Consommatrice | Profil + CGU déjà OK ; payment à finir |
| **Thomas Bernard** | `thomas.bernard` | Producteur A | Ready (KYC fait) + sider |
| **Claire Dubois** | `claire.dubois` | Productrice B | Ready + sider |
| **Marie Leroy** | `marie.leroy` | Gestionnaire | Console manager + sider |
| **Paul Nguyen** | `paul.nguyen` | Opérateur | Operator desk (communauté UAT IdP ; outils plateforme) |

UAT (e2e uniquement, autre communauté) : `hugo.petit` / `sofia.garcia` — **ne pas utiliser pour la démo Horizon Energy**.

---

## 1. Connexion

| # | Action | Attendu | Pass |
|---|---|---|---|
| 1.1 | Ouvrir l’URL | **Intelligent Billing & Payment** (écran AC-01) | [ ] |
| 1.2 | Continue with community IdP | Keycloak Volt : titre **INTELLIGENT Billing & Payment Login** au-dessus du form centré, CTA lime | [ ] |
| 1.3 | Login + mdp | **Sign out** visible | [ ] |

![Login marque](assets/demo-workbook/00-login-brand.png)

> IdP (après Continue) : fond ink, titre lime centré au-dessus de la carte blanche — **pas** l’ancien thème PatternFly bleu / marque à droite.

---

## 2. Parcours A — Hugo Moreau (onboarding from scratch)

**Pourquoi Hugo et pas Léa :** le seed S1 pré-accepte profil/CGU pour Léa afin d’enchaîner factures/Stripe. Hugo est un **2ᵉ consommateur Invited** sur Horizon Energy (INT-285), sans toucher Léa.

### Données à saisir

| Étape | Champ | Valeur |
|---|---|---|
| Profil | Nom | `Hugo Moreau` |
| Profil | Adresse | `8 avenue Victor Hugo, 75016 Paris` |
| Profil | E-mail | `hugo.moreau@example.invalid` |
| CGU | Acceptation | cocher version affichée |
| Carte | Numéro | `4242 4242 4242 4242` |
| Carte | Exp / CVC / CP | `12/34` / `123` / `75016` |

### 2.1 Login

![Login Hugo Moreau](assets/demo-workbook/_login-hugo-moreau.png)

### 2.2 Home — Get ready (rien de pré-coché)

![Hugo — Home Invited](assets/demo-workbook/p0-hugo-moreau-01-home.png)

- [ ] Checklist : profil / terms / payment **pas** déjà verts  
- [ ] **Pas de sider** (setup chrome)  
- [ ] Communauté Horizon Energy (si affichée) ou parcours Get ready  

### 2.3 Onboarding wizard

![Hugo — Onboarding](assets/demo-workbook/p0-hugo-moreau-02-onboarding.png)

- [ ] Étape 1 Profile active, formulaire à remplir  

### 2.4 Profil

![Hugo — Profile](assets/demo-workbook/p0-hugo-moreau-03-profile.png)

- [ ] Save profile → étape Terms  

### 2.5 Terms

![Hugo — Terms](assets/demo-workbook/p0-hugo-moreau-04-terms.png)

- [ ] Accept → étape Pay  

### 2.6 Payment setup

![Hugo — Payment](assets/demo-workbook/p0-hugo-moreau-05-payment-setup.png)

- [ ] Carte enregistrée → Ready → **sider apparaît**  

**Checklist Hugo**

- [ ] Parcours Invited → Ready sans étapes déjà cochées  
- [ ] Sign out  

---

## 3. Parcours B — Léa Martin (argent / payment restant)

**État seed :** profil + CGU **déjà OK** ; seul « Complete payment setup » reste.  
Ne pas refaire le profil/CGU — ce n’est pas le parcours onboarding.

### 3.1 Login

![Login Léa](assets/demo-workbook/_login-lea-martin.png)

### 3.2 Home — deux checks verts, payment rouge

![Léa — Home](assets/demo-workbook/p1-lea-martin-01-home.png)

- [ ] **Léa Martin** / Consumer  
- [ ] Pas de sider tant que non Ready  
- [ ] CTA Finish payment setup  

### 3.3 Onboarding (raccourci payment)

![Léa — Onboarding](assets/demo-workbook/p1-lea-martin-02-onboarding.png)

### 3.4 Payment setup

| Champ | Valeur |
|---|---|
| Carte | `4242 4242 4242 4242` |
| Exp / CVC | `12/34` / `123` |

![Léa — Payment](assets/demo-workbook/p1-lea-martin-03-payment-setup.png)

- [ ] Payment method ready  

### 3.5 Balances (empty state possible)

![Léa — Balances](assets/demo-workbook/p1-lea-martin-04-balances.png)

> Si « No unbilled balances yet » après un run qui a tout facturé → **normal**.

### 3.6 Factures / PDF / Pay

![Léa — Invoices](assets/demo-workbook/p1-lea-martin-05-invoices.png)

- [ ] Factures Open (après run Marie) ≈ 2,00 € et 2,64 €  
- [ ] Sans sider si encore non Ready ; avec sider une fois Ready  
- [ ] Open PDF — **pas de frais réseau** (A20)  
- [ ] Pay → Paid  

### 3.7 Privacy

![Léa — Privacy](assets/demo-workbook/p1-lea-martin-06-privacy.png)

### 3.8 My history

![Léa — Reports](assets/demo-workbook/p1-lea-martin-07-reports.png)

**Checklist Léa**

- [ ] Payment setup (seul step manquant au seed)  
- [ ] Factures + PDF + Pay  
- [ ] Privacy  

---

## 4. Thomas Bernard — Producteur A (KYC)

Ready → **sider visible**.

### KYC Stripe test

| Champ | Valeur |
|---|---|
| Business type | Individual |
| URL | `https://accessible.stripe.com` |
| MCC | `5734` |
| First / Last | `Thomas` / `Bernard` |
| Email | `thomas.bernard@example.invalid` |
| Phone | `+33600000001` |
| DOB | `1` / `1` / `1902` |
| Address / City / CP | `address_full_match` / `Paris` / `75002` |
| Identity file | `file_identity_document_success` |
| IBAN | `FR1420041010050500013M02606` |
| Agreement | coché |

![Login Thomas](assets/demo-workbook/_login-thomas-bernard.png)

![Thomas — Home](assets/demo-workbook/p2-thomas-bernard-01-home.png)

![Thomas — Payout](assets/demo-workbook/p2-thomas-bernard-02-payment-setup.png)

![Thomas — Invoices](assets/demo-workbook/p2-thomas-bernard-03-invoices.png)

![Thomas — Reports](assets/demo-workbook/p2-thomas-bernard-04-reports.png)

- [ ] KYC OK ; sider présent ; factures vendeur  

---

## 5. Claire Dubois — Productrice B

Même KYC avec Claire / Dubois / `claire.dubois@example.invalid` / `+33600000002`.

![Login Claire](assets/demo-workbook/_login-claire-dubois.png)

![Claire — Home](assets/demo-workbook/p3-claire-dubois-01-home.png)

![Claire — Payout](assets/demo-workbook/p3-claire-dubois-02-payment-setup.png)

- [ ] KYC Claire OK  

---

## 6. Marie Leroy — Gestionnaire

Titre Home = **Community pulse** (pas seulement « Home »).

### 6.1 Login / Home

![Login Marie](assets/demo-workbook/_login-marie-leroy.png)

![Marie — Community pulse](assets/demo-workbook/p4-marie-leroy-01-home.png)

- [ ] Marie Leroy / Manager / Horizon Energy + sider  

### 6.2 Community settings (formulaire chargé)

![Marie — Settings](assets/demo-workbook/p4-marie-leroy-02-community-settings.png)

- [ ] Formulaire currency / period / threshold / VAT visible (**pas** un spinner)  

### 6.3 Members

![Marie — Members](assets/demo-workbook/p4-marie-leroy-03-participants.png)

- [ ] Léa, Thomas, Claire, Marie, **Hugo Moreau** listés par nom  

### 6.4 Billing runs — Early

| Champ | Valeur |
|---|---|
| Type | Early |
| Period | vide |

![Marie — Billing runs](assets/demo-workbook/p4-marie-leroy-04-billing-runs.png)

- [ ] Start run → **completed**  

### 6.5 Payments overview

![Marie — Payments](assets/demo-workbook/p4-marie-leroy-05-payments-overview.png)

> « No payments yet » / compteurs à 0 = empty state **OK** tant qu’aucun Pay Léa.  
> Spinner seul = capture invalide.

### 6.6 Reports

![Marie — Reports](assets/demo-workbook/p4-marie-leroy-06-reports.png)

---

## 7. Parcours C — Invite CSV (Marie → nouvel invité)

**REQ-008 / UAT-008.** La manager crée un compte IdP + envoie l’invitation ; le membre complète ensuite le même wizard que Hugo (parcours A).

### Prérequis

- Connexion **Marie Leroy** (`marie.leroy`)
- Accès Mailpit (catcher SMTP du cluster) pour lire le mail d’invitation :
  `kubectl -n int-apps port-forward svc/mailpit 8025:8025` puis http://127.0.0.1:8025
- E-mail **unique** (ne pas réutiliser un login déjà seedé)

### Données CSV (exemple)

Coller dans **Members → Invite (CSV)** (colonnes : `email,marketActorId,meterId,role`) :

```text
email,marketActorId,meterId,role
camille.rousseau@example.invalid,actor-camille-demo,meter-camille-demo,consumer
```

| Champ | Valeur démo |
|---|---|
| email | `camille.rousseau@example.invalid` (ou autre unused) |
| marketActorId | `actor-camille-demo` (unique) |
| meterId | `meter-camille-demo` (unique) |
| role | `consumer` (ou `producer` / `prosumer`) |

### Étapes

| # | Action | Attendu | Pass |
|---|---|---|---|
| C.1 | Marie → **Members** | Liste (Léa, Thomas, Claire, Marie, Hugo…) | [ ] |
| C.2 | Coller le CSV + **Invite member** | Message import OK ; nouvelle ligne **Invited** | [ ] |
| C.3 | Ouvrir Mailpit | Mail Keycloak (VERIFY_EMAIL / UPDATE_PASSWORD) vers l’e-mail CSV | [ ] |
| C.4 | Suivre le lien → définir mot de passe | Compte utilisable | [ ] |
| C.5 | Login app avec le nouvel e-mail | Home Invited / wizard (pas de sider — INT-254) | [ ] |
| C.6 | Profil → CGU → carte test | Ready + sider (comme parcours A) | [ ] |

**Points de contrôle IdP (INT-285)** — après invite, le user Keycloak doit avoir :

- attribut `community_id` = `c0ffee00-1234-4abc-8def-0123456789ab` (Horizon Energy)
- realm role `member` (pas le rôle marché consumer/producer — celui-ci reste dans le registry)

> En démo courte : s’arrêter à C.2–C.3 si le temps manque ; C.5–C.6 = rejoue A avec un compte créé live.

---

## 8. Paul Nguyen — Opérateur

![Login Paul](assets/demo-workbook/_login-paul-nguyen.png)

![Paul — Home](assets/demo-workbook/p5-paul-nguyen-01-home.png)

![Paul — Operator desk](assets/demo-workbook/p5-paul-nguyen-02-operator.png)

- [ ] Menu **Operator desk** ; jobs / anomalies visibles (pas spinner)  
- [ ] Membre Horizon Energy **ne voit pas** ce menu  

![Paul — Reports](assets/demo-workbook/p5-paul-nguyen-03-reports.png)

---

## 9. Ordre démo recommandé (25–35 min)

1. **Hugo** — onboarding Invited → Ready (§2)  
2. **Thomas** + **Claire** — KYC si besoin (§4–5)  
3. **Marie** — Settings coup d’œil + Early run (§6)  
4. **Léa** — payment si besoin → Invoices → PDF → Pay (§3)  
5. **Marie** — Payments overview (§6.5)  
6. **Marie** — Invite CSV + Mailpit (§7, parcours C) — optionnel si temps  
7. **Paul** — Operator desk (§8)  

---

## 10. Référence métier

| Élément | Valeur |
|---|---|
| Community | Horizon Energy (`c0ffee00-1234-4abc-8def-0123456789ab`) |
| Léa participantId | `11111111-2222-4333-8444-555555555555` |
| Hugo Invited participantId | `e1000000-0000-4000-8000-000000000001` |
| Trades démo | `0x8f3a…` (~€2,00) / `0x1a2b…` (~€2,64) |
| Invite CSV | Members → Invite (CSV) ; mail dans Mailpit (`svc/mailpit`) |

---

## 11. Pass / Fail global

| Zone | Pass si… |
|---|---|
| Onboarding | Hugo part de Invited, aucune case déjà verte |
| Argent | Léa paie des factures Open après run Marie |
| Invite | CSV → ligne Invited + mail Mailpit + `community_id` IdP |
| Setup chrome | Pas de sider avant Ready ; sider après |
| IdP Volt | Titre **INTELLIGENT Billing & Payment Login** au-dessus du form centré (CTA lime) |
| Captures | Pas de spinner présenté comme écran final |
| Members | Noms humains dont Hugo Moreau |

---

## 12. Fichiers

| Fichier | Rôle |
|---|---|
| [`README.md`](./README.md) | Index |
| [`assets/demo-workbook/`](./assets/demo-workbook/) | PNG |
| `scripts/capture-demo-workbook.mjs` | Recapture (`wait` anti-spinner) — INT-333 |
| `scripts/export-cahier-pdf.mjs` | Régénération PDF A4 — INT-333 |
| [`manual-s1-portal-journey.md`](./manual-s1-portal-journey.md) | Parcours argent (texte) |
