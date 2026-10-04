import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({limit:"4mb"}));

app.use("/api", router);

const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  const status=error?.type==="entity.too.large"?413:error instanceof SyntaxError?400:500;
  res.status(status).json({error:status===413?"تجاوز الطلب حد الحجم المسموح.":status===400?"صيغة الطلب غير صالحة.":"تعذرت معالجة الطلب."});
};
app.use(errors);

export default app;
