import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    package: "@gamejam/server"
  });
});

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
