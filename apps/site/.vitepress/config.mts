import { withMermaid } from "vitepress-plugin-mermaid";
import { useSidebar } from "vitepress-openapi";
// Prepared by scripts/build-openapi.mjs before vitepress (INT-302).
import spec from "../public/openapi/public.v1.json" with { type: "json" };

/**
 * Docs site for open-source adopters (INT-299 … INT-302).
 * Private GitHub Pages uses a unique host at site root → base "/".
 * When the repo is public, set DOCS_BASE=/intelligent-eu-billing-and-payment/
 * so assets resolve under https://<org>.github.io/<repo>/.
 * OpenAPI UI: vitepress-openapi (Vue pages under /api/).
 */
const base = (process.env.DOCS_BASE || "/").replace(/\/?$/, "/") || "/";

const openapiSidebar = useSidebar({
  spec,
  linkPrefix: "/api/operations/",
});

export default withMermaid({
  title: "INTELLIGENT Billing & Payment",
  description:
    "Open-source peer-to-peer energy billing and payment service (Horizon Europe INTELLIGENT, T5.6 / D5.5). Deploy it on your own infrastructure.",
  lang: "en-US",
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [
    /^https?:\/\/localhost/,
    // Upstream sample Redoc portal (optional); may be offline in link checks.
    /^https:\/\/docs\.intelligent-eu-bp\.blooo\.dev/,
  ],
  head: [
    ["meta", { name: "theme-color", content: "#1a4d3e" }],
    [
      "meta",
      {
        name: "homepage",
        content:
          "https://github.com/blooo-io/intelligent-eu-billing-and-payment",
      },
    ],
  ],
  // Client-side Mermaid (MIT) via vitepress-plugin-mermaid — INT-300.
  mermaid: {
    securityLevel: "loose",
  },
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Billing & Payment",
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Deploy", link: "/guide/deploy" },
      { text: "Reference", link: "/reference/architecture" },
      {
        text: "API",
        items: [
          { text: "API overview", link: "/api/" },
          { text: "API & events (notes)", link: "/reference/api" },
          { text: "public.v1.yaml", link: "/openapi/public.v1.yaml" },
        ],
      },
      {
        text: "GitHub",
        link: "https://github.com/blooo-io/intelligent-eu-billing-and-payment",
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "What you get", link: "/guide/what-you-get" },
            { text: "Quick start (local)", link: "/guide/quick-start" },
          ],
        },
        {
          text: "Operate your own instance",
          items: [
            { text: "Deploy on Kubernetes", link: "/guide/deploy" },
            { text: "Configuration", link: "/guide/configuration" },
            { text: "Adapters & integrations", link: "/guide/adapters" },
            { text: "Security & secrets", link: "/guide/security" },
            { text: "Docs hosting & URL", link: "/guide/docs-hosting" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Architecture", link: "/reference/architecture" },
            { text: "Modules", link: "/reference/modules" },
            { text: "API & events", link: "/reference/api" },
            { text: "Source documentation", link: "/reference/source-docs" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "Narrative notes", link: "/reference/api" },
            { text: "Raw OpenAPI YAML", link: "/openapi/public.v1.yaml" },
          ],
        },
        ...openapiSidebar
          .generateSidebarGroups({ linkPrefix: "/api/operations/" })
          .map((group) => ({
            ...group,
            collapsed: true,
          })),
      ],
      "/contribute/": [
        {
          text: "Contribute",
          items: [
            { text: "How to contribute", link: "/contribute/" },
            { text: "Development", link: "/contribute/development" },
            {
              text: "Upstream maintainers",
              link: "/contribute/upstream-maintainers",
            },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/blooo-io/intelligent-eu-billing-and-payment",
      },
    ],
    footer: {
      message:
        "Horizon Europe INTELLIGENT (GA 101160678) · Task T5.6 · Deliverable D5.5",
      copyright: "Apache License 2.0",
    },
    search: { provider: "local" },
    editLink: {
      pattern:
        "https://github.com/blooo-io/intelligent-eu-billing-and-payment/edit/develop/apps/site/:path",
      text: "Edit this page",
    },
  },
});
