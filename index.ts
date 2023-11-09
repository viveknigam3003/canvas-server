import cors from "cors";
import express from "express";
import DownloadRouter from "./modules/download/routes";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/download", DownloadRouter);

app.listen(port, () => {
  console.info(`[INFO] Server Started on PORT: ${port}`);
});
