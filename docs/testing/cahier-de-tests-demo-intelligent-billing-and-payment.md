# Cahier de tests — Intelligent Billing & Payment

**Produit :** Intelligent Billing & Payment  
**Environnement :** https://app.dev.intelligent-eu-bp.blooo.dev  
**IdP :** Keycloak realm `int`  
**Mot de passe (tous les comptes) :** `Intelligent-UAT-2026!`  
**Communauté démo :** **Horizon Energy**  
**Public :** testeurs / support démo  
**Tickets :** INT-282 / INT-283 / INT-284  

> Ouvrir ce fichier sur GitHub (`develop`) ou dans l’IDE en mode aperçu Markdown pour voir **toutes les captures** ci-dessous.

---

## Personas (accès)

| Persona | Rôle | Login | E-mail |
|---|---|---|---|
| **Léa Martin** | Consommatrice | `lea.martin` | `lea.martin@example.invalid` |
| **Thomas Bernard** | Producteur A | `thomas.bernard` | `thomas.bernard@example.invalid` |
| **Claire Dubois** | Productrice B | `claire.dubois` | `claire.dubois@example.invalid` |
| **Marie Leroy** | Gestionnaire | `marie.leroy` | `marie.leroy@example.invalid` |
| **Paul Nguyen** | Opérateur | `paul.nguyen` | `paul.nguyen@example.invalid` |

Comptes UAT (onboarding from Invited) : `hugo.petit` / `sofia.garcia` — même mot de passe.

**Convention :** une fenêtre privée (ou **Sign out**) par persona.

---

## 1. Connexion (commun)

| # | Action | Attendu | Pass |
|---|---|---|---|
| 1.1 | Ouvrir l’URL | Marque **Intelligent Billing & Payment** | [ ] |
| 1.2 | **Continue with community IdP** | Formulaire Keycloak | [ ] |
| 1.3 | Login persona + mdp | App authentifiée, **Sign out** visible | [ ] |

### Écran — Login marque

![Login Intelligent Billing & Payment](assets/demo-workbook/00-login-brand.png)

---

## 2. Léa Martin — Consommatrice

**Parcours :** login → home / onboarding → profil → CGU → carte → soldes → factures → privacy → historique.

| Champ carte Stripe (test) | Valeur |
|---|---|
| Numéro | `4242 4242 4242 4242` |
| Expiration | `12/34` |
| CVC | `123` |
| CP | `75002` |

### 2.1 Login Keycloak

![Login Léa Martin](assets/demo-workbook/_login-lea-martin.png)

### 2.2 Home

![Léa — Home](assets/demo-workbook/p1-lea-martin-01-home.png)

- [ ] Nom **Léa Martin**, badge Consumer (ou Member)  
- [ ] Communauté **Horizon Energy** (si affichée)  

### 2.3 Onboarding

![Léa — Onboarding](assets/demo-workbook/p1-lea-martin-02-onboarding.png)

### 2.4 Profil

| Champ | Valeur |
|---|---|
| Nom | `Léa Martin` |
| Adresse | `12 rue de la Paix, 75002 Paris` |
| E-mail | `lea.martin@example.invalid` |

![Léa — Profil](assets/demo-workbook/p1-lea-martin-03-profile.png)

### 2.5 CGU / Terms

![Léa — Terms](assets/demo-workbook/p1-lea-martin-04-terms.png)

- [ ] Acceptation CGU OK  

### 2.6 Moyen de paiement

![Léa — Payment setup](assets/demo-workbook/p1-lea-martin-05-payment-setup.png)

- [ ] Carte test enregistrée / statut prêt  

### 2.7 Soldes

![Léa — Balances](assets/demo-workbook/p1-lea-martin-06-balances.png)

### 2.8 Factures (PDF / Pay)

![Léa — Invoices](assets/demo-workbook/p1-lea-martin-07-invoices.png)

- [ ] Factures Open après run Marie  
- [ ] **Open PDF** sans frais réseau (A20)  
- [ ] **Pay** → Paid  

### 2.9 Privacy

![Léa — Privacy](assets/demo-workbook/p1-lea-martin-08-privacy.png)

### 2.10 My history

![Léa — Reports](assets/demo-workbook/p1-lea-martin-09-reports.png)

**Checklist Léa**

- [ ] Login `lea.martin`  
- [ ] Onboarding / profil / CGU / carte  
- [ ] Factures + PDF + Pay  
- [ ] Privacy  

---

## 3. Thomas Bernard — Producteur A (KYC)

**Parcours :** login → home → payout / KYC Connect → factures émises → historique.

### Données KYC Stripe Connect (test)

| Champ | Valeur |
|---|---|
| Business type | `Individual` |
| Business profile URL | `https://accessible.stripe.com` |
| MCC | `5734` |
| First name | `Thomas` |
| Last name | `Bernard` |
| Email | `thomas.bernard@example.invalid` |
| Phone | `+33600000001` |
| DOB | `1` / `1` / `1902` |
| Address | `address_full_match` |
| City / CP / Country | `Paris` / `75002` / `FR` |
| Identity file id | `file_identity_document_success` |
| IBAN | `FR1420041010050500013M02606` |
| Agreement | **coché** |

### 3.1 Login

![Login Thomas Bernard](assets/demo-workbook/_login-thomas-bernard.png)

### 3.2 Home

![Thomas — Home](assets/demo-workbook/p2-thomas-bernard-01-home.png)

