import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  // rawBody required for Stripe webhook signature verification (INT-189 / NFR-015).
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    rawBody: true,
  });
  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, "0.0.0.0");
  console.log(JSON.stringify({ msg: "payments listening", port }));
}

void bootstrap();
