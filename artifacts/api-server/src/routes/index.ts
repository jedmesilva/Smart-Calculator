import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calculateRouter from "./calculate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(calculateRouter);

export default router;
