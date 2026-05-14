import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calculateRouter from "./calculate";
import preanalyzeRouter from "./preanalyze";
import formulasRouter from "./formulas";
import sessionsRouter from "./sessions";
import usersRouter from "./users";
import creditsRouter from "./credits";
import calculationsRouter from "./calculations";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(calculateRouter);
router.use(preanalyzeRouter);
router.use("/formulas", formulasRouter);
router.use("/sessions", sessionsRouter);
router.use("/users", usersRouter);
router.use(creditsRouter);
router.use(calculationsRouter);
router.use(exportRouter);

export default router;
