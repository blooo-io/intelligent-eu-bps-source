import { listen, resolvePort } from "./static-server.js";

const port = resolvePort();
listen(port);
console.log(JSON.stringify({ msg: "docs-portal listening", port }));
