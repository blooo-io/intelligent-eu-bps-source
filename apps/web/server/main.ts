import { listen, resolvePort } from "./static-server.js";

// Production entry for the apps-web image (GET /health on PORT).
const port = resolvePort();
listen(port);
console.log(JSON.stringify({ msg: "web listening", port }));
