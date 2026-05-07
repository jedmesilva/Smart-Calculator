import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calculateRouter from "./calculate";
import formulasRouter from "./formulas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(calculateRouter);
router.use("/formulas", formulasRouter);

export default router;
