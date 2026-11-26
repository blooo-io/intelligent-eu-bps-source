import { withMermaid } from "vitepress-plugin-mermaid";

/**
 * Docs site for open-source adopters (INT-299 … INT-302, INT-401, INT-413).
 * INT-455 — public REST OpenAPI browser withdrawn; EWDS integration docs remain.
 */
const base = (process.env.DOCS_BASE || "/").replace(/\/?$/, "/") || "/";

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
    /^https:\/\/docs\.intelligent-eu-bp\.blooo\.dev/,
  ],
  head: [
    ["meta", { name: "theme-color", content: "#1a4d3e" }],
    [
      "meta",
      {
        name: "homepage",
        content: "https://github.com/blooo-io/intelligent-eu-bps-source",
      },
    ],
  ],
  mermaid: {
    securityLevel: "loose",
  },
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Billing & Payment",
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Deploy", link: "/guide/deploy" },
      {
        text: "Architecture",
        items: [
          { text: "Overview", link: "/architecture/" },
          { text: "Functional", link: "/architecture/01-functional-architecture" },
          { text: "Logical", link: "/architecture/02-logical-architecture" },
          { text: "Application", link: "/architecture/03-application-architecture" },
          { text: "Technical", link: "/architecture/04-technical-architecture" },
          { text: "Physical", link: "/architecture/05-physical-architecture" },
          { text: "Ontology datamodel", link: "/architecture/06-datamodel-ontology" },
          { text: "Scenario flows", link: "/architecture/07-scenario-flows" },
          { text: "EWDS Client Gateway", link: "/architecture/ewds-client-gateway" },
        ],
      },
      { text: "Reference", link: "/reference/modules" },
      {
        text: "API",
        items: [
          { text: "API overview (EWDS)", link: "/api/" },
          { text: "API & events (notes)", link: "/reference/api" },
        ],
      },
      {
        text: "GitHub",
        link: "https://github.com/blooo-io/intelligent-eu-bps-source",
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
      "/architecture/": [
        {
          text: "Architecture",
          items: [
            { text: "Overview", link: "/architecture/" },
            {
              text: "1. Functional",
              link: "/architecture/01-functional-architecture",
            },
            {
              text: "2. Logical",
              link: "/architecture/02-logical-architecture",
            },
            {
              text: "3. Application",
              link: "/architecture/03-application-architecture",
            },
            {
              text: "4. Technical",
              link: "/architecture/04-technical-architecture",
            },
            {
              text: "5. Physical",
              link: "/architecture/05-physical-architecture",
            },
            {
              text: "6. Ontology datamodel",
              link: "/architecture/06-datamodel-ontology",
            },
            {
              text: "7. Scenario flows",
              link: "/architecture/07-scenario-flows",
            },
            {
              text: "EWDS Client Gateway",
              link: "/architecture/ewds-client-gateway",
            },
            { text: "EWDS topic schemas", link: "/architecture/ewds-topics" },
          ],
        },
        {
          text: "Also on this site",
          items: [
            { text: "Modules map", link: "/reference/modules" },
            { text: "Architecture digest", link: "/reference/architecture" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Architecture digest", link: "/reference/architecture" },
            { text: "Full architecture views", link: "/architecture/" },
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
            { text: "Overview (INT-455)", link: "/api/" },
            { text: "Narrative notes", link: "/reference/api" },
          ],
        },
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
        link: "https://github.com/blooo-io/intelligent-eu-bps-source",
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
        "https://github.com/blooo-io/intelligent-eu-bps-source/edit/develop/apps/site/:path",
      text: "Edit this page",
    },
  },
});