- [ ] **Thomas Bernard**, badge Producer, **Horizon Energy**  

### 3.3 Payout / KYC

![Thomas — Payment setup](assets/demo-workbook/p2-thomas-bernard-02-payment-setup.png)

- [ ] KYC soumis sans erreur ; compte prêt ou pending puis ready  

### 3.4 Factures émises

![Thomas — Invoices](assets/demo-workbook/p2-thomas-bernard-03-invoices.png)

### 3.5 My history

![Thomas — Reports](assets/demo-workbook/p2-thomas-bernard-04-reports.png)

---

## 4. Claire Dubois — Productrice B (KYC)

Même KYC que Thomas avec :

| Champ | Valeur |
|---|---|
| Login | `claire.dubois` |
| First / Last | `Claire` / `Dubois` |
| Email | `claire.dubois@example.invalid` |
| Phone | `+33600000002` |

### 4.1 Login

![Login Claire Dubois](assets/demo-workbook/_login-claire-dubois.png)

### 4.2 Home

![Claire — Home](assets/demo-workbook/p3-claire-dubois-01-home.png)

### 4.3 Payout / KYC

![Claire — Payment setup](assets/demo-workbook/p3-claire-dubois-02-payment-setup.png)

- [ ] KYC Claire OK  
- [ ] Sign out  

---

## 5. Marie Leroy — Gestionnaire

**Parcours :** login → home → settings → members → billing run → payments → reports.

| Action billing run | Valeur |
|---|---|
| Type | **Early** |
| Period | vide |

### 5.1 Login

![Login Marie Leroy](assets/demo-workbook/_login-marie-leroy.png)

### 5.2 Home (console manager)

![Marie — Home](assets/demo-workbook/p4-marie-leroy-01-home.png)

- [ ] **Marie Leroy**, badge Manager, **Horizon Energy**  

### 5.3 Community settings

![Marie — Settings](assets/demo-workbook/p4-marie-leroy-02-community-settings.png)

- [ ] Paramètres communauté visibles / sauvegardables  

### 5.4 Members

![Marie — Members](assets/demo-workbook/p4-marie-leroy-03-participants.png)

- [ ] Léa, Thomas, Claire, Marie listés **par nom** (pas d’UUID en colonne principale)  

### 5.5 Billing runs

![Marie — Billing runs](assets/demo-workbook/p4-marie-leroy-04-billing-runs.png)

- [ ] Early **Start run** → status **completed**  

### 5.6 Payments overview

![Marie — Payments](assets/demo-workbook/p4-marie-leroy-05-payments-overview.png)

### 5.7 Community reports

![Marie — Reports](assets/demo-workbook/p4-marie-leroy-06-reports.png)

**Checklist Marie**

- [ ] Settings / Members / Early run / Payments  

---

## 6. Paul Nguyen — Opérateur

**Parcours :** login → home → operator tools → reports.

### 6.1 Login

![Login Paul Nguyen](assets/demo-workbook/_login-paul-nguyen.png)

### 6.2 Home

![Paul — Home](assets/demo-workbook/p5-paul-nguyen-01-home.png)

- [ ] **Paul Nguyen**, badge Operator  
- [ ] Pas de menus manager membres  

### 6.3 Operator desk

![Paul — Operator](assets/demo-workbook/p5-paul-nguyen-02-operator.png)

- [ ] Jobs / anomalies / reconciliation visibles  
- [ ] Léa **ne voit pas** Operator tools  

### 6.4 Reports

![Paul — Reports](assets/demo-workbook/p5-paul-nguyen-03-reports.png)

---

## 7. Ordre démo recommandé (15–25 min)

1. **Thomas** + **Claire** — KYC payout (§3–4)  
2. **Marie** — Early billing run (§5.5)  
3. **Léa** — carte si besoin → Invoices → PDF → Pay (§2)  
4. **Marie** — Payments overview (§5.6)  
5. **Paul** — Operator (§6)  
6. **Léa** — Privacy (§2.9)  

---

## 8. Données métier S1 (référence)

| Élément | Valeur |
|---|---|
| Community | Horizon Energy (`c0ffee00-1234-4abc-8def-0123456789ab`) |
| Consumer participantId | `11111111-2222-4333-8444-555555555555` |
| Producer A | `66666666-7777-4888-9999-aaaaaaaaaaaa` |
| Producer B | `bbbbbbbb-cccc-4ddd-8eee-ffffffffffff` |
| Manager | `dddddddd-eeee-4fff-8000-111111111111` |
| Trade A / B | `0x8f3a…` (~€2,00) / `0x1a2b…` (~€2,64) |

---

## 9. Pass / Fail global

| Zone | Pass si… |
|---|---|
| Marque | Intelligent Billing & Payment |
| Identités | Logins `prénom.nom`, noms cohérents |
| Producteurs | KYC Thomas + Claire OK |
| Manager | Early run completed, Members par nom |
| Consommatrice | Factures, PDF, Pay, sans frais réseau |
| Opérateur | Operator tools pour Paul seulement |

---

## 10. Fichiers liés

| Fichier | Rôle |
|---|---|
| [`docs/testing/README.md`](./README.md) | Index testing |
| [`assets/demo-workbook/`](./assets/demo-workbook/) | PNG sources |
| [`manual-s1-portal-journey.md`](./manual-s1-portal-journey.md) | Parcours argent S1 (texte) |
| `scripts/capture-demo-workbook.mjs` | Recapture des écrans |
