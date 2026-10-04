import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/learning", learningRouter);

export default router;
