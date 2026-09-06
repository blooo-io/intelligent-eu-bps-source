import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, "0.0.0.0");
  console.log(JSON.stringify({ msg: "reporting listening", port }));
}

await bootstrap();
